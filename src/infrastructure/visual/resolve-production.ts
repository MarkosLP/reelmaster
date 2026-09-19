import { resolve } from "node:path";
import { access } from "node:fs/promises";
import { planVisuals } from "../../application/visual-planning";
import {
  VisualPlanSchema,
  VisualResolutionError,
  type VisualPlan,
} from "../../domain/visual-plan";
import { type VisualResolution } from "../../application/ports/visual-resolver";
import { contentHash } from "../../snapshot/hash";
import {
  atomicJson,
  withProductionLock,
  readLocalJson,
  assertInside,
} from "../production/local-files";
import {
  listProductionAssets,
  assignProductionAsset,
  verifyVisualFiles,
} from "./operations";
import { LocalGraphicResolver } from "./local-graphic-resolver";
import { createVisualManifest } from "../../application/visual-manifest";
import { createLocalImageProvider } from "./image-provider";
import { GeneratedImageResolver } from "./generated-image-resolver";
import type { ImageGenerationProvider } from "../../application/ports/image-generation-provider";
export async function resolveProductionVisuals(
  workspace: string,
  planPath: string,
  execute = false,
  technical = false,
  imageProvider: ImageGenerationProvider = createLocalImageProvider(),
) {
  const start = performance.now();
  const { plan, manifest, directory } = await listProductionAssets(
    workspace,
    planPath,
  );
  await verifyVisualFiles(directory, manifest);
  if (
    plan.visualManifestHash &&
    plan.visualManifestHash !== contentHash(manifest)
  )
    throw new VisualResolutionError(
      "STALE_PLAN",
      "Sealed visual manifest changed",
    );
  try {
    const plans = planVisuals(plan, manifest, imageProvider.capability());
    let previousExists = false;
    try {
      await access(resolve(directory, "visual-plan.json"));
      previousExists = true;
    } catch {
      /* first plan */
    }
    if (previousExists) {
      const previous = (await readLocalJson(
        await assertInside(directory, resolve(directory, "visual-plan.json")),
      )) as { plans?: unknown[] };
      for (let i = 0; i < plans.length; i++) {
        const current = plans[i];
        if (current.strategy !== "existingAsset") continue;
        const old = previous.plans
          ?.map((p) => VisualPlanSchema.safeParse(p))
          .find(
            (p) => p.success && p.data.requirementId === current.requirementId,
          );
        if (
          old?.success &&
          ["localGraphic-v1", "generatedImage-v1"].includes(
            old.data.resolver,
          ) &&
          old.data.assetId === current.assetId &&
          old.data.provenance.inputHash === current.provenance.inputHash &&
          old.data.productionId === plan.id &&
          old.data.draftContentHash === plan.draftContentHash
        )
          plans[i] = old.data;
      }
    }
    const planningMs = performance.now() - start;
    const metrics: Array<VisualResolution["metrics"] & { sceneId: string }> =
      [];
    const errors: Array<{ sceneId: string; code: string; message: string }> =
      [];
    const save = () =>
      withProductionLock(directory, () =>
        atomicJson(resolve(directory, "visual-plan.json"), {
          version: 1,
          productionId: plan.id,
          plans,
          metrics,
          errors,
          planningMs,
          apiCostEur: 0,
        }),
      );
    await save();
    if (execute)
      for (let i = 0; i < plans.length; i++) {
        const entry = plans[i];
        if (entry.status !== "planned") continue;
        try {
          const assigned = await assignProductionAsset(
            workspace,
            planPath,
            entry.requirementId,
            "",
            { fit: "contain" },
            technical,
            async (context) => {
              const expected = planVisuals(
                context.plan,
                createVisualManifest(context.plan),
                imageProvider.capability(),
              ).find((p) => p.requirementId === entry.requirementId);
              if (contentHash(expected) !== contentHash(entry))
                throw new VisualResolutionError(
                  "STALE_PLAN",
                  "VisualPlan no longer matches the source production",
                );
              const resolver =
                entry.strategy === "generatedImage"
                  ? new GeneratedImageResolver(
                      workspace,
                      context.directory,
                      imageProvider,
                    )
                  : new LocalGraphicResolver(
                      workspace,
                      context.directory,
                      technical,
                    );
              const result = await resolver.resolve(entry);
              metrics.push({ ...result.metrics, sceneId: entry.sceneId });
              return result.asset;
            },
          );
          plans[i] = VisualPlanSchema.parse({
            ...entry,
            status: "resolved",
            assetId: assigned.asset.id,
          });
        } catch (error) {
          plans[i] = { ...entry, status: "failed" } satisfies VisualPlan;
          errors.push({
            sceneId: entry.sceneId,
            code:
              error instanceof VisualResolutionError
                ? error.code
                : "RESOLUTION_FAILED",
            message:
              error instanceof VisualResolutionError
                ? error.message
                : "No se pudo validar/asignar el recurso local.",
          });
        }
        await save();
      }
    return { plans, metrics, errors, planningMs, apiCostEur: 0 };
  } finally {
    await imageProvider.close?.();
  }
}
