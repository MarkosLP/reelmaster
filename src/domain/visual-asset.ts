import { z } from "zod";
import { EditorialImageProvenanceSchema } from "./image-quality";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const size = z.number().int().min(16).max(8192);
export const MediaMetadataSchema = z
  .object({
    kind: z.enum(["image", "video"]),
    width: size,
    height: size,
    orientation: z.enum(["portrait", "landscape", "square"]),
    codec: z.string().min(1),
    durationMs: z.number().nonnegative().max(120000),
    fps: z.number().nonnegative().max(120),
    hasAudio: z.boolean(),
    rotation: z.number().int(),
  })
  .strict()
  .superRefine((m, ctx) => {
    if (
      m.width * m.height > 33554432 ||
      m.orientation !==
        (m.width === m.height
          ? "square"
          : m.width > m.height
            ? "landscape"
            : "portrait") ||
      (m.kind === "image" &&
        (m.durationMs !== 0 || m.fps !== 0 || m.hasAudio)) ||
      (m.kind === "video" && (m.durationMs <= 0 || m.fps <= 0))
    )
      ctx.addIssue({ code: "custom", message: "Inconsistent media metadata" });
  });
export const VisualAssetSchema = z
  .object({
    id: z.string().regex(/^visual-[a-f0-9]{64}$/),
    type: z.enum([
      "image",
      "video",
      "screenCapture",
      "presenterImage",
      "presenterVideo",
      "illustrativeGraphic",
      "conceptualImage",
    ]),
    source: z
      .object({
        kind: z.enum(["localFile", "generatedLocal", "generatedLocalAI"]),
        contentHash: hash,
        mime: z.enum([
          "image/png",
          "image/jpeg",
          "image/webp",
          "video/mp4",
          "video/quicktime",
        ]),
        bytes: z
          .number()
          .int()
          .positive()
          .max(200 * 1024 * 1024),
        metadata: MediaMetadataSchema,
      })
      .strict(),
    mime: z.enum(["image/png", "video/mp4"]),
    contentHash: hash,
    path: z.string().regex(/^visual-assets\/[a-f0-9]{64}\.(png|mp4)$/),
    bytes: z
      .number()
      .int()
      .positive()
      .max(200 * 1024 * 1024),
    metadata: MediaMetadataSchema,
    privacy: z
      .object({
        classification: z.enum(["private", "technicalFixture"]),
        publicable: z.literal(false),
      })
      .strict(),
    presenterId: z.string().min(1).max(100).optional(),
    aiGeneration: z
      .object({
        resolver: z.literal("generatedImage-v1"),
        recipeVersion: z.literal(1),
        receiptHash: hash,
        inputHash: hash,
        promptHash: hash,
        seed: z.number().int().min(0).max(4294967295),
        editorial: EditorialImageProvenanceSchema.optional(),
        contentHash: hash,
      })
      .strict()
      .optional(),
    generation: z
      .object({
        resolver: z.literal("localGraphic-v1"),
        recipeVersion: z.literal(1),
        inputHash: hash,
        contentHash: hash,
        fontHash: hash,
        browserHash: hash,
        semanticType: z.literal("illustrativeGraphic"),
      })
      .strict()
      .optional(),
    recipe: z
      .object({
        version: z.literal("local-visual-v1"),
        ffmpegVersion: z.string().min(1),
        inputHash: hash,
      })
      .strict(),
  })
  .strict()
  .superRefine((a, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    const image = a.metadata.kind === "image";
    if (
      ([
        "image",
        "presenterImage",
        "illustrativeGraphic",
        "conceptualImage",
      ].includes(a.type) &&
        !image) ||
      (["video", "presenterVideo"].includes(a.type) && image)
    )
      issue("Semantic/physical media type mismatch");
    if (
      (a.source.kind === "generatedLocal") !== Boolean(a.generation) ||
      (a.type === "illustrativeGraphic") !== Boolean(a.generation) ||
      (a.generation && a.generation.contentHash !== a.contentHash)
    )
      issue("Generated graphics require explicit matching provenance");
    if (
      (a.source.kind === "generatedLocalAI") !== Boolean(a.aiGeneration) ||
      (a.type === "conceptualImage") !== Boolean(a.aiGeneration) ||
      (a.aiGeneration && a.aiGeneration.contentHash !== a.contentHash)
    )
      issue("AI concept images require matching independent provenance");
    if (a.type.startsWith("presenter") !== Boolean(a.presenterId))
      issue("Presenter assets require presenter identity only");
    if (
      a.metadata.rotation !== 0 ||
      a.metadata.hasAudio ||
      (image
        ? a.mime !== "image/png"
        : a.mime !== "video/mp4" ||
          a.metadata.fps !== 30 ||
          a.metadata.codec !== "h264")
    )
      issue("Asset is not normalized for rendering");
    if (a.path !== `visual-assets/${a.contentHash}.${image ? "png" : "mp4"}`)
      issue("Asset path must reference its content hash");
  });
