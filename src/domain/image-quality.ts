import { z } from "zod";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const ImageQualityIssueSchema = z.enum([
  "pseudotext",
  "wrongBackground",
  "semanticMismatch",
  "severeArtifact",
  "poorComposition",
  "humanArtifact",
  "brandingMismatch",
  "technicalFailure",
]);
export const ImageQualityReviewSchema = z
  .object({
    version: z.literal(1),
    candidateId: hash,
    contentHash: hash.nullable(),
    technicalValid: z.boolean(),
    editorialValid: z.boolean(),
    issues: z.array(ImageQualityIssueSchema).max(8),
    decision: z.enum(["ACCEPT", "REJECT"]),
    reviewer: z
      .object({
        kind: z.enum(["human", "codexInspection"]),
        name: z.string().trim().min(1).max(100),
      })
      .strict(),
    inspected: z.literal(true),
    notes: z.string().trim().min(5).max(1600),
    reviewedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (
      (r.decision === "ACCEPT") !==
      (r.technicalValid && r.editorialValid && r.issues.length === 0)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Acceptance requires technical and editorial validity without rejection issues",
      });
    if (r.decision === "REJECT" && (!r.issues.length || r.editorialValid))
      ctx.addIssue({
        code: "custom",
        message: "Rejection needs explicit issues and editorialValid=false",
      });
    if (r.technicalValid !== Boolean(r.contentHash))
      ctx.addIssue({
        code: "custom",
        message: "Technical validity requires the inspected content hash",
      });
  });
export type ImageQualityReview = z.infer<typeof ImageQualityReviewSchema>;
export const EditorialImageProvenanceSchema = z
  .object({
    visualDirectionHash: hash,
    directorVersion: z.literal("visual-director-v1"),
    promptBuilderVersion: z.literal("concept-image-v2"),
    candidateNumber: z.union([z.literal(1), z.literal(2)]),
    reviewDecision: z.enum(["PENDING", "ACCEPT", "REJECT"]),
    reviewIssues: z.array(ImageQualityIssueSchema).max(8),
    reviewHash: hash.optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (
      p.reviewDecision === "ACCEPT" &&
      (!p.reviewHash || p.reviewIssues.length)
    )
      ctx.addIssue({
        code: "custom",
        message: "Accepted provenance requires a clean sealed review",
      });
  });
