import { z } from "zod";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const PresenterEditIssueSchema = z.enum([
  "cutTiming",
  "audioSync",
  "captionTiming",
  "captionText",
  "overlayTiming",
  "framing",
  "audioQuality",
  "pacing",
]);
// Revisión humana de un montaje ya exportado. Queda atada al plan y al vídeo
// concretos que se miraron: un veredicto no se puede reutilizar para otro par.
//
// `timingApproval` responde solo a si los tiempos resultan aceptables al verlos.
// No convierte los tiempos en alineación humana: los captions siguen siendo
// MODEL_ESTIMATED_HUMAN_TEXT, y aprobar un montaje no cambia su procedencia.
export const PresenterEditReviewSchema = z
  .object({
    version: z.literal(1),
    planHash: hash,
    videoHash: hash,
    sourceHash: hash,
    durationFrames: z.number().int().positive(),
    watched: z.literal(true),
    decision: z.enum(["ACCEPT", "REJECT"]),
    issues: z.array(PresenterEditIssueSchema).max(8),
    timingApproval: z.boolean(),
    notes: z.string().trim().min(5).max(1600),
    reviewer: z
      .object({
        // Un montaje solo lo puede revisar una persona: hay que verlo y oírlo.
        kind: z.literal("human"),
        name: z.string().trim().min(1).max(100),
      })
      .strict(),
    reviewedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if ((r.decision === "ACCEPT") !== (r.issues.length === 0))
      ctx.addIssue({
        code: "custom",
        message: "Acceptance requires no open issues; rejection requires them",
      });
    if (r.timingApproval && r.decision !== "ACCEPT")
      ctx.addIssue({
        code: "custom",
        message: "Timing cannot be approved on a rejected montage",
      });
    if (r.timingApproval && r.issues.includes("audioSync"))
      ctx.addIssue({
        code: "custom",
        message: "Timing cannot be approved while audio sync is an issue",
      });
  });
export type PresenterEditReview = z.infer<typeof PresenterEditReviewSchema>;
export type PresenterEditIssue = z.infer<typeof PresenterEditIssueSchema>;