export type VisualAsset = z.infer<typeof VisualAssetSchema>;
export const BindingPresentationSchema = z
  .object({
    fit: z.enum(["contain", "cover"]),
    focalPointX: z.number().min(0).max(1),
    focalPointY: z.number().min(0).max(1),
    startOffsetMs: z.number().int().min(0).max(120000),
    muted: z.literal(true),
    shortVideoPolicy: z.literal("reject"),
  })
  .strict();
export const SceneVisualBindingSchema = z
  .object({
    sceneId: z.string().regex(/^scene-[1-8]$/),
    requirementId: z.string().regex(/^visual-scene-[1-8]$/),
    assetId: z.string().regex(/^visual-[a-f0-9]{64}$/),
    presentation: BindingPresentationSchema,
  })
  .strict();
export const VisualRequirementSchema = z
  .object({
    requirementId: z.string().regex(/^visual-scene-[1-8]$/),
    sceneId: z.string().regex(/^scene-[1-8]$/),
    requiredType: z.enum(["presenter", "screenCapture", "broll", "image"]),
    description: z.string().min(1).max(300),
    optional: z.literal(false),
    status: z.enum(["missing", "assigned", "validated", "rejected"]),
    rejectionCode: z.string().max(100).optional(),
  })
  .strict();
export const VisualAssetManifestSchema = z
  .object({
    version: z.literal(1),
    productionId: z.string(),
    draftContentHash: hash,
    requirements: z.array(VisualRequirementSchema).max(8),
    assets: z.array(VisualAssetSchema).max(16),
    bindings: z.array(SceneVisualBindingSchema).max(8),
    unresolvedCount: z.number().int().min(0).max(8),
    status: z.enum(["unresolved", "resolved"]),
  })
  .strict()
  .superRefine((m, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      new Set(m.requirements.map((r) => r.requirementId)).size !==
        m.requirements.length ||
      new Set(m.requirements.map((r) => r.sceneId)).size !==
        m.requirements.length ||
      new Set(m.assets.map((a) => a.id)).size !== m.assets.length ||
      new Set(m.bindings.map((b) => b.requirementId)).size !== m.bindings.length
    )
      issue("Duplicate visual IDs");
    if (
      m.unresolvedCount !==
        m.requirements.filter((r) => r.status !== "validated").length ||
      m.status !== (m.unresolvedCount ? "unresolved" : "resolved")
    )
      issue("Incoherent visual readiness");
    for (const r of m.requirements) {
      const b = m.bindings.find((b) => b.requirementId === r.requirementId);
      if (
        r.requirementId !== `visual-${r.sceneId}` ||
        (r.status === "validated") !== Boolean(b)
      )
        issue("Requirement/binding state mismatch");
    }
    for (const b of m.bindings) {
      const r = m.requirements.find((r) => r.requirementId === b.requirementId),
        a = m.assets.find((a) => a.id === b.assetId);
      if (
        a?.aiGeneration?.editorial &&
        a.aiGeneration.editorial.reviewDecision !== "ACCEPT"
      )
        issue("Unreviewed/rejected AI candidates cannot appear in a manifest");
      if (
        !r ||
        !a ||
        b.sceneId !== r.sceneId ||
        !compatibleVisual(r.requiredType, a.type)
      )
        issue("Incompatible visual binding");
      if (a?.metadata.kind === "image" && b.presentation.startOffsetMs !== 0)
        issue("Images cannot have a video offset");
    }
    if (m.assets.some((a) => !m.bindings.some((b) => b.assetId === a.id)))
      issue("Unreferenced visual asset");
  });
export type VisualAssetManifest = z.infer<typeof VisualAssetManifestSchema>;
export type SceneVisualBinding = z.infer<typeof SceneVisualBindingSchema>;
export function compatibleVisual(
  required: string,
  actual: VisualAsset["type"],
) {
  return required === "presenter"
    ? ["presenterImage", "presenterVideo"].includes(actual)
    : required === "screenCapture"
      ? actual === "screenCapture"
      : required === "broll"
        ? ["image", "video"].includes(actual)
        : required === "image" &&
          ["image", "illustrativeGraphic", "conceptualImage"].includes(actual);
}
export const visualSafeBox = {
  x: 90,
  y: 380,
  width: 900,
  height: 1000,
} as const;
export const ResolvedMediaVisualSchema = z
  .object({
    kind: z.enum(["image", "video"]),
    artifactId: z.string(),
    contentHash: hash,
    fit: BindingPresentationSchema.shape.fit,
    focalPointX: BindingPresentationSchema.shape.focalPointX,
    focalPointY: BindingPresentationSchema.shape.focalPointY,
    startOffsetMs: BindingPresentationSchema.shape.startOffsetMs,
    durationMs: z.number().nonnegative().max(120000),
    muted: z.literal(true),
    shortVideoPolicy: z.literal("reject"),
    box: z
      .object({
        x: z.literal(90),
        y: z.literal(380),
        width: z.literal(900),
        height: z.literal(1000),
      })
      .strict(),
  })
  .strict();
