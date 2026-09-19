import { z } from "zod";
import {
  VisualAssetManifestSchema,
  type VisualAssetManifest,
} from "../domain/visual-asset";
import { validateVisualManifest, resolveSceneVisual } from "./visual-manifest";
import {
  AudioSchema,
  ReelSchema,
  SceneSchema,
  ThemeSchema,
} from "../domain/reel";
import {
  DraftSceneSchema,
  LocaleSchema,
  TargetDurationSchema,
} from "../domain/reel-draft";
import { VoiceProfileSchema } from "../domain/voice";
import { PresenterProfileSchema } from "../domain/presenter";
import {
  RecordingImportSchema,
  type RecordingImport,
} from "../ports/recorded-narration";
import type { AlignmentProvider } from "../ports/alignment";
import { prepareCaptionLines } from "./captions";
const narrationTheme = {
  background: "#101116",
  foreground: "#F4F4F0",
  captionStyle: {
    fontSize: 56,
    textColor: "#FFFFFF",
    activeTextColor: "#101116",
    activeBackground: "#C6FF6B",
    highlightActive: false,
  },
};
import {
  AssetRequirementSchema,
  HashSchema,
  ProductionError,
  ProductionPlanSchema,
  transitionProduction,
  type ProductionPlan,
} from "./production-plan";
import { contentHash } from "../snapshot/hash";
import {
  compileCompositionSnapshot,
  type AssetManifest,
} from "../snapshot/compile";

export function durationDelta(
  estimatedDurationMs: number,
  measuredDurationMs: number,
) {
  if (
    !Number.isSafeInteger(estimatedDurationMs) ||
    estimatedDurationMs <= 0 ||
    !Number.isSafeInteger(measuredDurationMs) ||
    measuredDurationMs <= 0
  )
    throw new ProductionError(
      "INVALID_AUDIO",
      "Positive integer durations required",
    );
  return {
    estimatedDurationMs,
    measuredDurationMs,
    deltaMs: measuredDurationMs - estimatedDurationMs,
    deltaPercent:
      Math.round(
        ((measuredDurationMs - estimatedDurationMs) / estimatedDurationMs) *
          10000,
      ) / 100,
  };
}
const DeltaSchema = z
  .object({
    estimatedDurationMs: z.number().int().positive(),
    measuredDurationMs: z.number().int().positive(),
    deltaMs: z.number().int(),
    deltaPercent: z.number(),
  })
  .strict()
  .refine(
    (d) =>
      contentHash(d) ===
      contentHash(durationDelta(d.estimatedDurationMs, d.measuredDurationMs)),
    "Incorrect duration deviation",
  );
const PreparedSceneSchema = DraftSceneSchema.extend({
  audio: AudioSchema,
  captions: SceneSchema.shape.captions,
  delta: DeltaSchema,
  audioPath: z.string().regex(/^audio\/scene-[1-8]\.wav$/),
}).strict();
export const PreparedReelSchema = z
  .object({
    schemaVersion: z.literal(1),
    productionId: z.string(),
    draftContentHash: HashSchema,
    title: z.string().min(1).max(120),
    locale: LocaleSchema,
    voiceProfile: VoiceProfileSchema,
    presenter: PresenterProfileSchema,
    targetDurationMs: TargetDurationSchema,
    narrationHash: HashSchema,
    recordingHash: HashSchema,
    importHash: HashSchema,
    scenes: z.array(PreparedSceneSchema).min(2).max(8),
    assetRequirements: z.array(AssetRequirementSchema).min(2).max(8),
    theme: ThemeSchema,
    renderProfileId: z.literal("instagram-reel-v1"),
    delta: DeltaSchema,
    captionTiming: z.literal("ESTIMATED"),
    captionMethod: z.literal("es-syllables-speech-regions-v1"),
    visualManifest: VisualAssetManifestSchema.optional(),
  })
  .strict()
  .superRefine((reel, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (reel.theme.captionStyle.highlightActive !== false)
      issue("Estimated captions cannot highlight words");
    if (
      reel.voiceProfile.id !== reel.presenter.defaultVoiceProfileId ||
      reel.voiceProfile.locale !== reel.locale
    )
      issue("Incoherent prepared identity");
    if (
      new Set(reel.scenes.map((s) => s.id)).size !== reel.scenes.length ||
      new Set(reel.scenes.map((s) => s.audio.artifactId)).size !==
        reel.scenes.length
    )
      issue("Duplicate prepared scenes or audio artifacts");
    const types = {
      avatarTalking: "presenter",
      screenDemo: "screenCapture",
      broll: "broll",
      image: "image",
      textOnly: "none",
    };
    if (reel.assetRequirements.length !== reel.scenes.length)
      issue("Missing visual requirements");
    reel.scenes.forEach((scene, i) => {
      if (
        scene.order !== i ||
        scene.id !== `scene-${i + 1}` ||
        scene.audioPath !== `audio/${scene.id}.wav` ||
        scene.audio.voiceProfileId !== reel.voiceProfile.id ||
        scene.captions.source !== "estimated" ||
        scene.delta.estimatedDurationMs !== scene.estimatedDurationMs ||
        scene.delta.measuredDurationMs !== scene.audio.measuredDurationMs
      )
        issue("Incoherent prepared scene");
      const requirement = reel.assetRequirements[i];
      if (
        !requirement ||
        requirement.sceneId !== scene.id ||
        requirement.type !== types[scene.visualIntent.kind] ||
        requirement.description !== scene.visualIntent.description
      )
        issue("Incoherent visual requirement");
      if (!SceneSchema.safeParse(resolvedScene(scene, i)).success)
        issue("Invalid prepared audio/captions");
    });
    if (
      reel.scenes.reduce((n, s) => n + s.audio.measuredDurationMs, 0) !==
        reel.delta.measuredDurationMs ||
      reel.scenes.reduce((n, s) => n + s.estimatedDurationMs, 0) !==
        reel.targetDurationMs ||
      reel.delta.estimatedDurationMs !== reel.targetDurationMs ||
      reel.delta.measuredDurationMs > 60000
    )
      issue("Invalid prepared total duration");
  });
