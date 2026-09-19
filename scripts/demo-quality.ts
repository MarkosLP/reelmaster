import { access, copyFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  qualityProduction,
  qualityConcepts,
  technicalIdentity,
} from "./phase-1h-fixture";
import { compileReelDraft } from "../src/application/generate-reel-content";
import {
  createProductionPlan,
  transitionProduction,
  createNarrationManifest,
  narrationText,
} from "../src/application/production-plan";
import { planVisuals } from "../src/application/visual-planning";
import { createVisualManifest } from "../src/application/visual-manifest";
import { VisualDirectionSchema } from "../src/domain/visual-direction";
import { ImageCandidateSession } from "../src/infrastructure/visual/image-candidates";
import { ComfyUIImageProvider } from "../src/infrastructure/visual/comfy-image-provider";
import { readComfyConfig } from "../src/infrastructure/visual/comfy-config";
import {
  readLocalJson,
  atomicJson,
  privateRoot,
} from "../src/infrastructure/production/local-files";
import { assignProductionAsset } from "../src/infrastructure/visual/operations";
import { LocalGraphicResolver } from "../src/infrastructure/visual/local-graphic-resolver";
import { importProduction } from "../src/infrastructure/production/operations";
import { fileHash } from "../src/infrastructure/audio/inspect";

if (process.env.CI || !process.argv.includes("--technical"))
  throw Error("Technical demo only, outside CI");
const workspace = resolve("."),
  config = readComfyConfig();
if (!config) throw Error("Explicit configuration required");
const source = qualityProduction(),
  sourceDirectory = resolve(
    await privateRoot(workspace, "productions"),
    source.id,
  );
const directions = z
  .object({
    results: z.array(
      z.object({ sceneId: z.string(), direction: VisualDirectionSchema }),
    ),
  })
  .parse(await readLocalJson(resolve(".local/phase-1h/directions.json")));
const provider = new ComfyUIImageProvider(config),
  entries = planVisuals(
    source,
    createVisualManifest(source),
    provider.capability(),
  );
const selected = [];
try {
  for (const [i, entry] of entries.entries()) {
    const session = new ImageCandidateSession(
      workspace,
      sourceDirectory,
      provider,
      entry,
      directions.results.find((d) => d.sceneId === entry.sceneId)!.direction,
      [2026091201 + i * 100, 2026091202 + i * 100],
    );
    if ((await session.status()).status === "accepted")
      selected.push({ concept: i + 1, asset: await session.acceptedAsset() });
  }
} finally {
  await provider.close();
}
if (selected.length < 2)
  throw Error(
    "At least two final human ACCEPT reviews required; no Reel created",
  );
const chosen = selected.slice(0, 2);
const draft = compileReelDraft(
  {
    topic: "Calidad visual local con revisión editorial",
    locale: "es-ES",
    targetDurationMs: 15000,
    contentStyle: "tech",
    audience: "Demo técnica",
    voiceProfileId: "voice-technical",
    orientation: "vertical",
  },
  {
    title: "Dirección visual revisada · FASE 1H",
    scenes: [
      {
        purpose: "hook",
        narration: "Una imagen necesita dirección y revisión.",
        onScreenText: "DIRECCIÓN Y REVISIÓN",
        visualIntent: { kind: "textOnly", description: "Introducción técnica" },
        estimatedDurationMs: 3000,
      },
      {
        purpose: "explanation",
        narration: "Concepto; Candidato; Revisión humana",
        onScreenText: "DECIDIR ANTES DE USAR",
        visualIntent: {
          kind: "image",
          description: "Gráfico conceptual de flujo",
        },
        estimatedDurationMs: 3000,
      },
      ...chosen.map(({ concept }) => ({
        purpose: "example" as const,
        narration: qualityConcepts[concept - 1].narration,
        onScreenText: qualityConcepts[concept - 1].title,
        visualIntent: {
          kind: "image" as const,
          description: qualityConcepts[concept - 1].description,
        },
        estimatedDurationMs: 3000,
      })),
      {
        purpose: "closing",
        narration: "Demo técnica. Audio de prueba sin voz.",
        onScreenText: "REVISIÓN COMPLETADA",
        visualIntent: { kind: "textOnly", description: "Cierre técnico" },
        estimatedDurationMs: 3000,
      },
    ],
  },
);
const plan = transitionProduction(
    createProductionPlan(draft, technicalIdentity),
    { kind: "waitingForNarration" },
  ),
  directory = resolve(await privateRoot(workspace, "productions"), plan.id),
  planPath = resolve(directory, "production-plan.json");
