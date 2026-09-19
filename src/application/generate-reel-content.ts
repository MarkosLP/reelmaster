import { z } from "zod";
import {
  GeneratedContentSchema,
  IdeaRequestSchema,
  ReelDraftSchema,
  type GeneratedContent,
  type IdeaRequest,
  type ReelDraft,
} from "../domain/reel-draft";
import { contentHash } from "../snapshot/hash";
import {
  GenerationError,
  type GenerationParameters,
  type TextProvider,
  type TextProviderInfo,
} from "../ports/text-provider";
import {
  buildEditorialPrompt,
  EditorialProfileSchema,
  PROMPT_VERSION,
  type EditorialProfile,
} from "./editorial-prompt";

export const ParametersSchema = z
  .object({
    temperature: z.number().min(0).max(2),
    maxOutputTokens: z.number().int().min(256).max(8192),
    seed: z.number().int().min(0).max(2147483647).optional(),
  })
  .strict();
export const defaultGenerationParameters: GenerationParameters = {
  temperature: 0.2,
  maxOutputTokens: 3000,
  seed: 42,
};
export function generationInputHash(
  input: IdeaRequest,
  profile: EditorialProfile,
  info: TextProviderInfo,
  parameters: GenerationParameters,
  promptVersion = PROMPT_VERSION,
) {
  return contentHash({
    input,
    editorialProfile: profile,
    promptVersion,
    provider: info,
    parameters,
    contractHash: contentHash(z.toJSONSchema(GeneratedContentSchema)),
  });
}
export function compileReelDraft(
  input: IdeaRequest,
  content: GeneratedContent,
): ReelDraft {
  // Distribute an editorial budget exactly in integer milliseconds. Never measure audio.
  const total = content.scenes.reduce(
    (sum, s) => sum + s.estimatedDurationMs,
    0,
  );
  const minimum = 1000;
  const remaining = input.targetDurationMs - content.scenes.length * minimum;
  let cumulative = 0;
  let assigned = 0;
  const scenes = content.scenes.map((scene, order) => {
    cumulative += scene.estimatedDurationMs;
    const boundary = Math.round((cumulative / total) * remaining);
    const estimatedDurationMs = minimum + boundary - assigned;
    assigned = boundary;
    return { ...scene, id: `scene-${order + 1}`, order, estimatedDurationMs };
  });
  return ReelDraftSchema.parse({
    schemaVersion: 1,
    status: "draft",
    title: content.title,
    hook: scenes[0].narration,
    locale: input.locale,
    targetDurationMs: input.targetDurationMs,
    audience: input.audience,
    contentStyle: input.contentStyle,
    voiceProfileId: input.voiceProfileId,
    orientation: input.orientation,
    fullNarration: scenes.map((s) => s.narration).join(" "),
    scenes,
    cta: scenes.find((scene) => scene.purpose === "cta")?.narration ?? null,
  });
}
export async function generateReelContent(
  rawInput: unknown,
  dependencies: {
    provider: TextProvider;
    editorialProfile: EditorialProfile;
    parameters?: GenerationParameters;
    signal?: AbortSignal;
  },
) {
  const inputResult = IdeaRequestSchema.safeParse(rawInput);
  const profileResult = EditorialProfileSchema.safeParse(
    dependencies.editorialProfile,
  );
  const paramsResult = ParametersSchema.safeParse(
    dependencies.parameters ?? defaultGenerationParameters,
  );
  if (!inputResult.success || !profileResult.success || !paramsResult.success)
    throw new GenerationError(
      "INVALID_INPUT",
      "Invalid request, editorial profile or generation parameters",
    );
  const input = {
    ...inputResult.data,
    locale: Intl.getCanonicalLocales(inputResult.data.locale)[0],
  };
  const profile = profileResult.data;
  const parameters = paramsResult.data;
  const { provider, signal } = dependencies;
  const info = { ...provider.info };
  const inputHash = generationInputHash(input, profile, info, parameters);
  const prompt = buildEditorialPrompt(input, profile);
  const started = performance.now();
  const attempts: {
    elapsedMs: number;
    inputBytes: number;
    outputBytes: number;
    usage?: { inputTokens: number; outputTokens: number };
    validationErrors: string[];
  }[] = [];
  let user = prompt.user;
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (signal?.aborted)
      throw new GenerationError("ABORTED", "Generation cancelled", attempt - 1);
    let result;
    try {
      result = await provider.generateStructured({
        ...prompt,
        user,
        schema: z.toJSONSchema(GeneratedContentSchema),
        parameters,
        signal,
      });
    } catch (error) {
      if (error instanceof GenerationError)
        throw new GenerationError(
          error.code,
          error.message,
          attempt,
          error.details,
        );
      throw new GenerationError(
        "PROVIDER_ERROR",
        "Text provider failed",
        attempt,
      );
    }
    if (contentHash(result.info) !== contentHash(info))
      throw new GenerationError(
        "PROVIDER_ERROR",
        "Provider identity changed during generation",
        attempt,
      );
    let draft: ReelDraft | undefined;
    let errors: string[] = [];
    try {
      if (Buffer.byteLength(result.text) > 65536)
        throw new GenerationError(
          "INVALID_OUTPUT",
          "JSON output exceeds 64 KiB",
        );
      draft = compileReelDraft(
        input,
        GeneratedContentSchema.parse(JSON.parse(result.text)),
      );
    } catch (error) {
      errors =
        error instanceof z.ZodError
          ? error.issues
              .slice(0, 12)
              .map((i) => `${i.path.join(".") || "root"}: ${i.code}`)
          : [
              error instanceof GenerationError
                ? error.message
                : "root: invalid JSON",
            ];
      // Custom messages here are authored by our schema, never model content.
      if (error instanceof z.ZodError)
        errors = error.issues
          .slice(0, 12)
          .map((i) =>
            i.code === "custom"
              ? i.message
              : `${i.path.join(".") || "root"}: ${i.code}`,
          );
    }
    attempts.push({
      elapsedMs: result.elapsedMs,
      inputBytes: Buffer.byteLength(prompt.system + user),
      outputBytes: Buffer.byteLength(result.text),
      ...(result.usage ? { usage: result.usage } : {}),
      validationErrors: errors,
    });
    if (draft)
      return {
        draft,
        generation: {
          ...info,
          promptVersion: PROMPT_VERSION,
          editorialProfile: { id: profile.id, version: profile.version },
          parameters,
          inputHash,
          contentHash: contentHash(draft),
          elapsedMs: performance.now() - started,
          attemptCount: attempt,
          attempts,
          apiCostEur: 0,
        },
      };
    if (attempt === 2)
      throw new GenerationError(
        "INVALID_OUTPUT",
        "Structured generation invalid after two attempts",
        attempt,
        errors,
      );
    user = JSON.stringify({
      request: input,
      repair: {
        errors,
        instruction:
          "Regenera el JSON completo ajustándote al contrato y corrige estos errores. No añadas explicaciones.",
        previousOutput: result.text.slice(0, 16000),
      },
    });
  }
  throw new GenerationError("INVALID_OUTPUT", "Generation failed");
}
