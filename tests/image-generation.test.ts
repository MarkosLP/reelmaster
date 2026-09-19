import { before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ImageGenerationRequestSchema } from "../src/domain/image-generation";
import {
  VisualPlanSchema,
  reelMasterBrand,
  type VisualPlan,
} from "../src/domain/visual-plan";
import { VisualAssetSchema } from "../src/domain/visual-asset";
import { compileReelDraft } from "../src/application/generate-reel-content";
import { marcosIdeaDefaults } from "../src/application/editorial-prompt";
import {
  createProductionPlan,
  transitionProduction,
} from "../src/application/production-plan";
import {
  createVisualManifest,
  assignVisualAsset,
  resolveSceneVisual,
} from "../src/application/visual-manifest";
import { planVisuals } from "../src/application/visual-planning";
import { buildImageRequest } from "../src/application/image-prompt";
import { GeneratedImageResolver } from "../src/infrastructure/visual/generated-image-resolver";
import { createLocalImageProvider } from "../src/infrastructure/visual/image-provider";
import {
  privateRoot,
  atomicJson,
} from "../src/infrastructure/production/local-files";
import { fileHash } from "../src/infrastructure/audio/inspect";
import { contentHash } from "../src/snapshot/hash";
import { resolveProductionVisuals } from "../src/infrastructure/visual/resolve-production";
import { FakeImageProvider, fakePng } from "./fixtures/fake-image-provider";
import type { VisualIntentSchema } from "../src/domain/reel-draft";
import type { z } from "zod";
type Kind = z.infer<typeof VisualIntentSchema>["kind"];
const workspace = resolve(".");
function makePlan(
  kinds: Kind[] = ["image", "textOnly"],
  description = "Imagen IA conceptual: agentes digitales colaborando sin personas",
) {
  const draft = compileReelDraft(
    {
      ...marcosIdeaDefaults,
      topic: "Prueba de arquitectura, sin modelo real",
      targetDurationMs: 30000,
    },
    {
      title: `Test provider ${randomUUID()}`,
      scenes: kinds.map((kind, i) => ({
        narration: "Un concepto de colaboración digital.",
        purpose: i === 0 ? "hook" : "example",
        visualIntent: { kind, description },
        onScreenText: "Colaboración",
        estimatedDurationMs: 30000 / kinds.length,
      })),
    },
  );
  return transitionProduction(createProductionPlan(draft), {
    kind: "waitingForNarration",
  });
}
let production: ReturnType<typeof makePlan>,
  directory: string,
  entry: VisualPlan,
  provider: FakeImageProvider,
  resolver: GeneratedImageResolver;
