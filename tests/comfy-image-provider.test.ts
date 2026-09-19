import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { once } from "node:events";
import { resolve } from "node:path";
import { fileHash } from "../src/infrastructure/audio/inspect";
import { ComfyUIImageProvider } from "../src/infrastructure/visual/comfy-image-provider";
import {
  ComfyConfigSchema,
  localBaseUrl,
  type ComfyConfig,
} from "../src/infrastructure/visual/comfy-config";
import {
  buildComfyWorkflow,
  workflowVersion,
} from "../src/infrastructure/visual/comfy-workflow";
import { buildImageRequest } from "../src/application/image-prompt";
import { reelMasterBrand } from "../src/domain/visual-plan";
import { fakePng } from "./fixtures/fake-image-provider";

const imageRequest = buildImageRequest(
  {
    id: "scene-1",
    order: 0,
    purpose: "hook",
    narration: "Un núcleo de luz conecta ideas.",
    estimatedDurationMs: 3000,
    onScreenText: "Conexiones",
    visualIntent: {
      kind: "image",
      description: "Imagen IA: esfera luminosa abstracta sin personas",
    },
  },
  reelMasterBrand,
  "es-ES",
  2026091201,
);
const fixturePath = resolve("tests/fixtures/comfy-server.mjs");
async function config(baseUrl: string): Promise<ComfyConfig> {
  return {
    baseUrl,
    checkpoint: "sdxl_lightning_2step.safetensors",
    checkpointPath: fixturePath,
    checkpointHash: await fileHash(fixturePath),
    runtimeVersion: "0.3.76",
    runtimeCommit: "a".repeat(40),
    startupTimeoutMs: 1000,
    generationTimeoutMs: 1000,
    pollMs: 10,
    width: 512,
    height: 768,
    steps: 2,
    cfg: 1,
    sampler: "euler",
    scheduler: "sgm_uniform",
    batch: 1,
  };
}
async function listen(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
) {
  const server = createServer(handler);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}
