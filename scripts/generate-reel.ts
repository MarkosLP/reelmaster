import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateReelContent } from "../src/application/generate-reel-content";
import {
  marcosEditorialProfile,
  marcosIdeaDefaults,
} from "../src/application/editorial-prompt";
import {
  OllamaTextAdapter,
  ollamaConfigFromEnvironment,
} from "../src/infrastructure/text/ollama";
import { GenerationError } from "../src/ports/text-provider";

const controller = new AbortController();
const cancel = () => controller.abort();
process.once("SIGINT", cancel);
try {
  const { values } = parseArgs({
    options: {
      topic: { type: "string" },
      duration: { type: "string", default: "30" },
      style: { type: "string", default: "educational" },
      locale: { type: "string", default: "es-ES" },
      audience: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  const input = {
    ...marcosIdeaDefaults,
    topic: values.topic,
    targetDurationMs: Number(values.duration) * 1000,
    contentStyle: values.style,
    locale: values.locale,
    ...(values.audience ? { audience: values.audience } : {}),
  };
  // Validate before connecting or loading a model.
  const { IdeaRequestSchema } = await import("../src/domain/reel-draft");
  if (!IdeaRequestSchema.safeParse(input).success)
    throw new GenerationError(
      "INVALID_INPUT",
      "Use --topic (1–2000 characters), --duration 15|30|45|60 and a supported --style",
    );
  const provider = await OllamaTextAdapter.connect(
    ollamaConfigFromEnvironment(process.env),
    controller.signal,
  );
  const result = await generateReelContent(input, {
    provider,
    editorialProfile: marcosEditorialProfile,
    signal: controller.signal,
  });
  const directory = resolve(".local/generated");
  await mkdir(directory, { recursive: true });
  const file = resolve(
    directory,
    `${result.generation.inputHash.slice(0, 16)}-${result.generation.contentHash.slice(0, 16)}-${Date.now()}.json`,
  );
  await writeFile(file, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(
    JSON.stringify(
      {
        status: "draft",
        file,
        title: result.draft.title,
        scenes: result.draft.scenes.length,
        targetDurationMs: result.draft.targetDurationMs,
        model: result.generation.model,
        attemptCount: result.generation.attemptCount,
        elapsedMs: result.generation.elapsedMs,
        apiCostEur: 0,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error instanceof GenerationError
      ? {
          code: error.code,
          message: error.message,
          attempts: error.attempts,
          details: error.details,
        }
      : {
          code: "CLI_ERROR",
          message: "Invalid CLI arguments or local file operation failed",
        },
  );
  process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", cancel);
}
