import http from "node:http";
import { z } from "zod";
import {
  GenerationError,
  type TextProvider,
  type TextProviderInfo,
} from "../../ports/text-provider";

const ConfigSchema = z
  .object({
    endpoint: z.string(),
    model: z.string().min(1).max(200),
    timeoutMs: z.number().int().min(1).max(600000),
  })
  .strict();
export type OllamaConfig = z.infer<typeof ConfigSchema>;
export function validateOllamaConfig(raw: unknown): OllamaConfig {
  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success)
    throw new GenerationError(
      "CONFIGURATION",
      "Invalid local text configuration",
    );
  let url: URL;
  try {
    url = new URL(parsed.data.endpoint);
  } catch {
    throw new GenerationError("CONFIGURATION", "Invalid local endpoint");
  }
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new GenerationError(
      "CONFIGURATION",
      "Endpoint must be a loopback HTTP origin without credentials, path, query or fragment",
    );
  // Pin localhost to a numeric loopback: no DNS resolution or host rebinding.
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return { ...parsed.data, endpoint: url.origin };
}
export function ollamaConfigFromEnvironment(
  env: Record<string, string | undefined>,
): OllamaConfig {
  return validateOllamaConfig({
    endpoint: env.REELMASTER_TEXT_ENDPOINT ?? "http://127.0.0.1:11434",
    model: env.REELMASTER_TEXT_MODEL ?? "qwen2.5:7b-instruct",
    timeoutMs: Number(env.REELMASTER_TEXT_TIMEOUT_MS ?? 180000),
  });
}
function localJson(
  config: OllamaConfig,
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new GenerationError("ABORTED", "Generation cancelled"));
      return;
    }
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const request = http.request(new URL(path, config.endpoint), {
      method: payload === undefined ? "GET" : "POST",
      headers:
        payload === undefined
          ? {}
          : {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload),
            },
      agent: false,
    });
    const timer = setTimeout(
      () =>
        request.destroy(
          new GenerationError("TIMEOUT", "Local text request timed out"),
        ),
      config.timeoutMs,
    );
    const abort = () =>
      request.destroy(new GenerationError("ABORTED", "Generation cancelled"));
    signal?.addEventListener("abort", abort, { once: true });
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    request.on("error", (error) => {
      cleanup();
      reject(
        error instanceof GenerationError
          ? error
          : new GenerationError(
              "UNAVAILABLE",
              "Local text service unavailable",
            ),
      );
    });
    request.on("response", (response) => {
      if (response.statusCode !== 200) {
        cleanup();
        response.destroy();
        request.destroy();
        reject(
          new GenerationError(
            "PROVIDER_ERROR",
            `Local text service returned HTTP ${response.statusCode}; redirects are forbidden`,
          ),
        );
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 262144)
          request.destroy(
            new GenerationError(
              "PROVIDER_ERROR",
              "Local text response exceeds 256 KiB",
            ),
          );
        else chunks.push(chunk);
      });
      response.on("error", () => {
        cleanup();
        reject(
          new GenerationError(
            "PROVIDER_ERROR",
            "Incomplete local text response",
          ),
        );
      });
      response.on("end", () => {
        cleanup();
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        } catch {
          reject(
            new GenerationError(
              "PROVIDER_ERROR",
              "Local text service returned invalid JSON",
            ),
          );
        }
      });
    });
    request.end(payload);
  });
}
const TagsSchema = z.object({
  models: z.array(z.object({ name: z.string(), digest: z.string() })),
});
const ReplySchema = z.object({
  model: z.string(),
  done: z.literal(true),
  done_reason: z.string().optional(),
  message: z.object({ content: z.string() }),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
});
export class OllamaTextAdapter implements TextProvider {
  private constructor(
    private readonly config: OllamaConfig,
    readonly info: TextProviderInfo,
  ) {}
  static async connect(rawConfig: OllamaConfig, signal?: AbortSignal) {
    const config = validateOllamaConfig(rawConfig);
    const version = z
      .object({ version: z.string() })
      .safeParse(await localJson(config, "/api/version", undefined, signal));
    const tags = TagsSchema.safeParse(
      await localJson(config, "/api/tags", undefined, signal),
    );
    if (!version.success || !tags.success)
      throw new GenerationError(
        "PROVIDER_ERROR",
        "Invalid local model inventory",
      );
    const model = tags.data.models.find((m) => m.name === config.model);
    if (!model)
      throw new GenerationError(
        "CONFIGURATION",
        "Configured model is not installed locally; no download attempted",
      );
    if (model.name.endsWith(":cloud") || model.name.includes("-cloud"))
      throw new GenerationError("CONFIGURATION", "Cloud models are forbidden");
    const details = await localJson(
      config,
      "/api/show",
      { model: config.model },
      signal,
    );
    if (
      !details ||
      typeof details !== "object" ||
      "remote_model" in details ||
      "remote_host" in details
    )
      throw new GenerationError(
        "CONFIGURATION",
        "Remote or unknown model configuration forbidden",
      );
    return new OllamaTextAdapter(
      config,
      Object.freeze({
        provider: "ollama",
        model: model.name,
        modelDigest: model.digest,
        version: version.data.version,
      }),
    );
  }
  async generateStructured(
    request: Parameters<TextProvider["generateStructured"]>[0],
  ) {
    const started = performance.now();
    const reply = ReplySchema.safeParse(
      await localJson(
        this.config,
        "/api/chat",
        {
          model: this.info.model,
          stream: false,
          format: request.schema,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          options: {
            temperature: request.parameters.temperature,
            num_predict: request.parameters.maxOutputTokens,
            ...(request.parameters.seed !== undefined
              ? { seed: request.parameters.seed }
              : {}),
          },
        },
        request.signal,
      ),
    );
    if (!reply.success || reply.data.model !== this.info.model)
      throw new GenerationError(
        "PROVIDER_ERROR",
        "Invalid structured response envelope/model",
      );
    if (reply.data.done_reason === "length")
      throw new GenerationError(
        "PROVIDER_ERROR",
        "Local model exhausted the output token limit",
      );
    const data = reply.data;
    return {
      text: data.message.content,
      info: this.info,
      elapsedMs: performance.now() - started,
      ...(data.prompt_eval_count !== undefined && data.eval_count !== undefined
        ? {
            usage: {
              inputTokens: data.prompt_eval_count,
              outputTokens: data.eval_count,
            },
          }
        : {}),
    };
  }
}