async function fake(mode = "success") {
  const jobs = new Map<string, { prefix: string; polls: number }>();
  let submissions = 0,
    active = 0,
    maxActive = 0,
    views = 0;
  const cancellations: unknown[] = [];
  const service = await listen((req, res) => {
    void (async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = chunks.length
        ? JSON.parse(Buffer.concat(chunks).toString())
        : undefined;
      res.setHeader("Content-Type", "application/json");
      const send = (data: unknown) => res.end(JSON.stringify(data));
      if (mode === "redirect") {
        res.writeHead(302, { Location: "http://example.org/private" });
        res.end();
        return;
      }
      if (req.url === "/system_stats")
        return send({ system: { comfyui_version: "0.3.76" } });
      if (req.url === "/object_info/CheckpointLoaderSimple")
        return send({
          CheckpointLoaderSimple: {
            input: {
              required: {
                ckpt_name: [
                  mode === "missing"
                    ? []
                    : ["sdxl_lightning_2step.safetensors"],
                ],
              },
            },
          },
        });
      if (req.url === "/queue" && req.method === "GET")
        return send({ queue_running: [], queue_pending: [] });
      if (req.url === "/queue" || req.url === "/interrupt") {
        cancellations.push(body);
        return send({});
      }
      if (req.url === "/prompt") {
        if (mode === "rejected") {
          res.statusCode = 400;
          return send({ error: "invalid" });
        }
        submissions++;
        active++;
        maxActive = Math.max(maxActive, active);
        jobs.set(body.prompt_id, {
          prefix: body.prompt["7"].inputs.filename_prefix,
          polls: 0,
        });
        assert.equal(body.prompt["5"].inputs.seed, imageRequest.seed);
        return send({ prompt_id: body.prompt_id });
      }
      if (req.url?.startsWith("/history/")) {
        const id = req.url.slice(9),
          job = jobs.get(id)!;
        if (++job.polls < 3 || mode === "timeout") return send({});
        if (mode === "oom" || mode === "failed" || mode === "interrupted")
          return send({
            [id]: {
              status: {
                completed: false,
                status_str: "error",
                messages: [
                  [
                    mode === "interrupted"
                      ? "execution_interrupted"
                      : "execution_error",
                    {
                      exception_type:
                        mode === "oom"
                          ? "torch.OutOfMemoryError"
                          : "RuntimeError",
                    },
                  ],
                ],
              },
              outputs: {},
            },
          });
        return send({
          [id]: {
            status: { completed: true, status_str: "success", messages: [] },
            outputs: {
              "7": {
                images: [
                  {
                    filename:
                      mode === "traversal"
                        ? "../private.png"
                        : mode === "foreign"
                          ? "another_00001_.png"
                          : `${job.prefix}_00001_.png`,
                    subfolder: mode === "subfolder" ? "../" : "",
                    type: "output",
                  },
                ],
              },
            },
          },
        });
      }
      if (req.url?.startsWith("/view?")) {
        views++;
        active--;
        res.end(
          mode === "invalid" ? Buffer.from("bad") : fakePng(512, 768, 10),
        );
        return;
      }
      res.statusCode = 404;
      send({});
    })().catch((error) => {
      res.destroy(error);
    });
  });
  return {
    ...service,
    jobs,
    cancellations,
    counts: () => ({ submissions, maxActive, views }),
  };
}
test("Controlled workflow maps prompt, negative, seed, dimensions and validated options", () => {
  const workflow = buildComfyWorkflow(
    imageRequest,
    "sdxl_lightning_2step.safetensors",
    `reelmaster_${"a".repeat(32)}`,
  );
  assert.equal(workflowVersion, "sdxl-lightning-2step-v1");
  assert.equal(Object.keys(workflow).length, 7);
  assert.equal(workflow["2"].inputs.text, imageRequest.prompt);
  assert.equal(workflow["3"].inputs.text, imageRequest.negativePrompt);
  assert.deepEqual(workflow["4"].inputs, {
    width: 512,
    height: 768,
    batch_size: 1,
  });
  assert.equal(workflow["5"].inputs.seed, imageRequest.seed);
  for (const patch of [
    { width: 288, height: 512, aspectRatio: "9:16" },
    { options: { iterations: 20, guidanceStrength: 6, count: 1 } },
    { workflow: {} },
    { seed: -1 },
  ])
    assert.throws(
      () =>
        buildComfyWorkflow(
          { ...imageRequest, ...patch } as typeof imageRequest,
          "sdxl_lightning_2step.safetensors",
          `reelmaster_${"a".repeat(32)}`,
        ),
      { code: "INVALID_SPEC" },
    );
});
test("Only exact loopback authorities accepted; infrastructure config is strict", async () => {
  assert.equal(localBaseUrl("http://localhost:8188"), "http://127.0.0.1:8188");
  assert.equal(localBaseUrl("http://127.0.0.1:8188/"), "http://127.0.0.1:8188");
  for (const url of [
    "http://192.168.1.2:8188",
    "http://example.org",
    "http://127.1",
    "http://2130706433",
    "http://localhost.evil",
    "http://user@localhost",
    "http://localhost/path",
    "https://localhost",
    "http://[::1]",
  ])
    assert.throws(() => localBaseUrl(url));
  const c = await config("http://127.0.0.1:8188");
  for (const patch of [
    { arbitrary: true },
    { checkpoint: "other.safetensors" },
    { steps: 4 },
    { width: 1080 },
    { batch: 2 },
  ])
    assert.equal(
      ComfyConfigSchema.safeParse({ ...c, ...patch }).success,
      false,
    );
});
test("Polling succeeds; one generation at a time; external backend survives close; real identity recipe", async () => {
  const server = await fake();
  const provider = new ComfyUIImageProvider(await config(server.url));
  try {
    const outputs = await Promise.all([
      provider.generate(imageRequest, new AbortController().signal),
      provider.generate(imageRequest, new AbortController().signal),
    ]);
    assert.equal(outputs.length, 2);
    assert.equal(server.counts().maxActive, 1);
    assert.equal(provider.identity().recipe?.workflowVersion, workflowVersion);
    assert.equal(provider.identity().runtimeId, "ComfyUI");
    assert.ok([...server.jobs.values()].every((j) => j.polls === 3));
    await provider.close();
    assert.equal(server.server.listening, true);
    assert.equal(provider.metrics.at(-1)?.stopped, false);
  } finally {
    await provider.close();
    await server.close();
  }
});
for (const [mode, code] of [
  ["redirect", "WORKFLOW_REJECTED"],
  ["rejected", "WORKFLOW_REJECTED"],
  ["missing", "MODEL_MISSING"],
  ["oom", "OUT_OF_MEMORY"],
  ["failed", "GENERATION_FAILED"],
  ["interrupted", "CANCELLED"],
  ["timeout", "TIMEOUT"],
  ["invalid", "INVALID_OUTPUT"],
  ["traversal", "INVALID_OUTPUT"],
  ["foreign", "INVALID_OUTPUT"],
  ["subfolder", "INVALID_OUTPUT"],
]) {
  test(`Local API ${mode} returns ${code}`, async () => {
    const server = await fake(mode);
    const provider = new ComfyUIImageProvider(await config(server.url));
    try {
      await assert.rejects(
        provider.generate(imageRequest, new AbortController().signal),
        { code },
      );
      if (["traversal", "foreign", "subfolder"].includes(mode))
        assert.equal(server.counts().views, 0);
      assert.ok(server.counts().submissions <= 1);
    } finally {
      await provider.close();
      await server.close();
    }
  });
}
test("Cancellation targets only submitted ID, and pre-cancellation submits nothing", async () => {
  const server = await fake("timeout");
  const provider = new ComfyUIImageProvider(await config(server.url));
  try {
    await assert.rejects(provider.generate(imageRequest, AbortSignal.abort()), {
      code: "CANCELLED",
    });
    assert.equal(server.counts().submissions, 0);
    const controller = new AbortController();
    const timer = setInterval(() => {
      if (server.jobs.size) controller.abort();
    }, 10);
    try {
      await assert.rejects(provider.generate(imageRequest, controller.signal), {
        code: "CANCELLED",
      });
    } finally {
      clearInterval(timer);
    }
    assert.deepEqual(server.cancellations, [
      { delete: [[...server.jobs.keys()][0]] },
      { prompt_id: [...server.jobs.keys()][0] },
    ]);
  } finally {
    await provider.close();
    await server.close();
  }
});
test("Unavailable backend and checkpoint mismatch are explicit", async () => {
  const server = await fake();
  const c = await config(server.url);
  await server.close();
  const provider = new ComfyUIImageProvider(c);
  try {
    await assert.rejects(
      provider.generate(imageRequest, new AbortController().signal),
      { code: "UNAVAILABLE" },
    );
  } finally {
    await provider.close();
  }
  const mismatch = new ComfyUIImageProvider({
    ...c,
    checkpointHash: "0".repeat(64),
  });
  try {
    await assert.rejects(
      mismatch.generate(imageRequest, new AbortController().signal),
      { code: "MODEL_MISSING" },
    );
  } finally {
    await mismatch.close();
  }
});
test("Known process starts once, readiness is bounded, only owned process stops", async () => {
  for (const neverReady of [false, true]) {
    const server = await fake();
    const c = await config(server.url);
    const port = server.port;
    await server.close();
    const provider = new ComfyUIImageProvider({
      ...c,
      startupTimeoutMs: neverReady ? 150 : 3000,
      startup: {
        executable: process.execPath,
        cwd: resolve("."),
        args: [
          fixturePath,
          String(port),
          ...(neverReady ? ["never-ready"] : []),
        ],
      },
    });
    try {
      await assert.rejects(
        provider.generate(imageRequest, new AbortController().signal),
        { code: neverReady ? "STARTUP_TIMEOUT" : "MODEL_MISSING" },
      );
      if (!neverReady) {
        await assert.rejects(
          provider.generate(imageRequest, new AbortController().signal),
          { code: "MODEL_MISSING" },
        );
        assert.equal(
          provider.metrics.filter(
            (m) => m.kind === "backend" && m.reused === false && m.pid,
          ).length,
          1,
        );
      }
    } finally {
      await provider.close();
    }
    assert.equal(provider.metrics.at(-1)?.stopped, true);
  }
});
