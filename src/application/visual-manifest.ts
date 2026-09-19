import {
  VisualAssetManifestSchema,
  VisualAssetSchema,
  BindingPresentationSchema,
  type VisualAssetManifest,
  type VisualAsset,
  type SceneVisualBinding,
  visualSafeBox,
} from "../domain/visual-asset";
import {
  ProductionPlanSchema,
  ProductionError,
  type ProductionPlan,
} from "./production-plan";
export function createVisualManifest(raw: ProductionPlan): VisualAssetManifest {
  const plan = ProductionPlanSchema.parse(raw);
  const requirements = plan.assetRequirements
    .filter((r) => r.type !== "none")
    .map((r) => ({
      requirementId: `visual-${r.sceneId}`,
      sceneId: r.sceneId,
      requiredType: r.type,
      description: r.description,
      optional: false,
      status: "missing",
    }));
  return VisualAssetManifestSchema.parse({
    version: 1,
    productionId: plan.id,
    draftContentHash: plan.draftContentHash,
    requirements,
    assets: [],
    bindings: [],
    unresolvedCount: requirements.length,
    status: requirements.length ? "unresolved" : "resolved",
  });
}
export function validateVisualManifest(plan: ProductionPlan, raw: unknown) {
  const manifest = VisualAssetManifestSchema.parse(raw),
    expected = createVisualManifest(plan);
  if (
    manifest.productionId !== plan.id ||
    manifest.draftContentHash !== plan.draftContentHash ||
    manifest.requirements.length !== expected.requirements.length ||
    manifest.requirements.some(
      (r, i) =>
        r.requirementId !== expected.requirements[i].requirementId ||
        r.sceneId !== expected.requirements[i].sceneId ||
        r.requiredType !== expected.requirements[i].requiredType ||
        r.description !== expected.requirements[i].description,
    ) ||
    manifest.assets.some(
      (a) => a.presenterId && a.presenterId !== plan.presenter.id,
    )
  )
    throw new ProductionError(
      "STALE_ARTIFACT",
      "Visual manifest does not match the production/presenter",
    );
  return manifest;
}
export function visualAssignmentState(
  manifest: VisualAssetManifest,
  requirementId: string,
  status: "assigned" | "rejected",
  rejectionCode?: string,
) {
  if (!manifest.requirements.some((r) => r.requirementId === requirementId))
    throw new ProductionError("INVALID_PLAN", "Unknown visual requirement");
  const bindings = manifest.bindings.filter(
    (b) => b.requirementId !== requirementId,
  );
  const assets = manifest.assets.filter((a) =>
    bindings.some((b) => b.assetId === a.id),
  );
  const requirements = manifest.requirements.map((r) =>
    r.requirementId === requirementId
      ? { ...r, status, ...(rejectionCode ? { rejectionCode } : {}) }
      : r,
  );
  const unresolvedCount = requirements.filter(
    (r) => r.status !== "validated",
  ).length;
  return VisualAssetManifestSchema.parse({
    ...manifest,
    requirements,
    bindings,
    assets,
    unresolvedCount,
    status: unresolvedCount ? "unresolved" : "resolved",
  });
}
export function assignVisualAsset(
  plan: ProductionPlan,
  rawManifest: VisualAssetManifest,
  requirementId: string,
  rawAsset: VisualAsset,
  presentation?: Partial<SceneVisualBinding["presentation"]>,
) {
  const manifest = validateVisualManifest(plan, rawManifest),
    asset = VisualAssetSchema.parse(rawAsset);
  if (
    asset.aiGeneration?.editorial &&
    asset.aiGeneration.editorial.reviewDecision !== "ACCEPT"
  )
    throw new ProductionError(
      "INVALID_PLAN",
      "Image candidate requires final human ACCEPT before assignment",
    );
  const requirement = manifest.requirements.find(
    (r) => r.requirementId === requirementId,
  );
  if (!requirement)
    throw new ProductionError("INVALID_PLAN", "Unknown visual requirement");
  const bindings = manifest.bindings.filter(
    (b) => b.requirementId !== requirementId,
  );
  bindings.push({
    sceneId: requirement.sceneId,
    requirementId,
    assetId: asset.id,
    presentation: BindingPresentationSchema.parse({
      fit: requirement.requiredType === "screenCapture" ? "contain" : "cover",
      focalPointX: 0.5,
      focalPointY: 0.5,
      startOffsetMs: 0,
      muted: true,
      shortVideoPolicy: "reject",
      ...presentation,
    }),
  });
  const assets = [
    ...manifest.assets.filter((a) => a.id !== asset.id),
    asset,
  ].filter((a) => bindings.some((b) => b.assetId === a.id));
  const requirements = manifest.requirements.map((r) =>
    r.requirementId === requirementId
      ? {
          requirementId: r.requirementId,
          sceneId: r.sceneId,
          requiredType: r.requiredType,
          description: r.description,
          optional: false,
          status: "validated",
        }
      : r,
  );
  const unresolvedCount = requirements.filter(
    (r) => r.status !== "validated",
  ).length;
  return validateVisualManifest(plan, {
    ...manifest,
    requirements,
    bindings,
    assets,
    unresolvedCount,
    status: unresolvedCount ? "unresolved" : "resolved",
  });
}
export function resolveSceneVisual(
  manifest: VisualAssetManifest,
  sceneId: string,
  renderedFrames: number,
  fps: number,
) {
  const binding = manifest.bindings.find((b) => b.sceneId === sceneId);
  if (!binding)
    throw new ProductionError(
      "ASSETS_PENDING",
      "Scene has no validated visual binding",
    );
  const asset = manifest.assets.find((a) => a.id === binding.assetId)!;
  if (
    asset.metadata.kind === "video" &&
    Math.round((binding.presentation.startOffsetMs * fps) / 1000) +
      renderedFrames >
      Math.floor((asset.metadata.durationMs * fps) / 1000)
  )
    throw new ProductionError(
      "ASSETS_PENDING",
      "Visual clip is shorter than the measured scene plus its start offset; no looping or stretching is allowed",
    );
  return {
    kind: asset.metadata.kind,
    artifactId: asset.id,
    contentHash: asset.contentHash,
    ...binding.presentation,
    durationMs: asset.metadata.durationMs,
    box: { ...visualSafeBox },
  };
}
