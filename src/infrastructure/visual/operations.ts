import { resolve, basename } from "node:path";
import { access } from "node:fs/promises";
import {
  ProductionPlanSchema,
  ProductionError,
  type ProductionPlan,
} from "../../application/production-plan";
import {
  createVisualManifest,
  validateVisualManifest,
  visualAssignmentState,
  assignVisualAsset,
  resolveSceneVisual,
} from "../../application/visual-manifest";
import { resolvePreparedVisuals } from "../../application/prepared-reel";
import {
  type SceneVisualBinding,
  type VisualAsset,
  type VisualRequirementSchema,
} from "../../domain/visual-asset";
import type { z } from "zod";
import {
  productionDirectory,
  withProductionLock,
  readLocalJson,
  atomicJson,
  assertInside,
} from "../production/local-files";
import { loadPreparedProduction } from "../production/operations";
import { importVisualAsset } from "./import-asset";
import { fileHash } from "../audio/inspect";
import { contentHash } from "../../snapshot/hash";
import { ImageQualityReviewSchema } from "../../domain/image-quality";
export async function loadVisualManifest(
  directory: string,
  plan: ProductionPlan,
) {
  const path = resolve(directory, "visual-manifest.json");
  let exists = false;
  try {
    await access(path);
    exists = true;
  } catch {
    /* First visual plan. */
  }
  if (!exists) return createVisualManifest(plan);
  return validateVisualManifest(
    plan,
    await readLocalJson(await assertInside(directory, path)),
  );
}
export async function listProductionAssets(
  workspace: string,
  planPath: string,
) {
  const directory = await productionDirectory(workspace, planPath);
  return withProductionLock(directory, async () => {
    const plan = ProductionPlanSchema.parse(await readLocalJson(planPath));
    if (basename(directory) !== plan.id)
      throw new ProductionError(
        "INVALID_PLAN",
        "Production directory mismatch",
      );
    const manifest = await loadVisualManifest(directory, plan);
    await atomicJson(resolve(directory, "visual-manifest.json"), manifest);
    return { plan, manifest, directory };
  });
}
export async function verifyVisualFiles(
  directory: string,
  manifest: ReturnType<typeof createVisualManifest>,
) {
  for (const asset of manifest.assets) {
    if (
      (await fileHash(
        await assertInside(directory, resolve(directory, asset.path)),
      )) !== asset.contentHash
    )
      throw new ProductionError(
        "STALE_ARTIFACT",
        "Visual bytes changed after validation",
      );
    const editorial = asset.aiGeneration?.editorial;
    if (editorial) {
      const review = ImageQualityReviewSchema.parse(
        await readLocalJson(
          await assertInside(
            directory,
            resolve(
              directory,
              `image-candidates/review-${editorial.reviewHash}.json`,
            ),
          ),
        ),
      );
      if (
        review.reviewer.kind !== "human" ||
        review.decision !== "ACCEPT" ||
        review.contentHash !== asset.contentHash ||
        contentHash(review) !== editorial.reviewHash
      )
        throw new ProductionError(
          "STALE_ARTIFACT",
          "Editorial review is missing, rejected or changed",
        );
    }
  }
}
export async function assignProductionAsset(
  workspace: string,
  planPath: string,
  requirementId: string,
  file: string,
  presentation?: Partial<SceneVisualBinding["presentation"]>,
  technicalFixture = false,
  resolveAsset?: (context: {
    plan: ProductionPlan;
    directory: string;
    requirement: z.infer<typeof VisualRequirementSchema>;
  }) => Promise<VisualAsset>,
) {
  const directory = await productionDirectory(workspace, planPath);
  return withProductionLock(directory, async () => {
    let plan = ProductionPlanSchema.parse(await readLocalJson(planPath));
    if (
      basename(directory) !== plan.id ||
      !["waitingForNarration", "prepared"].includes(plan.state.kind)
    )
      throw new ProductionError(
        "INVALID_STATE",
        "Assets can be assigned only while waiting for narration or prepared; renderable productions are sealed",
      );
    let manifest = await loadVisualManifest(directory, plan);
    const requirement = manifest.requirements.find(
      (r) => r.requirementId === requirementId,
    );
    if (!requirement)
      throw new ProductionError("INVALID_PLAN", "Unknown visual requirement");
    manifest = visualAssignmentState(manifest, requirementId, "assigned");
    await atomicJson(resolve(directory, "visual-manifest.json"), manifest);
    try {
      const asset = resolveAsset
        ? await resolveAsset({ plan, directory, requirement })
        : await importVisualAsset(
            workspace,
            directory,
            file,
            requirement.requiredType,
            plan.presenter.id,
            technicalFixture,
          );
      const assigned = assignVisualAsset(
        plan,
        manifest,
        requirementId,
        asset,
        presentation,
      );
      if (plan.state.kind === "prepared") {
        const { prepared } = await loadPreparedProduction(workspace, planPath);
        let elapsedMs = 0;
        for (const scene of prepared.scenes) {
          const frames =
            Math.round(
              ((elapsedMs + scene.audio.measuredDurationMs) * 30) / 1000,
            ) - Math.round((elapsedMs * 30) / 1000);
          elapsedMs += scene.audio.measuredDurationMs;
          if (scene.id === requirement.sceneId)
            resolveSceneVisual(assigned, scene.id, frames, 30);
        }
      }
      await verifyVisualFiles(directory, assigned);
      if (plan.state.kind === "prepared" && assigned.status === "resolved") {
        const { prepared, importedRoot } = await loadPreparedProduction(
          workspace,
          planPath,
        );
        const resolved = resolvePreparedVisuals(plan, prepared, assigned);
        await atomicJson(
          resolve(importedRoot, "prepared-reel.json"),
          resolved.prepared,
        );
        await atomicJson(resolve(directory, "visual-manifest.json"), assigned);
        await atomicJson(planPath, resolved.plan);
        plan = resolved.plan;
      } else
        await atomicJson(resolve(directory, "visual-manifest.json"), assigned);
      return { plan, manifest: assigned, asset };
    } catch (error) {
      manifest = visualAssignmentState(
        manifest,
        requirementId,
        "rejected",
        error instanceof ProductionError ? error.code : "INVALID_VISUAL",
      );
      await atomicJson(resolve(directory, "visual-manifest.json"), manifest);
      throw error;
    }
  });
}
export async function productionAssetStatus(
  workspace: string,
  planPath: string,
) {
  const { plan, manifest, directory } = await listProductionAssets(
    workspace,
    planPath,
  );
  await verifyVisualFiles(directory, manifest);
  if (
    plan.visualManifestHash &&
    plan.visualManifestHash !== contentHash(manifest)
  )
    throw new ProductionError(
      "STALE_ARTIFACT",
      "Visual manifest differs from the sealed production",
    );
  return {
    productionId: plan.id,
    productionStatus: plan.state.kind,
    visualStatus: manifest.status,
    unresolvedCount: manifest.unresolvedCount,
    requirements: manifest.requirements,
    narrationReady: "receipt" in plan.state,
  };
}
