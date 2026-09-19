import { request as httpRequest } from "node:http";
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, rmdir, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createReadStream } from "node:fs";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import type {
  ImageGenerationProvider,
  ImageProviderIdentity,
} from "../../application/ports/image-generation-provider";
import type { ImageGenerationRequest } from "../../domain/image-generation";
import { VisualResolutionError } from "../../domain/visual-plan";
import { ComfyConfigSchema, type ComfyConfig } from "./comfy-config";
import {
  buildComfyWorkflow,
  generationParameters,
  workflowVersion,
} from "./comfy-workflow";

const queues = new Map<string, Promise<unknown>>();
const generations = new Map<string, number>();
async function exclusive<T>(
  key: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(operation);
  queues.set(key, current);
  try {
    return await current;
  } finally {
    if (queues.get(key) === current) queues.delete(key);
  }
}
const statsSchema = z.object({
  system: z.object({ comfyui_version: z.string() }),
});
const queueSchema = z.object({
  queue_running: z.array(z.array(z.unknown())),
  queue_pending: z.array(z.array(z.unknown())),
});
const historySchema = z.object({
  status: z.object({
    completed: z.boolean(),
    status_str: z.string(),
    messages: z.array(z.tuple([z.string(), z.unknown()])),
  }),
  outputs: z.record(z.string(), z.unknown()),
});
const outputSchema = z.object({
  images: z
    .array(
      z.object({
        filename: z.string(),
        subfolder: z.string(),
        type: z.literal("output"),
      }),
    )
    .length(1),
});
export class ComfyUIImageProvider implements ImageGenerationProvider {
  readonly config: ComfyConfig;
  readonly timeoutMs: number;
  readonly metrics: Array<Record<string, unknown>> = [];
  private child?: ChildProcess;
  private verified = false;
  private lockOwned = false;
  private readonly lock: string;
  private closed = false;
  constructor(config: ComfyConfig) {
    this.config = ComfyConfigSchema.parse(config);
    this.timeoutMs =
      config.startupTimeoutMs + config.generationTimeoutMs + 30000;
    this.lock = resolve(
      tmpdir(),
      `reelmaster-comfy-${createHash("sha256").update(this.config.baseUrl).digest("hex").slice(0, 20)}.lock`,
    );
  }
  capability() {
    return {
      status: "available",
      execution: "local",
      maxPixels: 393216,
    } as const;
  }
  identity(): ImageProviderIdentity {
    return {
      runtimeId: "ComfyUI",
      runtimeVersion: this.config.runtimeVersion,
      modelId: this.config.checkpoint,
      modelHash: this.config.checkpointHash,
      testOnly: false,
      recipe: {
        workflowVersion,
        runtimeCommit: this.config.runtimeCommit,
        steps: 2,
        cfg: 1,
        sampler: "euler",
        scheduler: "sgm_uniform",
      },
    };
  }
  private async http(
    path: string,
    signal: AbortSignal,
    body?: unknown,
    maxBytes = 2 * 1024 * 1024,
  ): Promise<Buffer> {
    const data =
      body === undefined ? undefined : Buffer.from(JSON.stringify(body));
    return new Promise((accept, reject) => {
      const req = httpRequest(
        `${this.config.baseUrl}${path}`,
        {
          method: data ? "POST" : "GET",
          signal,
          headers: data
            ? {
                "Content-Type": "application/json",
                "Content-Length": data.length,
              }
            : {},
        },
        (res) => {
          if (
            !res.statusCode ||
            res.statusCode < 200 ||
            res.statusCode >= 300
          ) {
            res.resume();
            reject(
              new VisualResolutionError(
                "WORKFLOW_REJECTED",
                `Local API rejected ${path.split("?")[0]} (${res.statusCode}); redirects are forbidden`,
              ),
            );
            return;
          }
          let size = 0;
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > maxBytes)
              res.destroy(
                new VisualResolutionError(
                  "INVALID_OUTPUT",
                  "Local API output exceeds size limit",
                ),
              );
            else chunks.push(chunk);
          });
          res.on("end", () => accept(Buffer.concat(chunks)));
          res.on("error", reject);
        },
      );
      req.on("error", reject);
      req.setTimeout(10000, () =>
        req.destroy(
          new VisualResolutionError("TIMEOUT", "Local API socket timed out"),
        ),
      );
      req.end(data);
    });
  }
  private async json(
    path: string,
    signal: AbortSignal,
    body?: unknown,
  ): Promise<unknown> {
    return JSON.parse((await this.http(path, signal, body)).toString("utf8"));
  }
  private async available(signal: AbortSignal) {
    try {
      const stats = statsSchema.parse(await this.json("/system_stats", signal));
      if (stats.system.comfyui_version !== this.config.runtimeVersion)
        throw new VisualResolutionError(
          "UNAVAILABLE",
          "Local backend version differs from the verified installation",
        );
      return true;
    } catch (error) {
      if (
        signal.aborted ||
        error instanceof VisualResolutionError ||
        error instanceof z.ZodError
      )
        throw error;
      if ((error as NodeJS.ErrnoException).code === "ECONNREFUSED")
        return false;
      throw error;
    }
  }
  private async acquireLock() {
    if (this.lockOwned) return;
    try {
      await mkdir(this.lock);
    } catch {
      throw new VisualResolutionError(
        "UNAVAILABLE",
        "Another ReelMaster batch owns this endpoint, or its lock needs manual recovery",
      );
    }
    this.lockOwned = true;
    await writeFile(
      resolve(this.lock, "owner.json"),
      JSON.stringify({
        pid: process.pid,
        endpoint: this.config.baseUrl,
        createdAt: new Date().toISOString(),
      }),
    );
  }
  private async ready(signal: AbortSignal) {
    if (!this.verified) {
      let actual: string;
      try {
        const hash = createHash("sha256");
        for await (const chunk of createReadStream(this.config.checkpointPath, {
          signal,
        }))
          hash.update(chunk);
        actual = hash.digest("hex");
      } catch {
        throw new VisualResolutionError(
          "MODEL_MISSING",
          "Configured checkpoint cannot be read",
        );
      }
      if (actual !== this.config.checkpointHash)
        throw new VisualResolutionError(
          "MODEL_MISSING",
          "Checkpoint hash differs from verified model",
        );
      this.verified = true;
    }
    const started = performance.now();
    if (await this.available(signal)) {
      this.metrics.push({
        kind: "backend",
        reused: !this.child,
        ownership: this.child ? "owned" : "external",
        startupMs: 0,
      });
      return;
    }
    if (!this.config.startup)
      throw new VisualResolutionError(
        "UNAVAILABLE",
        "Backend unavailable and automatic startup is not configured",
      );
    if (this.child)
      throw new VisualResolutionError(
        "UNAVAILABLE",
        "Owned backend exited unexpectedly; no automatic relaunch",
      );
    const startup = this.config.startup;
    this.child = spawn(startup.executable, startup.args, {
      cwd: startup.cwd,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        HF_HUB_OFFLINE: "1",
        TRANSFORMERS_OFFLINE: "1",
        HF_HUB_DISABLE_TELEMETRY: "1",
        HF_DATASETS_OFFLINE: "1",
      },
    });
    // Consume streams without exposing prompts or private paths in application logs.
    this.child.stdout?.resume();
    this.child.stderr?.resume();
    let launchError: Error | undefined;
    this.child.on("error", (error) => {
      launchError = error;
    });
    const startupSignal = AbortSignal.any([
      signal,
      AbortSignal.timeout(this.config.startupTimeoutMs),
    ]);
    try {
      while (!(await this.available(startupSignal))) {
        if (launchError || this.child.exitCode !== null)
          throw new VisualResolutionError(
            "UNAVAILABLE",
            "Configured backend process could not start",
          );
        await delay(this.config.pollMs, undefined, { signal: startupSignal });
      }
    } catch (error) {
      if (startupSignal.aborted && !signal.aborted)
        throw new VisualResolutionError(
          "STARTUP_TIMEOUT",
          "Backend readiness timeout",
        );
      throw error;
    }
    generations.set(this.config.baseUrl, 0);
    this.metrics.push({
      kind: "backend",
      reused: false,
      ownership: "owned",
      pid: this.child.pid,
      startupMs: performance.now() - started,
    });
  }
  private async cancel(id: string) {
    // Installed 0.3.76 supports targeted interrupt. Never send a global interrupt.
    const signal = AbortSignal.timeout(5000);
    try {
      await this.json("/queue", signal, { delete: [id] });
      await this.json("/interrupt", signal, { prompt_id: id });
      while (true) {
        const queue = queueSchema.parse(await this.json("/queue", signal));
        if (
          ![...queue.queue_running, ...queue.queue_pending].some(
            (item) => item[1] === id,
          )
        )
          return true;
        await delay(this.config.pollMs, undefined, { signal });
      }
    } catch {
      /* Cancellation is cooperative; record whether queue drain was confirmed. */
    }
    return false;
  }
  async generate(
    request: ImageGenerationRequest,
    signal: AbortSignal,
  ): Promise<Uint8Array> {
    const prefix = `reelmaster_${randomUUID().replaceAll("-", "")}`;
    const workflow = buildComfyWorkflow(
      request,
      this.config.checkpoint,
      prefix,
    );
    return exclusive(this.config.baseUrl, async () => {
      if (this.closed)
        throw new VisualResolutionError(
          "UNAVAILABLE",
          "Provider batch is closed",
        );
      if (signal.aborted)
        throw new VisualResolutionError(
          "CANCELLED",
          "Image request cancelled before execution",
        );
      await this.acquireLock();
      let id: string | undefined;
      let generationSignal: AbortSignal | undefined;
      try {
        await this.ready(signal);
        const model = z
          .object({
            CheckpointLoaderSimple: z.object({
              input: z.object({
                required: z.object({
                  ckpt_name: z.tuple([z.array(z.string())]).rest(z.unknown()),
                }),
              }),
            }),
          })
          .parse(
            await this.json("/object_info/CheckpointLoaderSimple", signal),
          );
        if (
          !model.CheckpointLoaderSimple.input.required.ckpt_name[0].includes(
            this.config.checkpoint,
          )
        )
          throw new VisualResolutionError(
            "MODEL_MISSING",
            "Allowed checkpoint is not exposed by local backend",
          );
        generationSignal = AbortSignal.any([
          signal,
          AbortSignal.timeout(this.config.generationTimeoutMs),
        ]);
        // Wait for unrelated local work; never enqueue behind an unbounded external queue.
        while (true) {
          const queue = queueSchema.parse(
            await this.json("/queue", generationSignal),
          );
          if (!queue.queue_running.length && !queue.queue_pending.length) break;
          await delay(this.config.pollMs, undefined, {
            signal: generationSignal,
          });
        }
        const started = performance.now();
        // Supply our own ID so a timeout during submission can still be cancelled safely.
        id = randomUUID();
        const submitted = z.object({ prompt_id: z.string().uuid() }).parse(
          await this.json("/prompt", generationSignal, {
            prompt: workflow,
            prompt_id: id,
            client_id: prefix,
          }),
        );
        if (submitted.prompt_id !== id)
          throw new VisualResolutionError(
            "WORKFLOW_REJECTED",
            "Backend changed the requested job identity",
          );
        while (true) {
          const histories = z
            .record(z.string(), z.unknown())
            .parse(await this.json(`/history/${id}`, generationSignal));
          if (histories[id]) {
            const result = historySchema.parse(histories[id]);
            const failure = result.status.messages.find(
              ([type]) =>
                type === "execution_error" || type === "execution_interrupted",
            );
            if (failure || result.status.status_str === "error") {
              const detail = JSON.stringify(failure?.[1] ?? "");
              throw new VisualResolutionError(
                /out.of.memory|OutOfMemory|CUDA.*memory/i.test(detail)
                  ? "OUT_OF_MEMORY"
                  : failure?.[0] === "execution_interrupted"
                    ? "CANCELLED"
                    : "GENERATION_FAILED",
                "Local workflow execution failed; no automatic retry",
              );
            }
            if (result.status.completed) {
              const parsed = outputSchema.safeParse(result.outputs["7"]);
              if (!parsed.success)
                throw new VisualResolutionError(
                  "INVALID_OUTPUT",
                  "Expected one PNG from the controlled SaveImage node",
                );
              const output = parsed.data.images[0];
              if (
                output.subfolder !== "" ||
                !new RegExp(`^${prefix}_[0-9]{5,}_[.]png$`).test(
                  output.filename,
                )
              )
                throw new VisualResolutionError(
                  "INVALID_OUTPUT",
                  "Output filename does not belong to this execution",
                );
              const bytes = await this.http(
                `/view?${new URLSearchParams({ filename: output.filename, subfolder: "", type: "output" })}`,
                generationSignal,
                undefined,
                20 * 1024 * 1024,
              );
              if (
                bytes.length < 24 ||
                !bytes
                  .subarray(0, 8)
                  .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
                bytes.readUInt32BE(16) !== request.width ||
                bytes.readUInt32BE(20) !== request.height
              )
                throw new VisualResolutionError(
                  "INVALID_OUTPUT",
                  "Generated output is not the requested bounded PNG",
                );
              const count = generations.get(this.config.baseUrl);
              generations.set(this.config.baseUrl, (count ?? 0) + 1);
              this.metrics.push({
                kind: "generation",
                temperature:
                  count === 0
                    ? "cold"
                    : count === undefined
                      ? "unknown-external"
                      : "warm",
                promptId: id,
                seed: request.seed,
                width: request.width,
                height: request.height,
                ...generationParameters,
                elapsedMs: performance.now() - started,
                bytes: bytes.length,
              });
              return bytes;
            }
          }
          await delay(this.config.pollMs, undefined, {
            signal: generationSignal,
          });
        }
      } catch (error) {
        if (id)
          this.metrics.push({
            kind: "cancellation",
            promptId: id,
            drained: await this.cancel(id),
          });
        if (signal.aborted)
          throw new VisualResolutionError(
            "CANCELLED",
            "Image request cancelled; interrupt is cooperative",
          );
        if (generationSignal?.aborted)
          throw new VisualResolutionError(
            "TIMEOUT",
            "Generation timeout; no automatic retry",
          );
        if (error instanceof VisualResolutionError) throw error;
        if (error instanceof z.ZodError || error instanceof SyntaxError)
          throw new VisualResolutionError(
            "INVALID_OUTPUT",
            "Unexpected local API response",
          );
        throw new VisualResolutionError(
          "UNAVAILABLE",
          "Local image backend communication failed",
        );
      }
    });
  }
  async close() {
    return exclusive(this.config.baseUrl, async () => {
      if (this.closed) return;
      if (
        this.child &&
        this.child.exitCode === null &&
        this.child.signalCode === null
      ) {
        const child = this.child;
        await new Promise<void>((accept, reject) => {
          const timer = setTimeout(
            () =>
              reject(
                new VisualResolutionError(
                  "UNAVAILABLE",
                  "Owned backend did not exit; ownership lock retained",
                ),
              ),
            10000,
          );
          child.once("exit", () => {
            clearTimeout(timer);
            accept();
          });
          child.kill();
        });
      }
      this.metrics.push({
        kind: "shutdown",
        ownership: this.child ? "owned" : "external",
        stopped: Boolean(this.child),
      });
      if (this.lockOwned) {
        await unlink(resolve(this.lock, "owner.json"));
        await rmdir(this.lock);
        this.lockOwned = false;
      }
      this.closed = true;
    });
  }
}
