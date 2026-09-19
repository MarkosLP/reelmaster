import { z } from "zod";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const localPath = z
  .string()
  .regex(
    /^\.local\/presenters\/[a-z0-9-]+\/(originals|prepared)\/[a-zA-Z0-9._/-]+$/,
  )
  .refine((p) => !p.split("/").includes(".."));
export const PresenterMediaSchema = z
  .object({
    container: z.string(),
    bytes: z.number().int().positive(),
    durationSeconds: z.number().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    videoCodec: z.literal("h264"),
    fps: z
      .object({
        nominal: z.string(),
        average: z.string(),
        timeBase: z.string(),
        variable: z.boolean(),
      })
      .strict(),
    videoDurationSeconds: z.number().positive(),
    videoStartSeconds: z.literal(0),
    audio: z
      .object({
        codec: z.literal("aac"),
        sampleRate: z.literal(48000),
        channels: z.union([z.literal(1), z.literal(2)]),
        durationSeconds: z.number().positive(),
        startSeconds: z.literal(0),
        bitrate: z.number().positive(),
      })
      .strict(),
  })
  .strict()
  .refine((m) => m.height > m.width, "A real vertical video is required");
export const LoudnessMeasurementSchema = z
  .object({
    integratedLufs: z.number().finite(),
    truePeakDbtp: z.number().finite(),
    rangeLu: z.number().min(0),
  })
  .strict();
export const PresenterAssetSchema = z
  .object({
    version: z.literal(1),
    assetId: z.string().regex(/^presenter-asset-[a-f0-9]{64}$/),
    presenterId: z.string().regex(/^[a-z0-9-]+$/),
    source: z
      .object({
        kind: z.literal("recordedVideo"),
        path: localPath,
        metadata: PresenterMediaSchema,
      })
      .strict(),
    originalHash: hash,
    preparedHash: hash,
    preparedPath: localPath,
    duration: z.number().positive(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    fps: PresenterMediaSchema.shape.fps,
    preparedMetadata: PresenterMediaSchema,
    audio: z
      .object({
        original: LoudnessMeasurementSchema,
        prepared: LoudnessMeasurementSchema,
        sampleFrames: z.number().int().positive(),
      })
      .strict(),
    privacy: z
      .object({
        classification: z.literal("private"),
        localOnly: z.literal(true),
        gitIgnored: z.literal(true),
        approvedForMontage: z.literal(false),
      })
      .strict(),
    recipe: z
      .object({
        version: z.literal("presenter-audio-v1"),
        hash,
        ffmpegVersion: z.string().min(1),
        ffmpegHash: hash,
        filterGraph: z.string().min(1),
        targetLufs: z.number().min(-20).max(-16),
        truePeakCeiling: z.literal(-1.5),
        audioBitrate: z.literal(192000),
        videoProcessing: z.literal("streamCopy"),
      })
      .strict(),
    temporalModifications: z.object({ kind: z.literal("none") }).strict(),
    validation: z
      .object({
        videoPacketsAndTimestampsIdentical: z.literal(true),
        audioSampleCountIdentical: z.literal(true),
        sourceHashPreserved: z.literal(true),
      })
      .strict(),
  })
  .strict()
  .superRefine((a, ctx) => {
    const prefix = `.local/presenters/${a.presenterId}/`;
    if (
      !a.source.path.startsWith(prefix + "originals/") ||
      !a.preparedPath.startsWith(prefix + "prepared/") ||
      a.source.path === a.preparedPath
    )
      ctx.addIssue({
        code: "custom",
        message: "Presenter paths must be private and separate",
      });
    if (
      a.width !== a.preparedMetadata.width ||
      a.height !== a.preparedMetadata.height ||
      a.duration !== a.preparedMetadata.durationSeconds ||
      a.source.metadata.width !== a.width ||
      a.source.metadata.height !== a.height ||
      a.source.metadata.videoDurationSeconds !==
        a.preparedMetadata.videoDurationSeconds ||
      JSON.stringify(a.fps) !== JSON.stringify(a.preparedMetadata.fps) ||
      JSON.stringify(a.source.metadata.fps) !== JSON.stringify(a.fps) ||
      a.source.metadata.audio.channels !== a.preparedMetadata.audio.channels
    )
      ctx.addIssue({
        code: "custom",
        message: "Stream-copy identity or duration mismatch",
      });
  });
export type PresenterAsset = z.infer<typeof PresenterAssetSchema>;
