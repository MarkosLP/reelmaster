import { z } from "zod";

export const ContentStyleSchema = z.enum([
  "educational",
  "impactful",
  "minimal",
  "tech",
  "storytelling",
]);
export const TargetDurationSchema = z.union([
  z.literal(15000),
  z.literal(30000),
  z.literal(45000),
  z.literal(60000),
]);
const text = (max: number) => z.string().trim().min(1).max(max);
export const LocaleSchema = text(35).refine((value) => {
  try {
    return Intl.getCanonicalLocales(value).length === 1;
  } catch {
    return false;
  }
}, "Invalid BCP 47 locale");
export const IdeaRequestSchema = z
  .object({
    topic: text(2000),
    locale: LocaleSchema,
    targetDurationMs: TargetDurationSchema,
    contentStyle: ContentStyleSchema,
    audience: text(300),
    voiceProfileId: text(100),
    orientation: z.enum(["vertical", "horizontal", "square"]),
  })
  .strict();
export type IdeaRequest = z.infer<typeof IdeaRequestSchema>;
export const VisualIntentSchema = z
  .object({
    kind: z.enum(["avatarTalking", "screenDemo", "broll", "image", "textOnly"]),
    description: text(300),
  })
  .strict();
export const GeneratedContentSchema = z
  .object({
    title: text(120),
    scenes: z
      .array(
        z
          .object({
            narration: text(600),
            purpose: z.enum([
              "hook",
              "explanation",
              "example",
              "reinforcement",
              "cta",
              "closing",
            ]),
            visualIntent: VisualIntentSchema,
            estimatedDurationMs: z.number().int().min(1000).max(60000),
            onScreenText: text(100).nullable(),
          })
          .strict(),
      )
      .min(2)
      .max(8),
  })
  .strict();
export type GeneratedContent = z.infer<typeof GeneratedContentSchema>;
export const DraftSceneSchema = GeneratedContentSchema.shape.scenes.element
  .extend({
    id: z.string().regex(/^scene-[1-8]$/),
    order: z.number().int().min(0).max(7),
  })
  .strict();
export const ReelDraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    status: z.literal("draft"),
    title: text(120),
    hook: text(240),
    locale: LocaleSchema,
    targetDurationMs: TargetDurationSchema,
    audience: text(300),
    contentStyle: ContentStyleSchema,
    voiceProfileId: text(100),
    orientation: IdeaRequestSchema.shape.orientation,
    fullNarration: text(4807),
    scenes: z.array(DraftSceneSchema).min(2).max(8),
    cta: text(240).nullable(),
  })
  .strict()
  .superRefine((draft, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (new Set(draft.scenes.map((s) => s.id)).size !== draft.scenes.length)
      issue("Duplicate scene IDs");
    if (draft.scenes.some((s, i) => s.order !== i || s.id !== `scene-${i + 1}`))
      issue("Incoherent scene order/ID");
    if (draft.fullNarration !== draft.scenes.map((s) => s.narration).join(" "))
      issue("fullNarration must match scenes exactly");
    if (
      draft.scenes.reduce((sum, s) => sum + s.estimatedDurationMs, 0) !==
      draft.targetDurationMs
    )
      issue("Editorial scene durations must sum to target");
    if (
      draft.scenes[0].purpose !== "hook" ||
      draft.scenes[0].narration !== draft.hook
    )
      issue("Hook must open the first narration");
    const ctaScenes = draft.scenes.filter((s) => s.purpose === "cta");
    if (ctaScenes.length > 1 || draft.cta !== (ctaScenes[0]?.narration ?? null))
      issue("CTA must match the single optional CTA scene");
    if (draft.scenes.slice(1).some((s) => s.purpose === "hook"))
      issue("Only the opening scene can be a hook");
  });
export type ReelDraft = z.infer<typeof ReelDraftSchema>;
