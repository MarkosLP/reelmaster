import { DraftSceneSchema, type ReelDraft } from "../domain/reel-draft";
import { ImageGenerationRequestSchema } from "../domain/image-generation";
import {
  VisualBrandProfileSchema,
  VisualResolutionError,
  type VisualBrandProfile,
} from "../domain/visual-plan";
export function buildImageRequest(
  scene: ReelDraft["scenes"][number],
  brand: VisualBrandProfile,
  locale: string,
  seed = 42,
) {
  const s = DraftSceneSchema.parse(scene),
    b = VisualBrandProfileSchema.parse(brand);
  if (
    s.visualIntent.kind !== "image" ||
    /\b(marcos|presenter|retrato|captura|screenshot|logotipo)\b/iu.test(
      `${s.visualIntent.description} ${s.narration}`,
    )
  )
    throw new VisualResolutionError(
      "INVALID_SPEC",
      "Only anonymous conceptual text-to-image is supported",
    );
  const subject = s.visualIntent.description.replace(
    /^imagen\s+IA\s*(conceptual)?\s*:\s*/iu,
    "",
  );
  return ImageGenerationRequestSchema.parse({
    version: 1,
    promptVersion: "concept-image-v1",
    sceneId: s.id,
    requirementId: `visual-${s.id}`,
    prompt: `Representación conceptual: ${subject}. Contexto narrativo (no escribirlo en la imagen): ${s.narration}. Función editorial: ${s.purpose}. Composición vertical, foco central, espacio alrededor del sujeto, ambiente tecnológico oscuro, limpio y de alto contraste. Paleta ${b.colors.background}, ${b.colors.accent}. Sin palabras, letras, cifras, logos ni interfaces de aplicaciones reales. Sin identidad de personas reales; no representar al narrador.`,
    negativePrompt:
      "texto, letras, subtítulos, logotipos, marcas de agua, interfaz real, identidad de una persona real",
    aspectRatio: "2:3",
    width: 512,
    height: 768,
    seed,
    style: { profileId: b.id, tone: b.visualTone },
    locale,
    safety: {
      mode: "textToImage",
      realPersonIdentity: false,
      referenceImages: false,
      embeddedText: false,
      realApplicationCapture: false,
    },
    options: { iterations: 2, guidanceStrength: 1, count: 1 },
  });
}