let generated: Awaited<ReturnType<GeneratedImageResolver["resolve"]>>;
before(async () => {
  production = makePlan();
  directory = resolve(
    await privateRoot(workspace, "productions"),
    production.id,
  );
  await mkdir(directory);
  provider = new FakeImageProvider();
  entry = planVisuals(
    production,
    createVisualManifest(production),
    provider.capability(),
  )[0];
  resolver = new GeneratedImageResolver(workspace, directory, provider, true);
  generated = await resolver.resolve(entry);
});
test("ImageGenerationRequest is bounded, seeded, vertical and text-to-image only", () => {
  const request = entry.imageRequest!;
  assert.equal(ImageGenerationRequestSchema.safeParse(request).success, true);
  assert.equal(request.seed, 42);
  assert.equal(request.width * 3, request.height * 2);
  for (const patch of [
    { seed: -1 },
    { seed: Math.random() },
    { width: 1080, height: 1920 },
    { options: { ...request.options, count: 2 } },
    { options: { ...request.options, iterations: 100 } },
    { prompt: "x".repeat(2401) },
    { safety: { ...request.safety, referenceImages: true } },
    { modelPath: "C:/private/model" },
    { endpoint: "https://example.org" },
  ])
    assert.equal(
      ImageGenerationRequestSchema.safeParse({ ...request, ...patch }).success,
      false,
    );
});
test("Visual prompt uses scene context and brand without composition instructions or long embedded text", () => {
  const request = buildImageRequest(
    production.draft.scenes[0],
    reelMasterBrand,
    "es-ES",
    123,
  );
  assert.match(request.prompt, /agentes digitales/);
  assert.match(request.prompt, /no escribirlo/);
  assert.match(request.prompt, /Sin palabras/);
  assert.doesNotMatch(
    request.prompt,
    /Remotion|ReelMaster|CompositionSnapshot|scene-1/,
  );
  assert.equal(request.seed, 123);
  assert.throws(
    () =>
      buildImageRequest(
        {
          ...production.draft.scenes[0],
          narration: "Marcos aparece hablando.",
        },
        reelMasterBrand,
        "es-ES",
      ),
    { code: "INVALID_SPEC" },
  );
});
test("Missing backend remains unavailable and never falls back to a local graphic", async () => {
  const unavailable = planVisuals(
    production,
    createVisualManifest(production),
  )[0];
  assert.equal(unavailable.strategy, "generatedImage");
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.resolver, "unavailable");
  assert.equal(createLocalImageProvider().capability().status, "unavailable");
  await assert.rejects(
    new GeneratedImageResolver(workspace, directory).resolve(unavailable),
    { code: "UNAVAILABLE" },
  );
  assert.equal(
    VisualPlanSchema.safeParse({ ...entry, semanticType: "presenter" }).success,
    false,
  );
});
test("Presenter, real screen capture and real broll never select AI; structured text remains local", () => {
  const p = makePlan(["avatarTalking", "screenDemo", "broll", "textOnly"]);
  assert.deepEqual(
    planVisuals(p, createVisualManifest(p), provider.capability()).map(
      (p) => p.strategy,
    ),
    ["manual", "manual", "manual"],
  );
  const graphic = makePlan(
    ["image", "textOnly"],
    "Gráfico conceptual informativo",
  );
  assert.equal(
    planVisuals(
      graphic,
      createVisualManifest(graphic),
      provider.capability(),
    )[0].strategy,
    "localGraphic",
  );
  const person = makePlan(
    ["image", "textOnly"],
    "Imagen IA: retrato de Marcos",
  );
  assert.equal(
    planVisuals(person, createVisualManifest(person), provider.capability())[0]
      .strategy,
    "manual",
  );
});
test("Capacity is explicit, conservative and cannot be enabled through a request", () => {
  assert.equal(
    planVisuals(production, createVisualManifest(production), {
      status: "available",
      execution: "local",
      maxPixels: 100,
    })[0].status,
    "unavailable",
  );
  assert.equal(
    ImageGenerationRequestSchema.safeParse({
      ...entry.imageRequest,
      backend: "forge",
    }).success,
    false,
  );
});
test("Test backend is rejected outside the explicitly technical test context", async () => {
  await assert.rejects(
    new GeneratedImageResolver(workspace, directory, provider).resolve(entry),
    { code: "UNAVAILABLE" },
  );
});
test("Fake output passes signature, decode, measured dimensions and normalization in 1D", async () => {
  assert.equal(generated.asset.metadata.codec, "png");
  assert.equal(generated.asset.metadata.width, 512);
  assert.equal(generated.asset.metadata.height, 768);
  assert.equal(
    await fileHash(resolve(directory, generated.asset.path)),
    generated.asset.contentHash,
  );
  assert.equal(generated.asset.privacy.classification, "technicalFixture");
  assert.equal(generated.asset.privacy.publicable, false);
});
test("AI provenance is distinct from 1E and references an immutable local runtime/model receipt", async () => {
  const asset = generated.asset;
  assert.equal(asset.source.kind, "generatedLocalAI");
  assert.equal(asset.type, "conceptualImage");
  assert.equal(asset.generation, undefined);
  const receipt = JSON.parse(
    await readFile(
      resolve(
        directory,
        "visual-assets/generated-ai",
        `receipt-${asset.aiGeneration!.receiptHash}.json`,
      ),
      "utf8",
    ),
  );
  assert.equal(contentHash(receipt), asset.aiGeneration!.receiptHash);
  assert.equal(receipt.identity.runtimeId, "fake-test-only");
  assert.equal(receipt.identity.testOnly, true);
  assert.equal(receipt.request.seed, 42);
  assert.equal(receipt.reproducibility, "seeded-not-bitwise-guaranteed");
  assert.equal(
    VisualAssetSchema.safeParse({ ...asset, aiGeneration: undefined }).success,
    false,
  );
  assert.equal(
    VisualAssetSchema.safeParse({
      ...asset,
      aiGeneration: { ...asset.aiGeneration, contentHash: "0".repeat(64) },
    }).success,
    false,
  );
});
test("Cache hit returns validated identical asset without calling provider twice", async () => {
  const count = provider.calls,
    result = await resolver.resolve(entry);
  assert.equal(generated.metrics.cache, "miss");
  assert.equal(result.metrics.cache, "hit");
  assert.equal(provider.calls, count);
  assert.deepEqual(result.asset, generated.asset);
});
test("Seed, prompt, model identity and parameters enter cache key", async () => {
  for (const patch of [
    { seed: 43 },
    { prompt: entry.imageRequest!.prompt + " Objeto central." },
    { options: { ...entry.imageRequest!.options, iterations: 21 } },
  ]) {
    const result = await resolver.resolve({
      ...entry,
      imageRequest: { ...entry.imageRequest!, ...patch },
    });
    assert.notEqual(result.metrics.inputHash, generated.metrics.inputHash);
  }
  class OtherModel extends FakeImageProvider {
    override identity() {
      return { ...super.identity(), modelId: "another-test-model" };
    }
  }
  const other = await new GeneratedImageResolver(
    workspace,
    directory,
    new OtherModel(),
    true,
  ).resolve(entry);
  assert.notEqual(other.metrics.inputHash, generated.metrics.inputHash);
});
test("Corrupt output and receipt reject cache reuse", async () => {
  const path = resolve(
      directory,
      "visual-assets/generated-ai",
      `${generated.metrics.inputHash}.png`,
    ),
    bytes = await readFile(path);
  await writeFile(path, "corrupt");
  try {
    const calls = provider.calls;
    const recovered = await resolver.resolve(entry);
    assert.equal(recovered.metrics.cacheRecovered, true);
    assert.equal(provider.calls, calls + 1);
  } finally {
    await writeFile(path, bytes);
  }
  const receipt = resolve(
      directory,
      "visual-assets/generated-ai",
      `${generated.metrics.inputHash}.json`,
    ),
    saved = await readFile(receipt);
  await writeFile(receipt, "{}");
  try {
    const calls = provider.calls;
    const recovered = await resolver.resolve(entry);
    assert.equal(recovered.metrics.cacheRecovered, true);
    assert.equal(provider.calls, calls + 1);
  } finally {
    await writeFile(receipt, saved);
  }
});
test("Orphan output is quarantined before generating, with exactly one replacement", async () => {
  const orphanPlan = {
    ...entry,
    imageRequest: { ...entry.imageRequest!, seed: 200 },
  };
  const first = await resolver.resolve(orphanPlan);
  await unlink(
    resolve(
      directory,
      "visual-assets/generated-ai",
      `${first.metrics.inputHash}.json`,
    ),
  );
  const calls = provider.calls;
  const recovered = await resolver.resolve(orphanPlan);
  assert.equal(provider.calls, calls + 1);
  assert.equal(recovered.metrics.cacheRecovered, true);
});
test("Invalid provider bytes and incorrect dimensions cannot become assets", async () => {
  class Invalid extends FakeImageProvider {
    override async generate() {
      return Buffer.from("not a PNG");
    }
  }
  await assert.rejects(
    new GeneratedImageResolver(
      workspace,
      directory,
      new Invalid(),
      true,
    ).resolve({
      ...entry,
      imageRequest: { ...entry.imageRequest!, seed: 100 },
    }),
    { code: "INVALID_SPEC" },
  );
  class WrongSize extends FakeImageProvider {
    override async generate() {
      return fakePng(256, 256, 5);
    }
  }
  await assert.rejects(
    new GeneratedImageResolver(
      workspace,
      directory,
      new WrongSize(),
      true,
    ).resolve({
      ...entry,
      imageRequest: { ...entry.imageRequest!, seed: 101 },
    }),
    { code: "INVALID_SPEC" },
  );
  class BrokenDecode extends FakeImageProvider {
    override async generate() {
      return Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    }
  }
  await assert.rejects(
    new GeneratedImageResolver(
      workspace,
      directory,
      new BrokenDecode(),
      true,
    ).resolve({
      ...entry,
      imageRequest: { ...entry.imageRequest!, seed: 102 },
    }),
    { code: "GENERATION_FAILED" },
  );
});
test("Concept image binds only to image requirements through the existing 1D pipeline", () => {
  const manifest = assignVisualAsset(
    production,
    createVisualManifest(production),
    entry.requirementId,
    generated.asset,
    { fit: "contain" },
  );
  assert.equal(manifest.status, "resolved");
  assert.equal(manifest.bindings[0].assetId, generated.asset.id);
  assert.equal(
    resolveSceneVisual(manifest, entry.sceneId, 90, 30).kind,
    "image",
  );
  for (const kind of ["avatarTalking", "screenDemo", "broll"] as const) {
    const p = makePlan([kind, "textOnly"]);
    assert.throws(() =>
      assignVisualAsset(
        p,
        createVisualManifest(p),
        "visual-scene-1",
        generated.asset,
      ),
    );
  }
});
test("Unavailable execution leaves requirement missing and records explicit reason", async () => {
  const path = resolve(directory, "production-plan.json");
  await atomicJson(path, production);
  const result = await resolveProductionVisuals(workspace, path, true);
  assert.equal(result.plans[0].status, "unavailable");
  assert.equal(result.metrics.length, 0);
  const manifest = JSON.parse(
    await readFile(resolve(directory, "visual-manifest.json"), "utf8"),
  );
  assert.equal(manifest.requirements[0].status, "missing");
  assert.equal(manifest.assets.length, 0);
});
test("No backend coupling in editorial/render contracts; no arbitrary model paths", async () => {
  for (const path of [
    "src/domain/reel-draft.ts",
    "src/application/production-plan.ts",
    "src/application/prepared-reel.ts",
    "src/snapshot/types.ts",
    "src/domain/visual-asset.ts",
    "src/composition/MediaSceneView.tsx",
  ]) {
    assert.doesNotMatch(
      await readFile(path, "utf8"),
      /ComfyUI|Diffusers|Stable.Diffusion|Forge|InvokeAI/i,
    );
  }
  class UnsafeIdentity extends FakeImageProvider {
    override identity() {
      return { ...super.identity(), modelId: "C:/private/checkpoint" };
    }
  }
  await assert.rejects(
    new GeneratedImageResolver(
      workspace,
      directory,
      new UnsafeIdentity(),
      true,
    ).resolve(entry),
    { code: "GENERATION_FAILED" },
  );
});
test("Production provider has no network transport and existing CLI guard rejects outbound sockets", async () => {
  const source = await readFile(
    "src/infrastructure/visual/image-provider.ts",
    "utf8",
  );
  assert.doesNotMatch(source, /fetch\(|https?:|node:http|process.env/);
  const result = await promisify(execFile)(
    process.execPath,
    [
      "--import",
      "./scripts/local-only.mjs",
      "--input-type=module",
      "-e",
      "import net from 'node:net';try{net.connect({host:'example.org',port:443});process.exitCode=1}catch(e){console.log(e.message)}",
    ],
    { windowsHide: true },
  );
  assert.match(result.stdout, /outbound network disabled/);
});
