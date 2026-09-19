import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
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
import { GeneratedImageResolver } from "../src/infrastructure/visual/generated-image-resolver";
import { ComfyUIImageProvider } from "../src/infrastructure/visual/comfy-image-provider";
import { readComfyConfig } from "../src/infrastructure/visual/comfy-config";
import { technicalImageProduction } from "./phase-1g-fixture";
if (process.env.CI || !process.argv.includes("--technical"))
  throw Error(
    "Requires --technical outside CI; audio is test tones, never Marcos",
  );
const workspace = resolve(".");
const config = readComfyConfig();
if (!config) throw Error("Explicit REELMASTER_COMFY_CONFIG required");
const integration = JSON.parse(
  await readFile(resolve(".local/phase-1g/integration.json"), "utf8"),
);
if (integration.status !== "PASS")
  throw Error("Validate the real integration before creating the demo");
const provider = new ComfyUIImageProvider(config);
const plan = technicalImageProduction(false);
const draft = plan.draft;
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
    "mixed-demo-1g.wav",
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
    provider,
  );
  if (result.errors.length) throw Error(JSON.stringify(result.errors));
  // Verify local cache reuse without altering the sealed manifest.
  const reuse = [];
  for (const entry of result.plans.filter((p) =>
    ["localGraphic-v1", "generatedImage-v1"].includes(p.resolver),
  ))
    reuse.push(
      (
        await (
          entry.resolver === "generatedImage-v1"
            ? new GeneratedImageResolver(workspace, directory, provider)
            : new LocalGraphicResolver(workspace, directory, true)
        ).resolve(entry)
      ).metrics,
    );
  await mkdir(resolve(".local/phase-1g"), { recursive: true });
  await atomicJson(resolve(".local/phase-1g/demo.json"), {
    planPath,
    directory,
    productionId: plan.id,
    technicalAudio: true,
    backend: provider.metrics,
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
