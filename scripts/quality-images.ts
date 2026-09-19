import { parseArgs, promisify } from "node:util";
import { execFile } from "node:child_process";
import { access, mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { qualityProduction } from "./phase-1h-fixture";
import { createVisualManifest } from "../src/application/visual-manifest";
import { planVisuals } from "../src/application/visual-planning";
import { LocalVisualDirector } from "../src/application/visual-director";
import {
  VisualDirectionSchema,
  type VisualDirectorInput,
} from "../src/domain/visual-direction";
import { reelMasterBrand } from "../src/domain/visual-plan";
import { ImageQualityReviewSchema } from "../src/domain/image-quality";
import { OllamaVisualDirectionProvider } from "../src/infrastructure/visual/ollama-visual-director";
import { ollamaConfigFromEnvironment } from "../src/infrastructure/text/ollama";
import { ComfyUIImageProvider } from "../src/infrastructure/visual/comfy-image-provider";
import { readComfyConfig } from "../src/infrastructure/visual/comfy-config";
import { ImageCandidateSession } from "../src/infrastructure/visual/image-candidates";
import {
  atomicJson,
  privateRoot,
  readLocalJson,
} from "../src/infrastructure/production/local-files";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "real-local": { type: "boolean" },
    concept: { type: "string" },
    file: { type: "string" },
  },
});
const command = positionals[0];
if (
  process.env.CI ||
  !values["real-local"] ||
  !["direct", "generate", "inspect", "review", "status"].includes(command)
)
  throw Error(
    "quality:images direct|generate|inspect|review|status requires --real-local outside CI",
  );
const config = readComfyConfig();
if (!config) throw Error("Explicit REELMASTER_COMFY_CONFIG required");
const workspace = resolve("."),
  plan = qualityProduction(),
  directory = resolve(await privateRoot(workspace, "productions"), plan.id),
  evidence = resolve(".local/phase-1h");
await mkdir(directory, { recursive: true });
await mkdir(evidence, { recursive: true });
try {
  await access(resolve(directory, "production-plan.json"));
} catch {
  await atomicJson(resolve(directory, "production-plan.json"), plan);
  await atomicJson(
    resolve(directory, "visual-manifest.json"),
    createVisualManifest(plan),
  );
}
const provider = new ComfyUIImageProvider(config),
  entries = planVisuals(
    plan,
    createVisualManifest(plan),
    provider.capability(),
  );
try {
  if (command === "direct") {
    let existing = false;
    try {
      await access(resolve(evidence, "directions.json"));
      existing = true;
    } catch {
      /* first direction batch */
    }
    if (existing)
      throw Error(
        "Directions already exist; preserve candidate context and evidence",
      );
    const textConfig = ollamaConfigFromEnvironment(process.env);
    let directionProvider: OllamaVisualDirectionProvider | undefined;
    let connectionIssue: string | undefined;
    try {
      directionProvider =
        await OllamaVisualDirectionProvider.connect(textConfig);
    } catch {
      connectionIssue =
        "Local instruct model unavailable; deterministic conservative direction used. No download attempted.";
    }
    const director = new LocalVisualDirector(
      directionProvider,
      textConfig.timeoutMs,
    );
    const results = [];
    try {
      for (const scene of plan.draft.scenes) {
        const input: VisualDirectorInput = {
          narration: scene.narration,
          purpose: scene.purpose,
          visualIntent: scene.visualIntent,
          contentStyle: plan.draft.contentStyle,
          brand: reelMasterBrand,
        };
        const result = await director.direct(input);
        results.push({ sceneId: scene.id, input, ...result });
        await atomicJson(
          resolve(evidence, "directions-progress.json"),
          results,
        );
      }
    } finally {
      // Release only the instruct model used for this batch before starting SDXL.
      // Keep the Ollama service itself running; no process killing or downloads.
      if (directionProvider)
        await promisify(execFile)("ollama", ["stop", textConfig.model], {
          windowsHide: true,
          env: { ...process.env, OLLAMA_HOST: textConfig.endpoint },
        });
    }
    await atomicJson(resolve(evidence, "directions.json"), {
      productionId: plan.id,
      directory,
      model: directionProvider?.identity() ?? null,
      ...(connectionIssue ? { connectionIssue } : {}),
      results,
      apiCostEur: 0,
    });
    console.log({ productionId: plan.id, results });
  } else {
    const saved = z
      .object({
        results: z.array(
          z.object({ sceneId: z.string(), direction: VisualDirectionSchema }),
        ),
      })
      .parse(await readLocalJson(resolve(evidence, "directions.json")));
    const indexes = values.concept ? [Number(values.concept) - 1] : [0, 1, 2];
    if (indexes.some((i) => !Number.isInteger(i) || i < 0 || i > 2))
      throw Error("Concept must be 1, 2 or 3");
    for (const index of indexes) {
      const entry = entries[index],
        direction = saved.results.find(
          (r) => r.sceneId === entry.sceneId,
        )!.direction;
      const session = new ImageCandidateSession(
        workspace,
        directory,
        provider,
        entry,
        direction,
        [2026091201 + index * 100, 2026091202 + index * 100],
      );
      if (command === "generate") {
        const current = await session.status();
        if (current.status !== "ready") {
          console.log({
            concept: index + 1,
            status: current.status,
            message: "No generation without a ready review state",
          });
          continue;
        }
        const candidate = await session.generateNext();
        if (candidate.technicalAsset) {
          const preview = resolve(
            evidence,
            `concept-${index + 1}-candidate-${candidate.candidateNumber}.png`,
          );
          await copyFile(
            resolve(directory, candidate.technicalAsset.path),
            preview,
          );
          console.log({
            concept: index + 1,
            candidateNumber: candidate.candidateNumber,
            seed: candidate.seed,
            status: candidate.status,
            hash: candidate.technicalAsset.contentHash,
            preview,
          });
        } else
          console.log({
            concept: index + 1,
            status: candidate.status,
            error: candidate.error,
          });
      } else if (command === "inspect" || command === "review") {
        if (!values.file || !values.concept)
          throw Error(
            "Review commands require --concept and --file containing explicit review data",
          );
        const review = ImageQualityReviewSchema.parse(
          await readLocalJson(resolve(values.file)),
        );
        console.log(
          command === "inspect"
            ? await session.inspect(review)
            : await session.review(review),
        );
      } else console.log(await session.status());
    }
  }
} finally {
  await provider.close();
  if (command === "generate")
    await atomicJson(
      resolve(evidence, `backend-${Date.now()}.json`),
      provider.metrics,
    );
}
