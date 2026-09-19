import { before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { compileReelDraft } from "../src/application/generate-reel-content";
import { marcosIdeaDefaults } from "../src/application/editorial-prompt";
import {
  createProductionPlan,
  transitionProduction,
  createNarrationManifest,
} from "../src/application/production-plan";
import {
  createVisualManifest,
  assignVisualAsset,
} from "../src/application/visual-manifest";
import { planVisuals } from "../src/application/visual-planning";
import {
  GraphicSpecSchema,
  VisualPlanSchema,
  VisualStrategySchema,
  VisualBrandProfileSchema,
  reelMasterBrand,
} from "../src/domain/visual-plan";
import { VisualAssetSchema } from "../src/domain/visual-asset";
import { LocalGraphicResolver } from "../src/infrastructure/visual/local-graphic-resolver";
import { resolveProductionVisuals } from "../src/infrastructure/visual/resolve-production";
import {
  atomicJson,
  privateRoot,
} from "../src/infrastructure/production/local-files";
import { fileHash } from "../src/infrastructure/audio/inspect";
import { contentHash } from "../src/snapshot/hash";
import { createVisualFixtures } from "./fixtures/visual-fixtures";
import {
  importProduction,
  loadPreparedProduction,
} from "../src/infrastructure/production/operations";
import { compilePreparedReel } from "../src/application/prepared-reel";
import type { VisualIntentSchema } from "../src/domain/reel-draft";
import type { z } from "zod";
type Kind = z.infer<typeof VisualIntentSchema>["kind"];
const workspace = resolve(".");
function makePlan(kinds: Kind[], descriptions?: string[]) {
  const draft = compileReelDraft(
    {
      ...marcosIdeaDefaults,
      topic: "Prueba gráfica local",
      targetDurationMs: 30000,
    },
    {
      title: `Prueba resolver ${randomUUID()}`,
      scenes: kinds.map((kind, i) => ({
        narration: "¿Ahorras tiempo? ¡Sí! Revisión, pingüino y mañana.",
        purpose: i === 0 ? "hook" : "example",
        visualIntent: {
          kind,
          description: descriptions?.[i] ?? "Gráfico conceptual informativo",
        },
        estimatedDurationMs: 30000 / kinds.length,
        onScreenText: "Á É Í Ó Ú · ñ ü ¿ ¡",
      })),
    },
  );
  return transitionProduction(createProductionPlan(draft), {
    kind: "waitingForNarration",
  });
}
let plan: ReturnType<typeof makePlan>,
  directory: string,
  resolver: LocalGraphicResolver;
let generated: Awaited<ReturnType<LocalGraphicResolver["resolve"]>>;
before(async () => {
  plan = makePlan(["image", "image", "image", "textOnly"]);
  directory = resolve(await privateRoot(workspace, "productions"), plan.id);
  await mkdir(directory);
  resolver = new LocalGraphicResolver(workspace, directory, true);
  generated = await resolver.resolve(
    planVisuals(plan, createVisualManifest(plan))[0],
  );
});
test("VisualPlan selects manual real media and conceptual local graphics; textOnly omitted", () => {
  const p = makePlan(
    ["avatarTalking", "screenDemo", "broll", "image", "image", "textOnly"],
    [
      "Presentador real",
      "Captura real",
      "B-roll real",
      "Gráfico conceptual",
      "Fotografía real",
      "Texto",
    ],
  );
  const result = planVisuals(p, createVisualManifest(p));
  assert.deepEqual(
    result.map((v) => v.strategy),
    ["manual", "manual", "manual", "localGraphic", "manual"],
  );
  assert.ok(
    result
      .slice(0, 3)
      .every(
        (v) =>
          v.status === "manualRequired" && v.reason.includes("archivo real"),
      ),
  );
  assert.equal(result[3].resolver, "localGraphic-v1");
  assert.ok(result.every((v) => VisualPlanSchema.safeParse(v).success));
});
test("Strategies reject unknown names and future providers remain explicitly unavailable", async () => {
  const p = planVisuals(plan, createVisualManifest(plan))[0];
  assert.equal(VisualStrategySchema.safeParse("webSearch").success, false);
  const future = VisualPlanSchema.parse({
    ...p,
    strategy: "generatedImage",
    resolver: "unavailable",
    status: "unsupported",
    graphicSpec: undefined,
    brand: undefined,
  });
  await assert.rejects(resolver.resolve(future), {
    code: "UNSUPPORTED_STRATEGY",
  });
  assert.equal(
    VisualPlanSchema.safeParse({ ...p, semanticType: "presenter" }).success,
    false,
  );
  assert.equal(
    VisualPlanSchema.safeParse({ ...p, resolver: "manual-v1" }).success,
    false,
  );
});
test("GraphicSpec is bounded, Spanish-aware, strict and does not accept code or arbitrary layouts", () => {
  assert.ok(
    GraphicSpecSchema.safeParse({
      layout: "title",
      headline: "¿Qué tal, pingüino? ¡Mañana!",
      items: [],
    }).success,
  );
  for (const bad of [
    { layout: "free", headline: "Test", items: [] },
    { layout: "title", headline: "x".repeat(61), items: [] },
    { layout: "list", headline: "Test", items: ["one"] },
    { layout: "title", headline: "<script>", items: [] },
    {
      layout: "title",
      headline: "Test",
      items: [],
      url: "https://example.org",
    },
  ])
    assert.equal(GraphicSpecSchema.safeParse(bad).success, false);
});
test("Brand colors are centralized and must provide sufficient contrast", () => {
  assert.ok(VisualBrandProfileSchema.safeParse(reelMasterBrand).success);
  assert.equal(
    VisualBrandProfileSchema.safeParse({
      ...reelMasterBrand,
      typography: "Arial",
    }).success,
    false,
  );
  assert.equal(
    VisualBrandProfileSchema.safeParse({
      ...reelMasterBrand,
      colors: {
        ...reelMasterBrand.colors,
        text: reelMasterBrand.colors.background,
      },
    }).success,
    false,
  );
  assert.equal(
    VisualBrandProfileSchema.safeParse({
      ...reelMasterBrand,
      colors: { ...reelMasterBrand.colors, accent: "red" },
    }).success,
    false,
  );
});
test("Generated Spanish PNG passes 1D validation, records hashes and explicit non-AI provenance", async () => {
  const a = generated.asset;
  assert.equal(a.type, "illustrativeGraphic");
  assert.equal(a.source.kind, "generatedLocal");
  assert.equal(a.generation?.resolver, "localGraphic-v1");
  assert.equal(a.generation?.contentHash, a.contentHash);
  assert.equal(a.metadata.width, 900);
  assert.equal(a.metadata.height, 1000);
  assert.equal(a.metadata.codec, "png");
  assert.equal(await fileHash(resolve(directory, a.path)), a.contentHash);
  assert.equal(a.privacy.publicable, false);
  assert.equal(
    VisualAssetSchema.safeParse({ ...a, generation: undefined }).success,
    false,
  );
  assert.equal(
    VisualAssetSchema.safeParse({
      ...a,
      generation: { ...a.generation, contentHash: "0".repeat(64) },
    }).success,
    false,
  );
});
test("Same input yields verified cache hit with identical bytes and metadata", async () => {
  assert.equal(generated.metrics.cache, "miss");
  const again = await resolver.resolve(
    planVisuals(plan, createVisualManifest(plan))[0],
  );
  assert.equal(again.metrics.cache, "hit");
  assert.equal(again.metrics.inputHash, generated.metrics.inputHash);
  assert.deepEqual(again.asset, generated.asset);
});
test("Fresh uncached generation is deterministic; brand and spec changes invalidate inputHash", async () => {
  const second = resolve(directory, "other-private");
  await mkdir(second);
  const p = planVisuals(plan, createVisualManifest(plan))[0];
  const fresh = await new LocalGraphicResolver(workspace, second, true).resolve(
    p,
  );
  assert.equal(fresh.metrics.cache, "miss");
  assert.equal(fresh.asset.contentHash, generated.asset.contentHash);
  const changed = await resolver.resolve({
    ...p,
    graphicSpec: { ...p.graphicSpec!, headline: "Un concepto distinto" },
    brand: { ...reelMasterBrand, radius: 12 },
  });
  assert.notEqual(changed.metrics.inputHash, generated.metrics.inputHash);
  assert.notEqual(changed.asset.contentHash, generated.asset.contentHash);
});
test("Actual text measurement rejects unbreakable overflow without tiny fonts", async () => {
  const p = planVisuals(plan, createVisualManifest(plan))[0];
  await assert.rejects(
    resolver.resolve({
      ...p,
      graphicSpec: { layout: "title", headline: "W".repeat(60), items: [] },
    }),
    { code: "OVERFLOW" },
  );
});
test("List and flow layouts render using bounded rules; unsupported glyphs fail explicitly", async () => {
  const p = planVisuals(plan, createVisualManifest(plan))[0];
  for (const layout of ["list", "flow"] as const) {
    const result = await resolver.resolve({
      ...p,
      strategy: "localTextVisual",
      graphicSpec: {
        layout,
        headline: "Información útil",
        items: ["Correo electrónico", "Revisión humana"],
      },
    });
    assert.equal(result.asset.type, "illustrativeGraphic");
  }
  await assert.rejects(
    resolver.resolve({
      ...p,
      graphicSpec: { layout: "title", headline: "漢字", items: [] },
    }),
    { code: "INVALID_SPEC" },
  );
});
test("Cache corruption fails closed", async () => {
  const p = planVisuals(plan, createVisualManifest(plan))[0];
  const cache = resolve(
    directory,
    "visual-assets/generated",
    `${generated.metrics.inputHash}.png`,
  );
  const bytes = await readFile(cache);
  await writeFile(cache, "broken");
  try {
    await assert.rejects(resolver.resolve(p), { code: "CACHE_CORRUPT" });
  } finally {
    await writeFile(cache, bytes);
  }
});
test("Existing assets are selected without generation and bindings reject presenter substitution", () => {
  const manifest = assignVisualAsset(
    plan,
    createVisualManifest(plan),
    "visual-scene-1",
    generated.asset,
  );
  const entry = planVisuals(plan, manifest)[0];
  assert.equal(entry.strategy, "existingAsset");
  assert.equal(entry.assetId, generated.asset.id);
  const presenter = makePlan(["avatarTalking", "textOnly"]);
  assert.throws(() =>
    assignVisualAsset(
      presenter,
      createVisualManifest(presenter),
      "visual-scene-1",
      generated.asset,
    ),
  );
});
test("Long editorial copy stays manual instead of silently truncating", () => {
  const p = structuredClone(plan);
  p.draft.scenes[0].onScreenText = "x".repeat(90);
  // Recreate a valid plan from the modified draft, keeping editorial identity honest.
  const changed = transitionProduction(createProductionPlan(p.draft), {
    kind: "waitingForNarration",
  });
  assert.equal(
    planVisuals(changed, createVisualManifest(changed))[0].status,
    "manualRequired",
  );
});
test("Generation passes the existing assignment, narration, prepared and snapshot pipeline", async () => {
  const planPath = resolve(directory, "production-plan.json");
  await atomicJson(planPath, plan);
  await atomicJson(
    resolve(directory, "narration-manifest.json"),
    createNarrationManifest(plan),
  );
  const result = await resolveProductionVisuals(
    workspace,
    planPath,
    true,
    true,
  );
  assert.deepEqual(result.errors, []);
  assert.equal(result.plans.length, 3);
  const fixtures = await createVisualFixtures(workspace),
    review = resolve(directory, "technical-review.json");
  await atomicJson(review, {
    productionId: plan.id,
    draftContentHash: plan.draftContentHash,
    narrationHash: plan.narrationHash,
    recordingHash: await fileHash(fixtures.audio),
    exactScriptRead: true,
    boundariesReviewed: true,
    sceneIds: plan.draft.scenes.map((s) => s.id),
    sceneBoundariesMs: [2000, 4000, 6000],
  });
  await importProduction(workspace, planPath, fixtures.audio, review);
  const current = await loadPreparedProduction(workspace, planPath);
  assert.equal(current.plan.state.kind, "renderable");
  const compiled = compilePreparedReel(current.plan, current.prepared);
  assert.deepEqual(
    compiled.snapshot.scenes.map((s) => s.visual.kind),
    ["image", "image", "image", "typography"],
  );
  assert.equal(contentHash(current.plan.draft), plan.draftContentHash);
  const reused = await resolveProductionVisuals(
    workspace,
    planPath,
    true,
    true,
  );
  assert.ok(
    reused.plans.every((p) => p.status === "resolved" && p.graphicSpec),
  );
  assert.equal(reused.metrics.length, 0);
});
test("Remotion only renders resolved media; domain and port have no generation infrastructure", async () => {
  for (const path of [
    "src/composition/MediaSceneView.tsx",
    "src/composition/Reel.tsx",
  ]) {
    assert.doesNotMatch(
      await readFile(path, "utf8"),
      /LocalGraphicResolver|GraphicSpec|VisualPlan|generatedLocal|canvas/i,
    );
  }
  for (const path of [
    "src/domain/visual-plan.ts",
    "src/application/ports/visual-resolver.ts",
  ]) {
    assert.doesNotMatch(
      await readFile(path, "utf8"),
      /ffmpeg|remotion|ollama|node:|infrastructure\//i,
    );
  }
});
