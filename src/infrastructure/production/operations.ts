import { mkdir, writeFile, rename, access } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { randomUUID } from "node:crypto";
import {
  createProductionPlan,
  transitionProduction,
  createNarrationManifest,
  narrationText,
  ProductionPlanSchema,
  ProductionError,
} from "../../application/production-plan";
import {
  acceptNarration,
  prepareProductionReel,
  finishPreparation,
  PreparedReelSchema,
  recordingImportHash,
  resolvePreparedVisuals,
} from "../../application/prepared-reel";
import { contentHash } from "../../snapshot/hash";
import { importRecording } from "../audio/import-recording";
import { LocalEstimatedAlignment } from "../alignment/local-estimator";
import {
  validateVisualManifest,
  resolveSceneVisual,
  visualAssignmentState,
} from "../../application/visual-manifest";
import { fileHash } from "../audio/inspect";
import {
  privateRoot,
  assertInside,
  readLocalJson,
  atomicJson,
  withProductionLock,
  productionDirectory,
} from "./local-files";

export async function prepareProduction(workspace: string, draftPath: string) {
  const input = await readLocalJson(draftPath);
  const envelope =
    typeof input === "object" && input !== null && "draft" in input
      ? (input as { draft: unknown; generation?: { contentHash?: string } })
      : undefined;
  const plan = transitionProduction(
    createProductionPlan(envelope ? envelope.draft : input),
    { kind: "waitingForNarration" },
  );
  if (
    envelope?.generation?.contentHash &&
    envelope.generation.contentHash !== plan.draftContentHash
  )
    throw new ProductionError(
      "STALE_ARTIFACT",
      "Draft differs from its generation content hash",
    );
  const root = await privateRoot(workspace, "productions"),
    directory = resolve(root, plan.id);
  await mkdir(directory, { recursive: true });
  await assertInside(root, directory);
  return withProductionLock(directory, async () => {
    const file = resolve(directory, "production-plan.json");
    let exists = false;
    try {
      await access(file);
      exists = true;
    } catch {
      /* New production. */
    }
    if (exists) {
      const existing = ProductionPlanSchema.parse(
        await readLocalJson(await assertInside(directory, file)),
      );
      if (existing.id !== plan.id)
        throw new ProductionError(
          "STALE_ARTIFACT",
          "Production identity mismatch",
        );
      return { directory, plan: existing };
    }
    await writeFile(resolve(directory, "narration.txt"), narrationText(plan), {
      flag: "wx",
    });
    await atomicJson(
      resolve(directory, "narration-manifest.json"),
      createNarrationManifest(plan),
    );
    await atomicJson(resolve(directory, "recording-review.template.json"), {
      productionId: plan.id,
      draftContentHash: plan.draftContentHash,
      narrationHash: plan.narrationHash,
      recordingHash: "REPLACE_WITH_INSPECTED_RECORDING_HASH",
      exactScriptRead: false,
      boundariesReviewed: false,
      sceneIds: plan.draft.scenes.map((s) => s.id),
      sceneBoundariesMs: [],
    });
    await atomicJson(file, plan);
    return { directory, plan };
  });
}
export async function importProduction(
  workspace: string,
  planPath: string,
  audioPath: string,
  reviewPath: string,
) {
  const directory = await productionDirectory(workspace, planPath);
  return withProductionLock(directory, async () => {
    const plan = ProductionPlanSchema.parse(await readLocalJson(planPath));
    if (basename(directory) !== plan.id)
      throw new ProductionError(
        "STALE_ARTIFACT",
        "Production folder does not match plan identity",
      );
    if (plan.state.kind !== "waitingForNarration")
      throw new ProductionError(
        "INVALID_STATE",
        "Production is not waiting for narration",
      );
    const imports = resolve(directory, "imports");
    await mkdir(imports, { recursive: true });
    await assertInside(directory, imports);
    const staging = resolve(imports, `staging-${randomUUID()}`);
    await mkdir(staging);
    const recording = await importRecording(
      workspace,
      plan,
      audioPath,
      await readLocalJson(reviewPath),
      staging,
    );
    const ready = acceptNarration(plan, recording);
    let prepared = prepareProductionReel(
      ready,
      recording,
      new LocalEstimatedAlignment(),
    );
    let next = finishPreparation(ready, prepared);
    const manifestPath = resolve(directory, "visual-manifest.json");
    let hasVisuals = false;
    try {
      await access(manifestPath);
      hasVisuals = true;
    } catch {
      /* 1C-only production. */
    }
    if (hasVisuals && next.state.kind === "prepared") {
      let manifest = validateVisualManifest(
        next,
        await readLocalJson(await assertInside(directory, manifestPath)),
      );
      let elapsedMs = 0;
      for (const scene of prepared.scenes) {
        const frames =
          Math.round(
            ((elapsedMs + scene.audio.measuredDurationMs) * 30) / 1000,
          ) - Math.round((elapsedMs * 30) / 1000);
        elapsedMs += scene.audio.measuredDurationMs;
        const binding = manifest.bindings.find((b) => b.sceneId === scene.id);
        if (!binding) continue;
        try {
          resolveSceneVisual(manifest, scene.id, frames, 30);
          const asset = manifest.assets.find((a) => a.id === binding.assetId)!;
          if (
            (await fileHash(
              await assertInside(directory, resolve(directory, asset.path)),
            )) !== asset.contentHash
          )
            throw new ProductionError("STALE_ARTIFACT", "Visual bytes changed");
        } catch (error) {
          manifest = visualAssignmentState(
            manifest,
            binding.requirementId,
            "rejected",
            error instanceof ProductionError ? error.code : "INVALID_VISUAL",
          );
        }
      }
      await atomicJson(manifestPath, manifest);
      if (manifest.status === "resolved") {
        const resolved = resolvePreparedVisuals(next, prepared, manifest);
        next = resolved.plan;
        prepared = resolved.prepared;
      }
    }
    await atomicJson(resolve(staging, "recording-import.json"), recording);
    await atomicJson(resolve(staging, "prepared-reel.json"), prepared);
    const importedRoot = resolve(imports, recordingImportHash(recording));
    await rename(staging, importedRoot);
    // Commit only after every derivative and the PreparedReel have been validated.
    await atomicJson(resolve(directory, "production-plan.json"), next);
    return {
      plan: next,
      directory,
      importedRoot,
      delta: prepared.delta,
      elapsedMs: recording.elapsedMs,
      apiCostEur: 0,
    };
  });
}
export async function loadPreparedProduction(
  workspace: string,
  planPath: string,
) {
  const directory = await productionDirectory(workspace, planPath);
  const plan = ProductionPlanSchema.parse(await readLocalJson(planPath));
  if (basename(directory) !== plan.id || !("receipt" in plan.state))
    throw new ProductionError(
      "INVALID_STATE",
      "Production has no accepted narration",
    );
  const importedRoot = await assertInside(
    directory,
    resolve(directory, "imports", plan.state.receipt.importHash),
  );
  const prepared = PreparedReelSchema.parse(
    await readLocalJson(
      await assertInside(
        importedRoot,
        resolve(importedRoot, "prepared-reel.json"),
      ),
    ),
  );
  if (
    !("preparedHash" in plan.state) ||
    contentHash(prepared) !== plan.state.preparedHash
  )
    throw new ProductionError(
      "STALE_ARTIFACT",
      "Prepared artifact hash mismatch",
    );
  return { directory, plan, importedRoot, prepared };
}
