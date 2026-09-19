import { z } from "zod";
import { DraftSceneSchema, ContentStyleSchema } from "./reel-draft";
import { VisualBrandProfileSchema } from "./visual-plan";

const phrase = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (s) =>
        [...s].every((c) => c.charCodeAt(0) >= 32 && c !== "<" && c !== ">"),
      "Plain visual phrases only",
    );
export const noTextElements = [
  "text",
  "letters",
  "typography",
  "labels",
  "signs",
  "infographic",
  "poster",
  "diagram",
  "presentation",
  "UI",
  "dashboard",
  "card",
  "slide",
  "document",
  "written information",
  "white background",
  "paper",
  "presentation board",
  "logos",
  "watermarks",
  "people",
  "hands",
] as const;
export const VisualDirectionSchema = z
  .object({
    version: z.literal(1),
    subject: phrase(160),
    environment: phrase(120),
    action: phrase(120),
    composition: z.literal(
      "one central visual concept, vertical composition, generous breathing room, details away from edges",
    ),
    framing: z.literal("medium-wide view, entire subject visible"),
    lighting: phrase(100),
    mood: phrase(80),
    palette: z
      .object({
        background: z.string().regex(/^#[a-f0-9]{6}$/i),
        accent: z.string().regex(/^#[a-f0-9]{6}$/i),
        profileId: z.string().regex(/^[a-z0-9-]{1,60}$/),
      })
      .strict(),
    forbiddenElements: z.array(phrase(40)).max(30),
    semanticGoal: phrase(180),
  })
  .strict()
  .superRefine((d, ctx) => {
    if (
      /\b(comfyui|sampler|cfg|remotion|checkpoint|https?|marcos)\b|[A-Za-z]:[\\/]|\/\//i.test(
        JSON.stringify(d),
      )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Direction must not contain infrastructure, paths or a named presenter",
      });
    for (const forbidden of noTextElements)
      if (!d.forbiddenElements.includes(forbidden))
        ctx.addIssue({
          code: "custom",
          message: `Missing no-text/anonymous policy: ${forbidden}`,
        });
    const positive = [
      d.subject,
      d.environment,
      d.action,
      d.lighting,
      d.mood,
    ].join(" ");
    if (
      /\b(comfyui|sampler|cfg|remotion|checkpoint|https?|marcos|portrait|person|people|human|hands?|fingers?|infographic|poster|diagram|presentation|ui|dashboard|cards?|slides?|document|labels?|signs?|typography|paper|white background|written information|text|letters|logos?)\b|[A-Za-z]:[\\/]|\/\//i.test(
        positive,
      )
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Direction must describe anonymous visual objects, not people, writing surfaces or infrastructure",
      });
    if (!/dark|black|charcoal/i.test(d.environment))
      ctx.addIssue({
        code: "custom",
        message: "Dark environment required by current profile",
      });
  });
export type VisualDirection = z.infer<typeof VisualDirectionSchema>;
export const VisualDirectorInputSchema = z
  .object({
    narration: DraftSceneSchema.shape.narration,
    purpose: DraftSceneSchema.shape.purpose,
    visualIntent: DraftSceneSchema.shape.visualIntent,
    contentStyle: ContentStyleSchema,
    brand: VisualBrandProfileSchema,
  })
  .strict();
export type VisualDirectorInput = z.infer<typeof VisualDirectorInputSchema>;
export const directorVersion = "visual-director-v1";
export const promptBuilderVersion = "concept-image-v2";
