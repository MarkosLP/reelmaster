import { z } from "zod";
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const RecordingReviewSchema = z
  .object({
    productionId: z.string(),
    draftContentHash: HashSchema,
    narrationHash: HashSchema,
    recordingHash: HashSchema,
    exactScriptRead: z.literal(true),
    boundariesReviewed: z.literal(true),
    sceneIds: z.array(z.string()).min(2).max(8),
    sceneBoundariesMs: z
      .array(z.number().int().positive().max(60000))
      .min(1)
      .max(7),
  })
  .strict();
export type RecordingReview = z.infer<typeof RecordingReviewSchema>;
export const RecordingImportSchema = z
  .object({
    schemaVersion: z.literal(1),
    review: RecordingReviewSchema,
    source: z
      .object({
        contentHash: HashSchema,
        codec: z.string(),
        sampleRate: z.number().int().positive(),
        channels: z.number().int().min(1).max(2),
        bytes: z
          .number()
          .int()
          .positive()
          .max(50 * 1024 * 1024),
        reportedDurationMs: z.number().positive().max(60000),
      })
      .strict(),
    normalized: z
      .object({
        contentHash: HashSchema,
        durationSamples: z.number().int().positive(),
        measuredDurationMs: z.number().int().positive().max(60000),
        sampleRate: z.literal(48000),
      })
      .strict(),
    segments: z
      .array(
        z
          .object({
            sceneId: z.string(),
            artifactId: z.string(),
            path: z.string().regex(/^audio\/scene-[1-8]\.wav$/),
            contentHash: HashSchema,
            inputHash: HashSchema,
            measuredDurationMs: z.number().int().min(1000).max(60000),
            durationSamples: z.number().int().positive(),
            sampleRate: z.literal(48000),
            sourceStartSample: z.number().int().nonnegative(),
            sourceEndSample: z.number().int().positive(),
            speechRegions: z
              .array(
                z
                  .object({
                    startMs: z.number().int().nonnegative(),
                    endMs: z.number().int().positive(),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      )
      .min(2)
      .max(8),
    segmentationSource: z.literal("human-reviewed-silence-boundaries"),
    measurementSource: z.literal("MEASURED"),
    recipeVersion: z.literal("recorded-pcm48-reviewed-cuts-v1"),
    ffmpegVersion: z.string(),
    elapsedMs: z.number().nonnegative(),
  })
  .strict();
export type RecordingImport = z.infer<typeof RecordingImportSchema>;
