import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { ESLint } from "eslint";
import {
  GeneratedContentSchema,
  IdeaRequestSchema,
  ReelDraftSchema,
  type GeneratedContent,
} from "../src/domain/reel-draft";
import {
  compileReelDraft,
  defaultGenerationParameters,
  generateReelContent,
  generationInputHash,
} from "../src/application/generate-reel-content";
import {
  buildEditorialPrompt,
  marcosEditorialProfile,
  marcosIdeaDefaults,
} from "../src/application/editorial-prompt";
import { GenerationError, type TextProvider } from "../src/ports/text-provider";
import { contentHash } from "../src/snapshot/hash";

const input = { ...marcosIdeaDefaults, topic: "Explica los agentes de IA." };
const content: GeneratedContent = {
  title: "Un ayudante para tus tareas",
  scenes: [
    {
      narration:
        "¿Y si delegaras una tarea? Un agente puede seguir pasos para ayudarte.",
      purpose: "hook",
      visualIntent: {
        kind: "avatarTalking",
        description: "Presentador plantea una pregunta",
      },
      estimatedDurationMs: 10000,
      onScreenText: "Delega una tarea",
    },
    {
      narration:
        "Por ejemplo, puede organizar una lista. Revisa el resultado antes de usarlo.",
      purpose: "example",
      visualIntent: { kind: "screenDemo", description: "Una lista organizada" },
      estimatedDurationMs: 20000,
      onScreenText: null,
    },
  ],
};
const info = {
  provider: "fake",
  model: "test-model",
  modelDigest: "test-digest",
  version: "1",
};
function fake(outputs: string[]) {
  const requests: Parameters<TextProvider["generateStructured"]>[0][] = [];
  const provider: TextProvider = {
    info,
    async generateStructured(request) {
      requests.push(request);
      return {
        text: outputs[Math.min(requests.length - 1, outputs.length - 1)],
        info,
        elapsedMs: 1,
        usage: { inputTokens: 10, outputTokens: 20 },
      };
    },
  };
  return { provider, requests };
}
const deps = (provider: TextProvider) => ({
  provider,
  editorialProfile: marcosEditorialProfile,
});
test("IdeaRequest supports Marcos defaults and another locale/voice/orientation", () => {
  assert.ok(IdeaRequestSchema.safeParse(input).success);
  assert.ok(
    IdeaRequestSchema.safeParse({
      ...input,
      locale: "en-US",
      voiceProfileId: "another",
      orientation: "horizontal",
    }).success,
  );
});
test("IdeaRequest rejects missing, invalid and unknown fields including endpoint/model", () => {
  for (const value of [
    {},
    { ...input, topic: " " },
    { ...input, locale: "not_a_locale" },
    { ...input, endpoint: "http://127.0.0.1" },
    { ...input, model: "another" },
    { ...input, measuredDurationMs: 30000 },
  ])
    assert.equal(IdeaRequestSchema.safeParse(value).success, false);
});
test("Input length limits apply at exact boundaries", () => {
  for (const [field, limit] of [
    ["topic", 2000],
    ["audience", 300],
    ["voiceProfileId", 100],
  ] as const) {
    assert.ok(
      IdeaRequestSchema.safeParse({ ...input, [field]: "x".repeat(limit) })
        .success,
    );
    assert.equal(
      IdeaRequestSchema.safeParse({ ...input, [field]: "x".repeat(limit + 1) })
        .success,
      false,
    );
  }
});
test("Only 15/30/45/60 second editorial targets are allowed", () => {
  for (const targetDurationMs of [15000, 30000, 45000, 60000])
    assert.ok(
      IdeaRequestSchema.safeParse({ ...input, targetDurationMs }).success,
    );
  for (const targetDurationMs of [0, -1, 30001, 30, 30000.5, 90000])
    assert.equal(
      IdeaRequestSchema.safeParse({ ...input, targetDurationMs }).success,
      false,
    );
});
test("All five content styles influence narrative instructions", () => {
  const prompts = new Set(
    ["educational", "impactful", "minimal", "tech", "storytelling"].map(
      (contentStyle) =>
        buildEditorialPrompt(
          IdeaRequestSchema.parse({ ...input, contentStyle }),
          marcosEditorialProfile,
        ).system,
    ),
  );
  assert.equal(prompts.size, 5);
});
test("Draft compiles with stable IDs, coherent narration and integer editorial budget", () => {
  const draft = compileReelDraft(input, content);
  assert.ok(ReelDraftSchema.safeParse(draft).success);
  assert.equal(
    draft.fullNarration,
    content.scenes.map((s) => s.narration).join(" "),
  );
  assert.equal(
    draft.scenes.reduce((sum, s) => sum + s.estimatedDurationMs, 0),
    30000,
  );
  assert.equal("audio" in draft.scenes[0], false);
  assert.equal("measuredDurationMs" in draft, false);
});
test("Editorial allocation works for all targets and skewed scene estimates", () => {
  for (const targetDurationMs of [15000, 30000, 45000, 60000]) {
    const raw = structuredClone(content);
    raw.scenes[0].estimatedDurationMs = 60000;
    raw.scenes[1].estimatedDurationMs = 1000;
    const draft = compileReelDraft(
      IdeaRequestSchema.parse({ ...input, targetDurationMs }),
      raw,
    );
    assert.equal(
      draft.scenes.reduce((n, s) => n + s.estimatedDurationMs, 0),
      targetDurationMs,
    );
    assert.ok(
      draft.scenes.every(
        (s) =>
          Number.isInteger(s.estimatedDurationMs) &&
          s.estimatedDurationMs >= 1000,
      ),
    );
  }
});
test("Duplicate IDs and incoherent order are rejected", () => {
  const draft = compileReelDraft(input, content);
  draft.scenes[1].id = draft.scenes[0].id;
  assert.equal(ReelDraftSchema.safeParse(draft).success, false);
  draft.scenes[1].id = "scene-2";
  draft.scenes[1].order = 0;
  assert.equal(ReelDraftSchema.safeParse(draft).success, false);
});
test("Visual intents are limited and reject renderer instructions", () => {
  for (const kind of [
    "avatarTalking",
    "screenDemo",
    "broll",
    "image",
    "textOnly",
  ]) {
    const raw = structuredClone(content);
    Object.assign(raw.scenes[0].visualIntent, { kind });
    assert.ok(GeneratedContentSchema.safeParse(raw).success);
  }
  for (const visualIntent of [
    { kind: "video", description: "x" },
    { kind: "image", description: "x", url: "https://remote" },
  ]) {
    const raw = structuredClone(content);
    Object.assign(raw.scenes[0], { visualIntent });
    assert.equal(GeneratedContentSchema.safeParse(raw).success, false);
  }
});
test("Scene narration cannot be blank or exceed 600 characters", () => {
  for (const narration of ["", "  ", "x".repeat(601)]) {
    const raw = structuredClone(content);
    raw.scenes[1].narration = narration;
    assert.equal(GeneratedContentSchema.safeParse(raw).success, false);
  }
});
test("Scene count, negative duration and unknown structures are rejected", () => {
  assert.equal(
    GeneratedContentSchema.safeParse({
      ...content,
      scenes: [content.scenes[0]],
    }).success,
    false,
  );
  assert.equal(
    GeneratedContentSchema.safeParse({
      ...content,
      scenes: Array(9).fill(content.scenes[0]),
    }).success,
    false,
  );
  assert.equal(
    GeneratedContentSchema.safeParse({ ...content, css: "x" }).success,
    false,
  );
  const raw = structuredClone(content);
  raw.scenes[0].estimatedDurationMs = -1;
  assert.equal(GeneratedContentSchema.safeParse(raw).success, false);
});
test("Draft rejects incoherent fullNarration, missing spoken hook and unspoken CTA", () => {
  const draft = compileReelDraft(input, content);
  for (const changes of [
    { fullNarration: "Una frase distinta" },
    { hook: "Otro hook" },
    { cta: "Sígueme" },
    { targetDurationMs: 15000 },
    { measuredDurationMs: 30000 },
  ])
    assert.equal(
      ReelDraftSchema.safeParse({ ...draft, ...changes }).success,
      false,
    );
});
test("inputHash is stable under key order and changes with relevant identity", () => {
  const hash = generationInputHash(
    input,
    marcosEditorialProfile,
    info,
    defaultGenerationParameters,
  );
  const reordered = Object.fromEntries(
    Object.entries(input).reverse(),
  ) as typeof input;
  assert.equal(
    hash,
    generationInputHash(
      reordered,
      marcosEditorialProfile,
      info,
      defaultGenerationParameters,
    ),
  );
  assert.notEqual(
    hash,
    generationInputHash(
      { ...input, topic: "Otra idea" },
      marcosEditorialProfile,
      info,
      defaultGenerationParameters,
    ),
  );
  assert.notEqual(
    hash,
    generationInputHash(
      input,
      { ...marcosEditorialProfile, version: "2" },
      info,
      defaultGenerationParameters,
    ),
  );
  assert.notEqual(
    hash,
    generationInputHash(
      input,
      marcosEditorialProfile,
      { ...info, modelDigest: "changed" },
      defaultGenerationParameters,
    ),
  );
  assert.notEqual(
    hash,
    generationInputHash(input, marcosEditorialProfile, info, {
      ...defaultGenerationParameters,
      seed: 43,
    }),
  );
});
test("Prompt version participates in inputHash", () => {
  assert.notEqual(
    generationInputHash(
      input,
      marcosEditorialProfile,
      info,
      defaultGenerationParameters,
      "v1",
    ),
    generationInputHash(
      input,
      marcosEditorialProfile,
      info,
      defaultGenerationParameters,
      "v2",
    ),
  );
});
test("contentHash covers validated content independently of timing metadata", async () => {
  const first = await generateReelContent(
    input,
    deps(fake([JSON.stringify(content)]).provider),
  );
  const second = await generateReelContent(
    input,
    deps(fake([JSON.stringify(content)]).provider),
  );
  assert.equal(first.generation.contentHash, second.generation.contentHash);
  assert.equal(first.generation.contentHash, contentHash(first.draft));
  assert.notEqual(
    first.generation.contentHash,
    contentHash({ ...first.draft, title: "Otro" }),
  );
  assert.equal(first.generation.attemptCount, 1);
  assert.equal(first.generation.apiCostEur, 0);
});
test("Invalid input is rejected before invoking provider", async () => {
  const mock = fake([]);
  await assert.rejects(
    generateReelContent(
      { ...input, endpoint: "http://remote" },
      deps(mock.provider),
    ),
    { code: "INVALID_INPUT" },
  );
  assert.equal(mock.requests.length, 0);
});
test("Invalid JSON is repaired once with concrete errors and unchanged schema", async () => {
  const mock = fake(["not JSON", JSON.stringify(content)]);
  const result = await generateReelContent(input, deps(mock.provider));
  assert.equal(result.generation.attemptCount, 2);
  assert.equal(mock.requests.length, 2);
  assert.match(mock.requests[1].user, /invalid JSON/);
  assert.deepEqual(mock.requests[0].schema, mock.requests[1].schema);
});
test("Semantic validation errors trigger repair", async () => {
  const invalid = structuredClone(content);
  invalid.scenes[0].purpose = "explanation";
  const mock = fake([JSON.stringify(invalid), JSON.stringify(content)]);
  const result = await generateReelContent(input, deps(mock.provider));
  assert.equal(result.generation.attemptCount, 2);
  assert.match(mock.requests[1].user, /Hook must open/);
});
test("Invalid provider output fails after exactly two attempts; no sensitive output in error", async () => {
  const mock = fake([
    JSON.stringify({ ...content, secret: "PRIVATE_CONTENT" }),
  ]);
  await assert.rejects(
    generateReelContent(input, deps(mock.provider)),
    (error) => {
      assert.ok(error instanceof GenerationError);
      assert.equal(error.code, "INVALID_OUTPUT");
      assert.equal(error.attempts, 2);
      assert.equal(JSON.stringify(error).includes("PRIVATE_CONTENT"), false);
      return true;
    },
  );
  assert.equal(mock.requests.length, 2);
});
test("Provider timeout is typed and never retried as content repair", async () => {
  let calls = 0;
  await assert.rejects(
    generateReelContent(
      input,
      deps({
        info,
        async generateStructured() {
          calls++;
          throw new GenerationError("TIMEOUT", "Timed out");
        },
      }),
    ),
    { code: "TIMEOUT", attempts: 1 },
  );
  assert.equal(calls, 1);
});
test("Abort before generation does not call provider", async () => {
  const mock = fake([]);
  await assert.rejects(
    generateReelContent(input, {
      ...deps(mock.provider),
      signal: AbortSignal.abort(),
    }),
    { code: "ABORTED" },
  );
  assert.equal(mock.requests.length, 0);
});
test("Unknown provider errors are sanitized and model identity cannot change", async () => {
  await assert.rejects(
    generateReelContent(
      input,
      deps({
        info,
        async generateStructured() {
          throw new Error("PRIVATE");
        },
      }),
    ),
    { code: "PROVIDER_ERROR", message: "Text provider failed" },
  );
  await assert.rejects(
    generateReelContent(
      input,
      deps({
        info,
        async generateStructured() {
          return {
            info: { ...info, model: "different" },
            text: JSON.stringify(content),
            elapsedMs: 1,
          };
        },
      }),
    ),
    { code: "PROVIDER_ERROR" },
  );
});
test("Domain, composition and snapshot have no text provider dependency", async () => {
  for (const directory of ["src/domain", "src/composition", "src/snapshot"]) {
    for (const file of await readdir(directory)) {
      if (!/\.tsx?$/.test(file)) continue;
      const source = await readFile(`${directory}/${file}`, "utf8");
      assert.doesNotMatch(
        source,
        /ollama|TextProvider|generateReelContent|infrastructure\/text|ports\/text-provider/i,
        file,
      );
    }
  }
  const eslint = new ESLint();
  for (const source of [
    'import "../ports/text-provider";',
    'import "../application/generate-reel-content";',
    'import "../infrastructure/text/ollama";',
  ]) {
    const [result] = await eslint.lintText(source, {
      filePath: "src/composition/probe.ts",
    });
    assert.ok(
      result.messages.some((m) => m.ruleId === "no-restricted-imports"),
    );
  }
});
