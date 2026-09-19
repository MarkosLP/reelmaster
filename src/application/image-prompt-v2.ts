import { ImageGenerationRequestSchema } from "../domain/image-generation";
import {
  VisualDirectionSchema,
  directorVersion,
  promptBuilderVersion,
  type VisualDirection,
} from "../domain/visual-direction";
import { contentHash } from "../snapshot/hash";

export function buildDirectedImageRequest(
  raw: VisualDirection,
  sceneId: string,
  locale: string,
  seed: number,
  candidateNumber: 1 | 2,
) {
  const direction = VisualDirectionSchema.parse(raw);
  // Only affirmative visual phrases reach the positive image prompt. No narrative,
  // semanticGoal, hex palette, layout instructions or forbidden word list.
  const prompt = `Cinematic 3D illustration of ${direction.subject}. ${direction.action}. ${direction.environment}. ${direction.lighting}. ${direction.mood}. ${direction.composition}. ${direction.framing}. Single continuous scene, smooth unmarked surfaces.`;
  return ImageGenerationRequestSchema.parse({
    version: 1,
    promptVersion: promptBuilderVersion,
    directionProvenance: {
      visualDirectionHash: contentHash(direction),
      directorVersion,
      promptBuilderVersion,
      candidateNumber,
    },
    sceneId,
    requirementId: `visual-${sceneId}`,
    prompt,
    negativePrompt: direction.forbiddenElements.join(", "),
    aspectRatio: "2:3",
    width: 512,
    height: 768,
    seed,
    style: { profileId: direction.palette.profileId, tone: "dark-tech" },
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
