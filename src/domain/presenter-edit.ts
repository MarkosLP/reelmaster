import { z } from "zod";
const frame = z.number().int().nonnegative();
export const PresenterEditPlanSchema = z
  .object({
    version: z.literal(1),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
    rawTranscriptHash: z.string().regex(/^[a-f0-9]{64}$/),
    reviewedTranscriptHash: z.string().regex(/^[a-f0-9]{64}$/),
    fps: z.literal(30),
    durationFrames: frame.positive(),
    segments: z
      .array(
        z
          .object({
            sourceStartFrame: frame,
            sourceEndFrame: frame.positive(),
            outputStartFrame: frame,
            scale: z.number().min(1).max(1.06),
            reason: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
    captions: z.array(
      z
        .object({
          startFrame: frame,
          endFrame: frame.positive(),
          text: z.string().min(1).max(48),
          reviewedWordIds: z.array(z.number().int().nonnegative()).min(1),
          timingSource: z.literal("MODEL_ESTIMATED_HUMAN_TEXT"),
        })
        .strict(),
    ),
    overlays: z.array(
      z
        .object({
          startFrame: frame,
          endFrame: frame.positive(),
          kind: z.enum(["weather-recipe", "checklist", "data-report"]),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((p, ctx) => {
    let cursor = 0,
      previousSource = 0;
    for (const s of p.segments) {
      if (
        s.sourceEndFrame <= s.sourceStartFrame ||
        s.sourceStartFrame < previousSource ||
        s.outputStartFrame !== cursor
      )
        ctx.addIssue({
          code: "custom",
          message: "Invalid joint audiovisual timeline",
        });
      cursor += s.sourceEndFrame - s.sourceStartFrame;
      previousSource = s.sourceEndFrame;
    }
    if (cursor !== p.durationFrames)
      ctx.addIssue({ code: "custom", message: "Duration mismatch" });
    let captionEnd = 0;
    for (const c of p.captions) {
      if (
        c.startFrame < captionEnd ||
        c.endFrame <= c.startFrame ||
        c.endFrame > cursor
      )
        ctx.addIssue({ code: "custom", message: "Invalid caption timing" });
      captionEnd = c.endFrame;
    }
    for (const o of p.overlays)
      if (o.endFrame <= o.startFrame || o.endFrame > cursor)
        ctx.addIssue({ code: "custom", message: "Invalid overlay timing" });
  });
export type PresenterEditPlan = z.infer<typeof PresenterEditPlanSchema>;
export function sourceToOutputFrame(
  plan: PresenterEditPlan,
  sourceFrame: number,
): number | null {
  const s = plan.segments.find(
    (s) => sourceFrame >= s.sourceStartFrame && sourceFrame < s.sourceEndFrame,
  );
  return s ? s.outputStartFrame + sourceFrame - s.sourceStartFrame : null;
}
