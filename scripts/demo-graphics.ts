import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { compileReelDraft } from "../src/application/generate-reel-content";
import { marcosIdeaDefaults } from "../src/application/editorial-prompt";
import {
  createProductionPlan,
  transitionProduction,
  createNarrationManifest,
  narrationText,
} from "../src/application/production-plan";
import {
  atomicJson,
  privateRoot,
} from "../src/infrastructure/production/local-files";
import { fileHash } from "../src/infrastructure/audio/inspect";
import { importProduction } from "../src/infrastructure/production/operations";
import { resolveProductionVisuals } from "../src/infrastructure/visual/resolve-production";
import { LocalGraphicResolver } from "../src/infrastructure/visual/local-graphic-resolver";
import { ReelDraftSchema } from "../src/domain/reel-draft";
import { contentHash } from "../src/snapshot/hash";
if (process.env.CI || !process.argv.includes("--technical"))
  throw Error(
    "Requires --technical outside CI; audio is test tones, never Marcos",
  );
const workspace = resolve(".");
const historical = JSON.parse(
  await readFile(
    resolve(
      ".local/generated/654ce19c402e9b76-21c2cb110e118dbe-1789108461701.json",
    ),
    "utf8",
  ),
);
const source = ReelDraftSchema.parse(historical.draft);
const narrations = [
  "Demo técnica: tres formas de ahorrar tiempo con IA.",
  "Correo recibido; Plantilla de respuesta; Revisión humana",
  "Recordatorios; Tareas pendientes; Revisión de prioridades",
  "La IA puede sugerir mejoras en tus documentos. Revisa siempre el resultado.",
  "¡Elige una tarea y prueba! Audio de prueba, sin voz humana.",
];
const titles = [
  "3 IDEAS CON IA",
  "Correos electrónicos",
  "Organiza tus tareas",
  "Mejora tus documentos",
  "¡PRUEBA UNA IDEA!",
];
const draft = compileReelDraft(
  {
    ...marcosIdeaDefaults,
    topic: source.title,
    targetDurationMs: 30000,
    voiceProfileId: "voice-technical",
  },
  {
    title: "Demo técnica 1E · 3 formas prácticas de utilizar IA",
    scenes: source.scenes.map((scene, i) => ({
      narration: narrations[i],
      purpose: scene.purpose,
      estimatedDurationMs: 6000,
      onScreenText: titles[i],
      visualIntent: {
        kind: i === 0 || i === 4 ? "textOnly" : "image",
        description:
          i === 1
            ? "Gráfico conceptual de flujo"
            : i === 2
              ? "Gráfico conceptual de lista"
              : i === 3
                ? "Gráfico conceptual informativo"
                : "Tipografía de demo técnica",
      },
    })),
  },
);
const plan = transitionProduction(
  createProductionPlan(draft, {
    voiceProfile: {
      id: "voice-technical",
      displayName: "Audio de prueba: tonos sin voz",
      locale: "es-ES",
      source: "recorded-reference",
    },
    presenter: {
      id: "presenter-technical",
      displayName: "Demo sin persona",
      defaultVoiceProfileId: "voice-technical",
    },
  }),
  { kind: "waitingForNarration" },
);
const directory = resolve(await privateRoot(workspace, "productions"), plan.id);
await mkdir(directory, { recursive: true });
const planPath = resolve(directory, "production-plan.json");
// Never overwrite a prepared/rendered production on a second invocation.
let exists = false;
try {
  await readFile(planPath);
  exists = true;
} catch {
  /* first demo */
}
if (exists) {
  console.log({
    planPath,
    message:
      "Demo existente; usa production:resolve-visuals para inspeccionar/reutilizar y render:production para renderizar.",
  });
} else {
  await atomicJson(planPath, plan);
  await atomicJson(
    resolve(directory, "narration-manifest.json"),
    createNarrationManifest(plan),
  );
  await writeFile(resolve(directory, "narration.txt"), narrationText(plan));
  const audio = resolve(
    await privateRoot(workspace, "recordings"),
    "graphic-demo-1e.wav",
  );
  const samples = 15 * 48000,
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
  const review = resolve(directory, "technical-review.json");
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
  const result = await resolveProductionVisuals(
    workspace,
    planPath,
    true,
    true,
  );
  if (result.errors.length) throw Error(JSON.stringify(result.errors));
  // Verify local cache reuse without altering the sealed manifest.
  const reuse = [];
  for (const entry of result.plans.filter(
    (p) => p.resolver === "localGraphic-v1",
  ))
    reuse.push(
      (
        await new LocalGraphicResolver(workspace, directory, true).resolve(
          entry,
        )
      ).metrics,
    );
  await mkdir(resolve(".local/phase-1e"), { recursive: true });
  await atomicJson(resolve(".local/phase-1e/demo.json"), {
    planPath,
    directory,
    productionId: plan.id,
    technicalAudio: true,
    sourceDraftHash: contentHash(source),
    result,
    reuse,
  });
  console.log({
    planPath,
    productionId: plan.id,
    result,
    reuse,
    apiCostEur: 0,
  });
}
