import { z } from "zod";
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (s) => [...s].every((c) => c.charCodeAt(0) >= 32),
      "Control characters forbidden",
    );
export const ImageGenerationRequestSchema = z
  .object({
    version: z.literal(1),
    promptVersion: z.enum(["concept-image-v1", "concept-image-v2"]),
    directionProvenance: z
      .object({
        visualDirectionHash: z.string().regex(/^[a-f0-9]{64}$/),
        directorVersion: z.literal("visual-director-v1"),
        promptBuilderVersion: z.literal("concept-image-v2"),
        candidateNumber: z.union([z.literal(1), z.literal(2)]),
      })
      .strict()
      .optional(),
    sceneId: z.string().regex(/^scene-[1-8]$/),
    requirementId: z.string().regex(/^visual-scene-[1-8]$/),
    prompt: text(2400),
    negativePrompt: text(500).optional(),
    aspectRatio: z.enum(["9:16", "1:1", "2:3"]),
    width: z.number().int().min(256).max(768).multipleOf(32),
    height: z.number().int().min(256).max(768).multipleOf(32),
    seed: z.number().int().min(0).max(4294967295),
    style: z
      .object({
        profileId: z.string().regex(/^[a-z0-9-]{1,60}$/),
        tone: z.literal("dark-tech"),
      })
      .strict(),
    locale: text(35),
    safety: z
      .object({
        mode: z.literal("textToImage"),
        realPersonIdentity: z.literal(false),
        referenceImages: z.literal(false),
        embeddedText: z.literal(false),
        realApplicationCapture: z.literal(false),
      })
      .strict(),
    options: z
      .object({
        iterations: z.number().int().min(2).max(30),
        guidanceStrength: z.number().min(1).max(10),
        count: z.literal(1),
      })
      .strict(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (
      (r.promptVersion === "concept-image-v2") !==
      Boolean(r.directionProvenance)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "V2 requires direction provenance; legacy requests remain unchanged",
      });
    const [w, h] = r.aspectRatio.split(":").map(Number);
    if (
      r.requirementId !== `visual-${r.sceneId}` ||
      r.width * h !== r.height * w ||
      r.width * r.height > 393216
    )
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent IDs, ratio or conservative pixel budget",
      });
  });
export type ImageGenerationRequest = z.infer<
  typeof ImageGenerationRequestSchema
>;
export type ImageCapability =
  | { status: "unavailable"; reason: string }
  | { status: "available"; execution: "local"; maxPixels: number };
export const unavailableImageCapability: ImageCapability = {
  status: "unavailable",
  reason:
    "No hay un runtime y modelo de imagen local verificados. Se requiere instalación autorizada posterior.",
};