let exists = false;
try {
  await access(planPath);
  exists = true;
} catch {
  /* new production */
}
if (exists) {
  console.log({ planPath, message: "Existing demo preserved" });
} else {
  await mkdir(directory, { recursive: true });
  await atomicJson(planPath, plan);
  await atomicJson(
    resolve(directory, "narration-manifest.json"),
    createNarrationManifest(plan),
  );
  await writeFile(resolve(directory, "narration.txt"), narrationText(plan));
  await mkdir(resolve(directory, "visual-assets/generated-ai"), {
    recursive: true,
  });
  await mkdir(resolve(directory, "image-candidates"), { recursive: true });
  for (const [i, { asset }] of chosen.entries()) {
    await copyFile(
      resolve(sourceDirectory, asset.path),
      resolve(directory, asset.path),
    );
    for (const path of [
      `visual-assets/generated-ai/receipt-${asset.aiGeneration!.receiptHash}.json`,
      `image-candidates/review-${asset.aiGeneration!.editorial!.reviewHash}.json`,
    ])
      await copyFile(resolve(sourceDirectory, path), resolve(directory, path));
    await assignProductionAsset(
      workspace,
      planPath,
      `visual-scene-${i + 3}`,
      "",
      { fit: "contain" },
      true,
      async () => asset,
    );
  }
  const graphic = planVisuals(plan, createVisualManifest(plan))[0];
  await assignProductionAsset(
    workspace,
    planPath,
    "visual-scene-2",
    "",
    { fit: "contain" },
    true,
    async () =>
      (
        await new LocalGraphicResolver(workspace, directory, true).resolve(
          graphic,
        )
      ).asset,
  );
  const audio = resolve(
      await privateRoot(workspace, "recordings"),
      "quality-demo-1h.wav",
    ),
    samples = 15 * 48000,
    bytes = Buffer.alloc(44 + samples * 4);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(48000, 24);
  bytes.writeUInt32LE(192000, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(samples * 4, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / 48000,
      phase = t % 3,
      value =
        phase > 0.3 && phase < 2.7
          ? Math.round(4000 * Math.sin(2 * Math.PI * 330 * t))
          : 0;
    bytes.writeInt16LE(value, 44 + i * 4);
    bytes.writeInt16LE(value, 46 + i * 4);
  }
  await writeFile(audio, bytes, { flag: "wx" });
  const review = resolve(directory, "technical-audio-review.json");
  await atomicJson(review, {
    productionId: plan.id,
    draftContentHash: plan.draftContentHash,
    narrationHash: plan.narrationHash,
    recordingHash: await fileHash(audio),
    exactScriptRead: true,
    boundariesReviewed: true,
    sceneIds: draft.scenes.map((s) => s.id),
    sceneBoundariesMs: [3000, 6000, 9000, 12000],
  });
  await importProduction(workspace, planPath, audio, review);
  await atomicJson(resolve(".local/phase-1h/demo.json"), {
    planPath,
    directory,
    sourceProductionId: source.id,
    selected: chosen,
    technicalAudio: true,
    apiCostEur: 0,
  });
  console.log({
    planPath,
    selectedConcepts: chosen.map((c) => c.concept),
    apiCostEur: 0,
  });
}
