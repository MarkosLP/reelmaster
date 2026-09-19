import { type ProductionPlan, ProductionPlanSchema } from "./production-plan";
import { validateVisualManifest } from "./visual-manifest";
import { type VisualAssetManifest } from "../domain/visual-asset";
import {
  GraphicSpecSchema,
  VisualPlanSchema,
  reelMasterBrand,
  type VisualPlan,
} from "../domain/visual-plan";
import { contentHash } from "../snapshot/hash";
import { buildImageRequest } from "./image-prompt";
import {
  unavailableImageCapability,
  type ImageCapability,
} from "../domain/image-generation";
export function planVisuals(
  raw: ProductionPlan,
  manifest: VisualAssetManifest,
  imageCapability: ImageCapability = unavailableImageCapability,
): VisualPlan[] {
  const plan = ProductionPlanSchema.parse(raw);
  validateVisualManifest(plan, manifest);
  return manifest.requirements.map((r) => {
    const scene = plan.draft.scenes.find((s) => s.id === r.sceneId)!;
    const binding = manifest.bindings.find(
      (b) => b.requirementId === r.requirementId,
    );
    const base = {
      version: 1,
      productionId: plan.id,
      draftContentHash: plan.draftContentHash,
      sceneId: r.sceneId,
      requirementId: r.requirementId,
      semanticType: r.requiredType,
      description: r.description,
      provenance: {
        policyVersion: "local-policy-v1",
        inputHash: contentHash({
          scene,
          requirement: { type: r.requiredType, description: r.description },
          policy: "local-policy-v1",
        }),
      },
    };
    if (binding)
      return VisualPlanSchema.parse({
        ...base,
        strategy: "existingAsset",
        resolver: "existingAsset-v1",
        status: "resolved",
        reason: "Recurso ya validado en el manifiesto de esta producción.",
        assetId: binding.assetId,
      });
    const aiIntent =
      r.requiredType === "image" &&
      /^imagen\s+IA\s*(conceptual)?\s*:/iu.test(r.description) &&
      !/\b(lista|flujo|diagrama|infograf[ií]a)\b/iu.test(r.description);
    if (aiIntent) {
      try {
        const imageRequest = buildImageRequest(
          scene,
          reelMasterBrand,
          plan.draft.locale,
        );
        const available =
          imageCapability.status === "available" &&
          imageCapability.execution === "local" &&
          imageRequest.width * imageRequest.height <= imageCapability.maxPixels;
        return VisualPlanSchema.parse({
          ...base,
          strategy: "generatedImage",
          resolver: available ? "generatedImage-v1" : "unavailable",
          status: available ? "planned" : "unavailable",
          imageRequest,
          reason: available
            ? "Intención explícita de imagen conceptual IA y capacidad local disponible."
            : imageCapability.status === "unavailable"
              ? imageCapability.reason
              : "La capacidad local no admite las dimensiones conservadoras solicitadas.",
        });
      } catch {
        return VisualPlanSchema.parse({
          ...base,
          strategy: "manual",
          resolver: "manual-v1",
          status: "manualRequired",
          reason:
            "La intención no es compatible con text-to-image conceptual anónimo. Requiere revisión editorial.",
        });
      }
    }
    const conceptual =
      r.requiredType === "image" &&
      /\b(conceptual|concepto|diagrama|infograf[ií]a|gr[aá]fico|ilustrativ[oa])\b/iu.test(
        r.description,
      ) &&
      !/\b(real|foto|fotograf[ií]a|captura|marca|logotipo|retrato)\b/iu.test(
        r.description,
      );
    if (conceptual) {
      const layout = /\bflujo\b/iu.test(r.description)
        ? "flow"
        : /\blista\b/iu.test(r.description)
          ? "list"
          : "title";
      const graphicSpec = GraphicSpecSchema.safeParse({
        layout,
        headline: scene.onScreenText ?? scene.visualIntent.description,
        ...(layout === "title"
          ? { supportingText: scene.narration, items: [] }
          : { items: scene.narration.split(";").map((s) => s.trim()) }),
      });
      if (graphicSpec.success)
        return VisualPlanSchema.parse({
          ...base,
          strategy: layout === "title" ? "localGraphic" : "localTextVisual",
          resolver: "localGraphic-v1",
          status: "planned",
          reason:
            "Imagen conceptual explícita; gráfico informativo local sin representar una aplicación real.",
          graphicSpec: graphicSpec.data,
          brand: reelMasterBrand,
        });
      return VisualPlanSchema.parse({
        ...base,
        strategy: "manual",
        resolver: "manual-v1",
        status: "manualRequired",
        reason:
          "El contenido excede los límites de GraphicSpec. Requiere edición editorial explícita o un archivo local.",
      });
    }
    return VisualPlanSchema.parse({
      ...base,
      strategy: "manual",
      resolver: "manual-v1",
      status: "manualRequired",
      reason: `Falta ${r.requiredType}: requiere un archivo real o una intención conceptual explícita; no se sustituye por un gráfico.`,
    });
  });
}
