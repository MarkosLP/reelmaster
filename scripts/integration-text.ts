import assert from "node:assert/strict";
import { generateReelContent } from "../src/application/generate-reel-content";
import {
  marcosEditorialProfile,
  marcosIdeaDefaults,
} from "../src/application/editorial-prompt";
import { ReelDraftSchema } from "../src/domain/reel-draft";
import {
  OllamaTextAdapter,
  ollamaConfigFromEnvironment,
} from "../src/infrastructure/text/ollama";
import { contentHash } from "../src/snapshot/hash";
import { GenerationError } from "../src/ports/text-provider";

if (process.env.CI || !process.argv.includes("--local")) {
  console.error("Local integration requires --local and is forbidden in CI.");
  process.exitCode = 1;
} else {
  try {
    const provider = await OllamaTextAdapter.connect(
      ollamaConfigFromEnvironment(process.env),
    );
    const result = await generateReelContent(
      {
        ...marcosIdeaDefaults,
        targetDurationMs: 15000,
        topic:
          "Explica por qué conviene revisar las respuestas de una IA antes de usarlas.",
      },
      { provider, editorialProfile: marcosEditorialProfile },
    );
    assert.ok(ReelDraftSchema.safeParse(result.draft).success);
    assert.equal(result.generation.contentHash, contentHash(result.draft));
    assert.match(result.generation.inputHash, /^[a-f0-9]{64}$/);
    assert.ok(
      result.generation.model &&
        result.generation.promptVersion &&
        result.generation.elapsedMs > 0,
    );
    assert.ok(result.generation.attemptCount <= 2);
    console.log(
      JSON.stringify(
        { status: "PASS", generation: result.generation },
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
        : { code: "INTEGRATION_FAILED" },
    );
    process.exitCode = 1;
  }
}