export type PreparedReel = z.infer<typeof PreparedReelSchema>;
function resolvedScene(scene: z.infer<typeof PreparedSceneSchema>, i: number) {
  return {
    id: scene.id,
    revision: 1,
    targetDurationMs: scene.estimatedDurationMs,
    narration: scene.narration,
    headline: scene.onScreenText ?? `Escena ${i + 1}`,
    label: "",
    accent: "#C6FF6B",
    visual: { kind: "typography", motif: "cards" },
    audio: scene.audio,
    paddingAfterMs: 0,
    transition: { kind: "fade-through-background", durationMs: 100 },
    captions: scene.captions,
  };
}
export function recordingImportHash(recording: RecordingImport) {
  const { elapsedMs: _elapsedMs, ...identity } = recording;
  void _elapsedMs;
  return contentHash(identity);
}
export function acceptNarration(rawPlan: ProductionPlan, raw: unknown) {
  const plan = ProductionPlanSchema.parse(rawPlan),
    recording = RecordingImportSchema.parse(raw);
  if (
    plan.state.kind !== "waitingForNarration" ||
    plan.narrationSource.kind !== "recorded"
  )
    throw new ProductionError(
      "INVALID_STATE",
      "Only recorded narration is implemented",
    );
  if (
    recording.review.productionId !== plan.id ||
    recording.review.draftContentHash !== plan.draftContentHash ||
    recording.review.narrationHash !== plan.narrationHash ||
    recording.review.recordingHash !== recording.source.contentHash ||
    recording.segments.length !== plan.draft.scenes.length ||
    contentHash(recording.review.sceneIds) !==
      contentHash(plan.draft.scenes.map((s) => s.id))
  )
    throw new ProductionError(
      "INVALID_REVIEW",
      "Recording import does not belong to this plan",
    );
  let previous = 0;
  recording.segments.forEach((s, i) => {
    if (
      s.sceneId !== plan.draft.scenes[i].id ||
      s.path !== `audio/${s.sceneId}.wav` ||
      s.sourceStartSample !== previous ||
      s.sourceEndSample - s.sourceStartSample !== s.durationSamples ||
      Math.round(s.durationSamples / 48) !== s.measuredDurationMs ||
      (i < recording.segments.length - 1 &&
        s.sourceEndSample !== recording.review.sceneBoundariesMs[i] * 48)
    )
      throw new ProductionError(
        "INVALID_AUDIO",
        "Invalid measured segmentation",
      );
    previous = s.sourceEndSample;
  });
  if (
    previous !== recording.normalized.durationSamples ||
    Math.round(previous / 48) !== recording.normalized.measuredDurationMs
  )
    throw new ProductionError(
      "INVALID_AUDIO",
      "Segments must cover all measured samples",
    );
  return transitionProduction(plan, {
    kind: "narrationReady",
    receipt: {
      recordingHash: recording.source.contentHash,
      narrationHash: plan.narrationHash,
      importHash: recordingImportHash(recording),
    },
  });
}
export function prepareProductionReel(
  rawPlan: ProductionPlan,
  raw: unknown,
  aligner: AlignmentProvider,
): PreparedReel {
  const plan = ProductionPlanSchema.parse(rawPlan),
    recording = RecordingImportSchema.parse(raw);
  if (
    plan.state.kind !== "narrationReady" ||
    plan.state.receipt.importHash !== recordingImportHash(recording)
  )
    throw new ProductionError(
      "INVALID_STATE",
      "A matching accepted narration is required",
    );
  if (plan.draft.orientation !== "vertical")
    throw new ProductionError(
      "UNSUPPORTED",
      "The existing production renderer supports vertical Reels only",
    );
  const scenes = plan.draft.scenes.map((scene, i) => {
    const segment = recording.segments[i];
    const alignment = aligner.align({
      audio: segment,
      transcript: scene.narration,
      locale: plan.draft.locale,
    });
    if (
      alignment.timingSource !== "estimated" ||
      alignment.methodVersion !== "es-syllables-speech-regions-v1"
    )
      throw new ProductionError(
        "UNSUPPORTED",
        "This preparation recipe uses the existing estimated caption method",
      );
    return {
      ...scene,
      audioPath: segment.path,
      audio: {
        artifactId: segment.artifactId,
        voiceProfileId: plan.voiceProfile.id,
        inputHash: segment.inputHash,
        contentHash: segment.contentHash,
        measuredDurationMs: segment.measuredDurationMs,
        precision: {
          durationSamples: segment.durationSamples,
          sampleRate: segment.sampleRate,
        },
        mimeType: "audio/wav",
        volume: 1,
      },
      captions: {
        audioContentHash: segment.contentHash,
        source: "estimated",
        tokens: alignment.tokens,
        lines: prepareCaptionLines(
          alignment.tokens,
          segment.measuredDurationMs,
          narrationTheme.captionStyle.fontSize,
        ),
      },
      delta: durationDelta(
        scene.estimatedDurationMs,
        segment.measuredDurationMs,
      ),
    };
  });
  return PreparedReelSchema.parse({
    schemaVersion: 1,
    productionId: plan.id,
    draftContentHash: plan.draftContentHash,
    title: plan.draft.title,
    locale: plan.draft.locale,
    voiceProfile: plan.voiceProfile,
    presenter: plan.presenter,
    targetDurationMs: plan.draft.targetDurationMs,
    narrationHash: plan.narrationHash,
    recordingHash: recording.source.contentHash,
    importHash: recordingImportHash(recording),
    scenes,
    assetRequirements: plan.assetRequirements,
    theme: narrationTheme,
    renderProfileId: "instagram-reel-v1",
    delta: durationDelta(
      plan.draft.targetDurationMs,
      recording.normalized.measuredDurationMs,
    ),
    captionTiming: "ESTIMATED",
    captionMethod: "es-syllables-speech-regions-v1",
  });
}
export function finishPreparation(plan: ProductionPlan, raw: PreparedReel) {
  const prepared = PreparedReelSchema.parse(raw);
  assertPreparedPlan(plan, prepared);
  if (
    plan.state.kind !== "narrationReady" ||
    prepared.productionId !== plan.id ||
    prepared.importHash !== plan.state.receipt.importHash ||
    prepared.draftContentHash !== plan.draftContentHash
  )
    throw new ProductionError(
      "INVALID_STATE",
      "Prepared content does not match accepted narration",
    );
  let next = transitionProduction(plan, {
    kind: "prepared",
    receipt: plan.state.receipt,
    preparedHash: contentHash(prepared),
  });
  if (!prepared.assetRequirements.some((a) => a.status === "pending"))
    next = transitionProduction(next, {
      kind: "renderable",
      receipt: plan.state.receipt,
      preparedHash: contentHash(prepared),
    });
  return next;
}
export function compilePreparedReel(rawPlan: ProductionPlan, raw: unknown) {
  const plan = ProductionPlanSchema.parse(rawPlan),
    prepared = PreparedReelSchema.parse(raw);
  assertPreparedPlan(plan, prepared);
  if (
    !["renderable", "rendered"].includes(plan.state.kind) ||
    !("preparedHash" in plan.state) ||
    plan.state.preparedHash !== contentHash(prepared) ||
    prepared.productionId !== plan.id ||
    prepared.importHash !== plan.state.receipt.importHash
  )
    throw new ProductionError(
      "INVALID_STATE",
      "A matching renderable production is required",
    );
  const manifest = prepared.visualManifest
    ? validateVisualManifest(plan, prepared.visualManifest)
    : undefined;
  if (
    manifest &&
    (manifest.status !== "resolved" ||
      plan.visualManifestHash !== contentHash(manifest))
  )
    throw new ProductionError(
      "ASSETS_PENDING",
      "A matching validated visual manifest is required",
    );
  if (
    !manifest &&
    prepared.scenes.some((s) => s.visualIntent.kind !== "textOnly")
  )
    throw new ProductionError(
      "ASSETS_PENDING",
      "Current production renderer only resolves textOnly visuals",
    );
  let elapsedMs = 0;
  const scenes = prepared.scenes.map((s, i) => {
    const durationFrames =
      Math.round(((elapsedMs + s.audio.measuredDurationMs) * 30) / 1000) -
      Math.round((elapsedMs * 30) / 1000);
    elapsedMs += s.audio.measuredDurationMs;
    return {
      ...resolvedScene(s, i),
      ...(s.visualIntent.kind !== "textOnly" && manifest
        ? { visual: resolveSceneVisual(manifest, s.id, durationFrames, 30) }
        : {}),
    };
  });
  const reel = ReelSchema.parse({
    schemaVersion: 2,
    id: plan.id.slice(0, 100),
    revision: 1,
    renderProfileId: prepared.renderProfileId,
    defaultVoiceProfileId: prepared.voiceProfile.id,
    voiceProfiles: [prepared.voiceProfile],
    theme: prepared.theme,
    scenes,
  });
  const assets: AssetManifest = Object.fromEntries(
    prepared.scenes.map((s) => [
      s.audio.artifactId,
      { path: s.audioPath, contentHash: s.audio.contentHash },
    ]),
  );
  const visualAssets: AssetManifest = Object.fromEntries(
    (manifest?.assets ?? []).map((a) => [
      a.id,
      { path: a.path, contentHash: a.contentHash },
    ]),
  );
  return {
    reel,
    assets,
    visualAssets,
    snapshot: compileCompositionSnapshot(reel, { ...assets, ...visualAssets }),
  };
}
export function resolvePreparedVisuals(
  rawPlan: ProductionPlan,
  rawPrepared: PreparedReel,
  rawManifest: VisualAssetManifest,
) {
  const plan = ProductionPlanSchema.parse(rawPlan),
    original = PreparedReelSchema.parse(rawPrepared);
  assertPreparedPlan(plan, original);
  if (
    plan.state.kind !== "prepared" ||
    plan.state.preparedHash !== contentHash(original)
  )
    throw new ProductionError(
      "INVALID_STATE",
      "Only a matching prepared production can resolve visuals",
    );
  const manifest = validateVisualManifest(plan, rawManifest);
  if (manifest.status !== "resolved")
    throw new ProductionError(
      "ASSETS_PENDING",
      "Mandatory visuals are unresolved",
    );
  const prepared = PreparedReelSchema.parse({
    ...original,
    visualManifest: manifest,
  });
  const next = ProductionPlanSchema.parse({
    ...plan,
    visualManifestHash: contentHash(manifest),
    state: { ...plan.state, preparedHash: contentHash(prepared) },
  });
  const renderable = transitionProduction(next, {
    ...next.state,
    kind: "renderable",
    receipt: plan.state.receipt,
    preparedHash: contentHash(prepared),
  });
  compilePreparedReel(renderable, prepared);
  return { plan: renderable, prepared };
}
function assertPreparedPlan(plan: ProductionPlan, prepared: PreparedReel) {
  if (
    prepared.productionId !== plan.id ||
    prepared.draftContentHash !== plan.draftContentHash ||
    prepared.narrationHash !== plan.narrationHash ||
    prepared.title !== plan.draft.title ||
    prepared.locale !== plan.draft.locale ||
    contentHash(prepared.voiceProfile) !== contentHash(plan.voiceProfile) ||
    contentHash(prepared.presenter) !== contentHash(plan.presenter) ||
    contentHash(prepared.assetRequirements) !==
      contentHash(plan.assetRequirements) ||
    contentHash(
      prepared.scenes.map((s) =>
        DraftSceneSchema.parse({
          id: s.id,
          order: s.order,
          narration: s.narration,
          purpose: s.purpose,
          visualIntent: s.visualIntent,
          estimatedDurationMs: s.estimatedDurationMs,
          onScreenText: s.onScreenText,
        }),
      ),
    ) !== contentHash(plan.draft.scenes)
  )
    throw new ProductionError(
      "STALE_ARTIFACT",
      "Prepared script, identity or visual intent differs from the production plan",
    );
}
