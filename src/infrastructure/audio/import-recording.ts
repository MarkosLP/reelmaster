import { stat, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  ProductionError,
  ProductionPlanSchema,
  type ProductionPlan,
} from "../../application/production-plan";
import {
  RecordingReviewSchema,
  RecordingImportSchema,
  type RecordingImport,
} from "../../ports/recorded-narration";
import { fileHash, measurePcm } from "./inspect";
import { mediaBinary, type Probe } from "./ffmpeg";
import { parseSilences, speechWithin } from "./prepare";
import { contentHash } from "../../snapshot/hash";
import { originalHash } from "../../fixtures/marcos";
import { privateRoot, assertInside } from "../production/local-files";
const run = promisify(execFile);
async function media(name: "ffmpeg" | "ffprobe", args: string[]) {
  try {
    return await run(
      mediaBinary(name),
      ["-protocol_whitelist", "file,pipe", ...args],
      { timeout: 120000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
    );
  } catch {
    throw new ProductionError(
      "INVALID_AUDIO",
      "Local audio decoding/inspection failed or exceeded 120 seconds",
    );
  }
}
export async function inspectRecording(workspace: string, input: string) {
  const root = await privateRoot(workspace, "recordings");
  const source = await assertInside(root, resolve(input));
  const stats = await stat(source);
  if (
    !stats.isFile() ||
    stats.size <= 0 ||
    stats.size > 50 * 1024 * 1024 ||
    ![".wav", ".m4a", ".mp3", ".flac", ".ogg"].includes(
      extname(source).toLowerCase(),
    )
  )
    throw new ProductionError(
      "INVALID_AUDIO",
      "Expected a local WAV/M4A/MP3/FLAC/OGG file up to 50 MiB",
    );
  const metadata = JSON.parse(
    (
      await media("ffprobe", [
        "-v",
        "error",
        "-format_whitelist",
        "wav,mov,mp3,flac,ogg",
        "-show_format",
        "-show_streams",
        "-of",
        "json",
        source,
      ])
    ).stdout,
  ) as Probe;
  const stream = metadata.streams[0];
  const duration = Number(stream?.duration ?? metadata.format.duration) * 1000;
  if (
    metadata.streams.length !== 1 ||
    stream?.codec_type !== "audio" ||
    ![
      "pcm_s16le",
      "pcm_s24le",
      "pcm_s32le",
      "pcm_f32le",
      "aac",
      "mp3",
      "flac",
      "vorbis",
      "opus",
    ].includes(stream.codec_name) ||
    ![1, 2].includes(stream.channels ?? 0) ||
    !Number.isInteger(Number(stream.sample_rate)) ||
    Number(stream.sample_rate) < 8000 ||
    Number(stream.sample_rate) > 96000 ||
    !Number.isFinite(duration) ||
    duration < 1000 ||
    duration > 60000
  )
    throw new ProductionError(
      "INVALID_AUDIO",
      "Expected one supported audio stream, mono/stereo, 8–96 kHz and duration 1–60 seconds",
    );
  await media("ffmpeg", [
    "-v",
    "error",
    "-nostdin",
    "-xerror",
    "-i",
    source,
    "-t",
    "61",
    "-f",
    "null",
    "-",
  ]);
  const recordingHash = await fileHash(source);
  if (recordingHash === originalHash)
    throw new ProductionError(
      "INVALID_AUDIO",
      "The existing 1A reference recording is reserved for its original demo",
    );
  return {
    source,
    info: {
      contentHash: recordingHash,
      codec: stream.codec_name,
      sampleRate: Number(stream.sample_rate),
      channels: stream.channels!,
      bytes: stats.size,
      reportedDurationMs: duration,
    },
  };
}
export async function importRecording(
  workspace: string,
  rawPlan: ProductionPlan,
  input: string,
  rawReview: unknown,
  destination: string,
): Promise<RecordingImport> {
  const started = performance.now();
  const plan = ProductionPlanSchema.parse(rawPlan);
  if (
    plan.state.kind !== "waitingForNarration" ||
    plan.narrationSource.kind !== "recorded"
  )
    throw new ProductionError(
      "INVALID_STATE",
      "Recorded import requires waitingForNarration",
    );
  if (plan.draft.locale !== "es-ES")
    throw new ProductionError(
      "UNSUPPORTED",
      "The current local caption estimator supports es-ES only",
    );
  const review = RecordingReviewSchema.parse(rawReview);
  if (
    review.productionId !== plan.id ||
    review.draftContentHash !== plan.draftContentHash ||
    review.narrationHash !== plan.narrationHash ||
    contentHash(review.sceneIds) !==
      contentHash(plan.draft.scenes.map((s) => s.id)) ||
    review.sceneBoundariesMs.length !== plan.draft.scenes.length - 1
  )
    throw new ProductionError(
      "INVALID_REVIEW",
      "Review must identify the exact production, script and ordered scenes",
    );
  const inspected = await inspectRecording(workspace, input);
  if (review.recordingHash !== inspected.info.contentHash)
    throw new ProductionError(
      "INVALID_REVIEW",
      "Recording hash does not match the human review",
    );
  const productions = await privateRoot(workspace, "productions");
  const safeDestination = await assertInside(productions, destination);
  await mkdir(resolve(safeDestination, "audio"), { recursive: true });
  await assertInside(safeDestination, resolve(safeDestination, "audio"));
  const normalizedPath = resolve(safeDestination, "normalized.wav");
  // PCM conversion only: no speed change, silence removal or editorial time limit.
  await media("ffmpeg", [
    "-v",
    "error",
    "-nostdin",
    "-xerror",
    "-n",
    "-i",
    inspected.source,
    "-t",
    "61",
    "-map_metadata",
    "-1",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-c:a",
    "pcm_s16le",
    "-fflags",
    "+bitexact",
    "-flags:a",
    "+bitexact",
    normalizedPath,
  ]);
  const normalized = await measurePcm(normalizedPath);
  if (normalized.durationSamples > 60 * 48000)
    throw new ProductionError(
      "INVALID_AUDIO",
      "Decoded recording exceeds 60 seconds; it will not be shortened",
    );
  const silences = parseSilences(
    (
      await media("ffmpeg", [
        "-hide_banner",
        "-nostdin",
        "-i",
        normalizedPath,
        "-af",
        "silencedetect=noise=-40dB:d=0.2",
        "-f",
        "null",
        "-",
      ])
    ).stderr,
    normalized.measuredDurationMs,
  );
  for (let i = 0; i < review.sceneBoundariesMs.length; i++) {
    const cut = review.sceneBoundariesMs[i];
    if (
      cut <= (review.sceneBoundariesMs[i - 1] ?? 0) ||
      cut >= normalized.measuredDurationMs ||
      !silences.some((s) => cut - s.startMs >= 80 && s.endMs - cut >= 80)
    )
      throw new ProductionError(
        "INVALID_REVIEW",
        "Cuts must be ordered and lie inside detected silence with an 80 ms margin on each side",
      );
  }
  const boundaries = [
    0,
    ...review.sceneBoundariesMs.map((ms) => ms * 48),
    normalized.durationSamples,
  ];
  const ffmpegVersion = (await media("ffmpeg", ["-version"])).stdout.split(
    /\r?\n/,
  )[0];
  const segments: RecordingImport["segments"] = [];
  for (let i = 0; i < plan.draft.scenes.length; i++) {
    const sceneId = plan.draft.scenes[i].id;
    const start = boundaries[i],
      end = boundaries[i + 1];
    if (end - start < 48000)
      throw new ProductionError(
        "INVALID_AUDIO",
        "Every scene requires at least one measured second",
      );
    const path = `audio/${sceneId}.wav`;
    await media("ffmpeg", [
      "-v",
      "error",
      "-nostdin",
      "-n",
      "-i",
      normalizedPath,
      "-map_metadata",
      "-1",
      "-af",
      `atrim=start_sample=${start}:end_sample=${end},asetpts=PTS-STARTPTS`,
      "-c:a",
      "pcm_s16le",
      "-fflags",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      resolve(safeDestination, path),
    ]);
    const measurement = await measurePcm(resolve(safeDestination, path));
    if (measurement.durationSamples !== end - start)
      throw new ProductionError(
        "INVALID_AUDIO",
        "Segmentation lost audio samples",
      );
    segments.push({
      sceneId,
      artifactId: `recorded-${sceneId}`,
      path,
      contentHash: measurement.contentHash,
      measuredDurationMs: measurement.measuredDurationMs,
      durationSamples: measurement.durationSamples,
      sampleRate: 48000,
      inputHash: contentHash({
        recordingHash: review.recordingHash,
        narrationHash: plan.narrationHash,
        start,
        end,
        recipeVersion: "recorded-pcm48-reviewed-cuts-v1",
        ffmpegVersion,
      }),
      sourceStartSample: start,
      sourceEndSample: end,
      speechRegions: speechWithin(
        Math.round(start / 48),
        Math.round(end / 48),
        silences,
      ),
    });
  }
  if ((await fileHash(inspected.source)) !== inspected.info.contentHash)
    throw new ProductionError(
      "STALE_ARTIFACT",
      "Original changed during import",
    );
  return RecordingImportSchema.parse({
    schemaVersion: 1,
    review,
    source: inspected.info,
    normalized: {
      contentHash: normalized.contentHash,
      durationSamples: normalized.durationSamples,
      measuredDurationMs: normalized.measuredDurationMs,
      sampleRate: 48000,
    },
    segments,
    segmentationSource: "human-reviewed-silence-boundaries",
    measurementSource: "MEASURED",
    recipeVersion: "recorded-pcm48-reviewed-cuts-v1",
    ffmpegVersion,
    elapsedMs: performance.now() - started,
  });
}
