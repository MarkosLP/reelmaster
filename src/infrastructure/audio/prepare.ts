import { mkdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { ffmpeg } from "./ffmpeg";
import { fileHash, inspectAudio, locateRecording, measurePcm } from "./inspect";
import type { TimeRange } from "../../ports/alignment";
import { contentHash } from "../../snapshot/hash";
import { originalHash, segmentationRecipe } from "../../fixtures/marcos";
type Loudness = {
  input_i: string;
  input_tp: string;
  input_lra: string;
  input_thresh: string;
  target_offset: string;
  output_i: string;
  output_tp: string;
  normalization_type: string;
};
function loudnessJson(stderr: string): Loudness {
  const match = stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!match) throw new Error("No loudness measurement");
  const data = JSON.parse(match[0]) as Loudness;
  for (const key of [
    "input_i",
    "input_tp",
    "input_lra",
    "input_thresh",
    "target_offset",
  ] as const)
    if (!Number.isFinite(Number(data[key])))
      throw new Error("Cannot normalize silent/invalid recording");
  return data;
}
export function parseSilences(log: string, durationMs: number): TimeRange[] {
  const silences: TimeRange[] = [];
  let start: number | undefined;
  for (const match of log.matchAll(/silence_(start|end):\s*([\d.]+)/g)) {
    const ms = Math.round(Number(match[2]) * 1000);
    if (match[1] === "start") start = ms;
    else {
      if (start === undefined) throw new Error("Silence end without start");
      silences.push({ startMs: start, endMs: Math.min(ms, durationMs) });
      start = undefined;
    }
  }
  if (start !== undefined) silences.push({ startMs: start, endMs: durationMs });
  return silences;
}
export function speechWithin(
  startMs: number,
  endMs: number,
  silences: TimeRange[],
): TimeRange[] {
  const regions: TimeRange[] = [];
  let cursor = startMs;
  for (const silence of silences) {
    if (silence.endMs <= startMs || silence.startMs >= endMs) continue;
    const a = Math.max(startMs, silence.startMs),
      b = Math.min(endMs, silence.endMs);
    if (a > cursor)
      regions.push({ startMs: cursor - startMs, endMs: a - startMs });
    cursor = Math.max(cursor, b);
  }
  if (cursor < endMs)
    regions.push({ startMs: cursor - startMs, endMs: endMs - startMs });
  return regions;
}
export async function prepareRecording(root: string, destination: string) {
  const started = performance.now();
  const original = await locateRecording(root);
  const info = await inspectAudio(original);
  if (info.contentHash !== originalHash)
    throw new Error(
      "Unknown recording: review paragraph segmentation before preparing",
    );
  await ffmpeg(["-v", "error", "-i", original, "-f", "null", "-"]);
  await mkdir(join(destination, "audio"), { recursive: true });
  const settings = {
    version: "loudnorm-stereo-pcm16-v1",
    integratedLufs: -16,
    truePeakDb: -1.5,
    lra: 11,
    sampleRate: 48000,
    channels: 2,
  };
  const filter = "loudnorm=I=-16:TP=-1.5:LRA=11";
  const first = loudnessJson(
    (
      await ffmpeg([
        "-i",
        original,
        "-af",
        `${filter}:print_format=json`,
        "-f",
        "null",
        "-",
      ])
    ).stderr,
  );
  const normalizedPath = join(destination, "normalized.wav");
  const sampleCount = info.metadata.streams[0].duration_ts;
  if (
    info.metadata.streams[0].time_base !== "1/48000" ||
    !Number.isSafeInteger(sampleCount)
  )
    throw new Error("Fixture sample clock changed");
  const secondFilter = `${filter}:measured_I=${first.input_i}:measured_TP=${first.input_tp}:measured_LRA=${first.input_lra}:measured_thresh=${first.input_thresh}:offset=${first.target_offset}:linear=true:print_format=json,aresample=48000,atrim=end_sample=${sampleCount}`;
  const second = await ffmpeg([
    "-y",
    "-i",
    original,
    "-map_metadata",
    "-1",
    "-af",
    secondFilter,
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
  if (normalized.durationSamples !== sampleCount)
    throw new Error("Normalization changed the source sample count");
  const measuredOutput = loudnessJson(
    (
      await ffmpeg([
        "-i",
        normalizedPath,
        "-af",
        `${filter}:print_format=json`,
        "-f",
        "null",
        "-",
      ])
    ).stderr,
  );
  const silenceRun = await ffmpeg([
    "-i",
    original,
    "-af",
    `silencedetect=noise=${segmentationRecipe.noiseDb}dB:d=${segmentationRecipe.minSilenceSeconds}`,
    "-f",
    "null",
    "-",
  ]);
  const silences = parseSilences(
    silenceRun.stderr,
    normalized.measuredDurationMs,
  );
  const gaps = silences.filter(
    (s) =>
      s.startMs > 0 &&
      s.endMs < normalized.measuredDurationMs &&
      s.endMs - s.startMs >= segmentationRecipe.minSceneGapMs,
  );
  if (gaps.length !== segmentationRecipe.expectedSceneCount - 1)
    throw new Error("Paragraph pauses do not match the reviewed fixture");
  const boundaries = [
    0,
    ...gaps.map((g) => Math.round((g.startMs + g.endMs) / 2)),
    normalized.measuredDurationMs,
  ];
  const segments = [];
  const ffmpegVersion = (await ffmpeg(["-version"])).stdout.split(/\r?\n/)[0];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const sourceStartMs = boundaries[i],
      sourceEndMs = boundaries[i + 1];
    const sourceStartSample = sourceStartMs * 48,
      sourceEndSample =
        i === boundaries.length - 2
          ? normalized.durationSamples
          : sourceEndMs * 48;
    const path = `audio/marcos-${i}.wav`;
    const fullPath = join(destination, path);
    await ffmpeg([
      "-y",
      "-i",
      normalizedPath,
      "-map_metadata",
      "-1",
      "-af",
      `atrim=start_sample=${sourceStartSample}:end_sample=${sourceEndSample},asetpts=PTS-STARTPTS`,
      "-c:a",
      "pcm_s16le",
      "-fflags",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      fullPath,
    ]);
    const measurement = await measurePcm(fullPath);
    if (measurement.durationSamples !== sourceEndSample - sourceStartSample)
      throw new Error("Segment sample mismatch");
    segments.push({
      artifactId: `marcos-recording-${i}`,
      path,
      inputHash: contentHash({
        sourceHash: info.contentHash,
        settings,
        sourceStartSample,
        sourceEndSample,
        ffmpegVersion,
      }),
      ...measurement,
      sourceStartMs,
      sourceEndMs,
      sourceStartSample,
      sourceEndSample,
      speechRegions: speechWithin(sourceStartMs, sourceEndMs, silences),
    });
  }
  if ((await fileHash(original)) !== info.contentHash)
    throw new Error("Original recording changed during preparation");
  const result = {
    original: { name: basename(original), ...info },
    settings,
    normalization: {
      firstPass: first,
      secondPass: loudnessJson(second.stderr),
      measuredOutput,
    },
    normalized,
    ffmpegVersion,
    silences,
    boundaries,
    segments,
    preparationSeconds: (performance.now() - started) / 1000,
  };
  await writeFile(
    join(destination, "preparation.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  return result;
}
