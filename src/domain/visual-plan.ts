import { z } from "zod";
import { ImageGenerationRequestSchema } from "./image-generation";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const copy = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (value) =>
        [...value].every(
          (char) => char.charCodeAt(0) >= 32 && char !== "<" && char !== ">",
        ),
      "Control characters and markup are not supported",
    );
export const GraphicSpecSchema = z
  .object({
    layout: z.enum(["title", "list", "flow"]),
    headline: copy(60),
    supportingText: copy(140).optional(),
    items: z.array(copy(60)).max(3),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (
      (s.layout === "title" && s.items.length !== 0) ||
      (s.layout !== "title" && s.items.length < 2)
    )
      ctx.addIssue({
        code: "custom",
        message: "Title has no items; list/flow require 2–3 items",
      });
  });
export type GraphicSpec = z.infer<typeof GraphicSpecSchema>;
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
function luminance(hex: string) {
  const rgb = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
export const VisualBrandProfileSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,60}$/),
    typography: z.literal("inter-latin-wght-local-v1"),
    spacing: z.number().int().min(40).max(64),
    radius: z.number().int().min(0).max(32),
    density: z.literal("comfortable"),
    visualTone: z.literal("dark-tech"),
    colors: z
      .object({
        background: color,
        surface: color,
        text: color,
        muted: color,
        accent: color,
      })
      .strict(),
  })
  .strict()
  .superRefine((b, ctx) => {
    for (const bg of [b.colors.background, b.colors.surface])
      for (const fg of [b.colors.text, b.colors.muted, b.colors.accent]) {
        const a = luminance(bg),
          c = luminance(fg);
        if ((Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05) < 4.5)
          ctx.addIssue({
            code: "custom",
            message: "Text and accent require WCAG contrast >=4.5",
          });
      }
  });
export type VisualBrandProfile = z.infer<typeof VisualBrandProfileSchema>;
export const reelMasterBrand = VisualBrandProfileSchema.parse({
  id: "reelmaster-dark-v1",
  typography: "inter-latin-wght-local-v1",
  spacing: 56,
  radius: 24,
  density: "comfortable",
  visualTone: "dark-tech",
  colors: {
    background: "#101216",
    surface: "#1d2430",
    text: "#f5f6f7",
    muted: "#b9c5d5",
    accent: "#c4ff62",
  },
});
export const VisualStrategySchema = z.enum([
  "manual",
  "localGraphic",
  "localTextVisual",
  "existingAsset",
  "generatedImage",
  "generatedVideo",
  "stockSearch",
  "avatar",
]);
export const VisualPlanSchema = z
  .object({
    version: z.literal(1),
    productionId: z.string().regex(/^production-[a-f0-9]{64}$/),
    draftContentHash: hash,
    sceneId: z.string().regex(/^scene-[1-8]$/),
    requirementId: z.string().regex(/^visual-scene-[1-8]$/),
    semanticType: z.enum(["presenter", "screenCapture", "broll", "image"]),
    description: z.string().min(1).max(300),
    strategy: VisualStrategySchema,
    resolver: z.enum([
      "manual-v1",
      "localGraphic-v1",
      "existingAsset-v1",
      "unavailable",
      "generatedImage-v1",
    ]),
    status: z.enum([
      "planned",
      "manualRequired",
      "resolved",
      "failed",
      "unsupported",
      "unavailable",
    ]),
    reason: z.string().min(1).max(300),
    provenance: z
      .object({ policyVersion: z.literal("local-policy-v1"), inputHash: hash })
      .strict(),
    graphicSpec: GraphicSpecSchema.optional(),
    brand: VisualBrandProfileSchema.optional(),
    imageRequest: ImageGenerationRequestSchema.optional(),
    assetId: z
      .string()
      .regex(/^visual-[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const local = ["localGraphic", "localTextVisual"].includes(p.strategy);
    if (
      p.requirementId !== `visual-${p.sceneId}` ||
      (local &&
        (p.semanticType !== "image" ||
          p.resolver !== "localGraphic-v1" ||
          !p.graphicSpec ||
          !p.brand ||
          !["planned", "resolved", "failed"].includes(p.status))) ||
      (!local && Boolean(p.graphicSpec || p.brand)) ||
      (p.strategy === "manual" &&
        (p.resolver !== "manual-v1" || p.status !== "manualRequired")) ||
      (p.strategy === "existingAsset" &&
        (p.resolver !== "existingAsset-v1" ||
          p.status !== "resolved" ||
          !p.assetId)) ||
      (p.imageRequest &&
        (p.strategy !== "generatedImage" ||
          p.imageRequest.sceneId !== p.sceneId ||
          p.imageRequest.requirementId !== p.requirementId)) ||
      (p.strategy === "generatedImage" &&
        (p.semanticType !== "image" ||
          (p.resolver === "unavailable"
            ? !["unsupported", "unavailable"].includes(p.status)
            : p.resolver !== "generatedImage-v1" ||
              !p.imageRequest ||
              !["planned", "resolved", "failed"].includes(p.status)))) ||
      (["generatedVideo", "stockSearch", "avatar"].includes(p.strategy) &&
        (p.resolver !== "unavailable" || p.status !== "unsupported")) ||
      (p.status === "resolved" && !p.assetId)
    )
      ctx.addIssue({
        code: "custom",
        message: "Inconsistent strategy/resolver/status",
      });
  });
export type VisualPlan = z.infer<typeof VisualPlanSchema>;
export class VisualResolutionError extends Error {
  constructor(
    public readonly code:
      | "MANUAL_REQUIRED"
      | "UNSUPPORTED_STRATEGY"
      | "INVALID_SPEC"
      | "OVERFLOW"
      | "CACHE_CORRUPT"
      | "GENERATION_FAILED"
      | "STALE_PLAN"
      | "UNAVAILABLE"
      | "TIMEOUT"
      | "STARTUP_TIMEOUT"
      | "WORKFLOW_REJECTED"
      | "MODEL_MISSING"
      | "INVALID_OUTPUT"
      | "CANCELLED"
      | "OUT_OF_MEMORY"
      | "REVIEW_REQUIRED"
      | "CANDIDATE_LIMIT",
    message: string,
  ) {
    super(message);
    this.name = "VisualResolutionError";
  }
}
