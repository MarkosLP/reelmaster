import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, stat, access } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { ffmpeg, probe, mediaBinary, type Probe } from "../audio/ffmpeg";
import { fileHash } from "../audio/inspect";
import { analyzePcm16 } from "../audio/pcm-analysis";
import { assertInside, atomicJson } from "../production/local-files";
import { contentHash } from "../../snapshot/hash";
import {
  PresenterAssetSchema,
  PresenterMediaSchema,
} from "../../domain/presenter-asset";
const run = promisify(execFile);
type DetailedProbe = Omit<Probe, "streams"> & {
  streams: Array<
    Probe["streams"][number] & {
      start_time: string;
      avg_frame_rate: string;
      bit_rate: string;
      side_data_list?: Array<{ rotation?: number }>;
    }
  >;
};
type Packet = {
  pts: string;
  dts: string;
  duration: string;
  size: string;
  data_hash: string;
};
export async function videoPackets(path: string) {
  const { stdout } = await run(
    mediaBinary("ffprobe"),
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_packets",
      "-show_data_hash",
      "sha256",
      "-show_entries",
      "packet=pts,dts,duration,size,data_hash",
      "-of",
      "json",
      path,
    ],
    { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  return (JSON.parse(stdout) as { packets: Packet[] }).packets;
}
export function assertSameVideoPackets(original: Packet[], prepared: Packet[]) {
  if (!original.length || contentHash(original) !== contentHash(prepared))
    throw Error("Video payload or timestamps changed");
}
export async function assertContinuousAudio(
  path: string,
  sampleFrames: number,
) {
  const { stdout } = await run(
    mediaBinary("ffprobe"),
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_packets",
      "-show_entries",
      "packet=pts,duration",
      "-of",
      "json",
      path,
    ],
    { windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const packets = (
    JSON.parse(stdout) as { packets: Array<{ pts: number; duration: number }> }
  ).packets.filter((p) => p.pts >= 0);
  let expected = 0;
  for (const packet of packets) {
    if (packet.pts !== expected || packet.duration <= 0)
      throw Error("Discontinuous audio timestamps");
    expected += packet.duration;
  }
  if (expected !== sampleFrames)
    throw Error("Audio timestamps do not cover the decoded samples exactly");
}
function mediaMetadata(raw: DetailedProbe, packets: Packet[]) {
  const video = raw.streams.find((s) => s.codec_type === "video"),
    audio = raw.streams.find((s) => s.codec_type === "audio");
  if (
    !video ||
    !audio ||
    raw.streams.length !== 2 ||
    video.side_data_list?.some((d) => d.rotation)
  )
    throw Error("Expected unrotated video with one audio track");
  if (Number(raw.format.duration) > 120)
    throw Error("Presenter preparation is limited to 120 seconds");
  return PresenterMediaSchema.parse({
    container: raw.format.format_name,
    bytes: Number(raw.format.size),
    durationSeconds: Number(raw.format.duration),
    width: video.width,
    height: video.height,
    videoCodec: video.codec_name,
    fps: {
      nominal: video.r_frame_rate,
      average: video.avg_frame_rate,
      timeBase: video.time_base,
      variable: new Set(packets.map((p) => p.duration)).size > 1,
    },
    videoDurationSeconds: Number(video.duration),
    videoStartSeconds: Number(video.start_time),
    audio: {
      codec: audio.codec_name,
      sampleRate: Number(audio.sample_rate),
      channels: audio.channels,
      durationSeconds: Number(audio.duration),
      startSeconds: Number(audio.start_time),
      bitrate: Number(audio.bit_rate),
    },
  });
}
export async function measureLoudness(source: string, targetLufs = -18) {
  const result = await ffmpeg([
    "-v",
    "info",
    "-i",
    source,
    "-vn",
    "-af",
    `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:print_format=json`,
    "-f",
    "null",
    "-",
  ]);
  const match = result.stderr.match(/\{\s*"input_i"[\s\S]*?\}/);
  if (!match) throw Error("Missing loudness measurement");
  const raw = JSON.parse(match[0]) as Record<string, string>;
  const measurement = {
    integratedLufs: Number(raw.input_i),
    truePeakDbtp: Number(raw.input_tp),
    rangeLu: Number(raw.input_lra),
  };
  if (!Object.values(measurement).every(Number.isFinite))
    throw Error("Silent or invalid loudness input");
  return { measurement, raw, log: result.stderr };
}
export async function preparePresenter(
  workspace: string,
  source: string,
  presenterId: string,
  targetLufs = -18,
) {
  const ignoreRules = await readFile(resolve(workspace, ".gitignore"), "utf8");
  if (!/^\/?\.local\/?\s*$/m.test(ignoreRules))
    throw Error("Private .local directory must be explicitly git-ignored");
  if (
    !/^[a-z0-9-]+$/.test(presenterId) ||
    !Number.isFinite(targetLufs) ||
    targetLufs < -20 ||
    targetLufs > -16
  )
    throw Error("Invalid presenter or target loudness");
  const presenterRoot = resolve(workspace, ".local/presenters", presenterId);
  await assertInside(resolve(workspace, ".local"), presenterRoot);
  const sourcePath = await assertInside(
    resolve(presenterRoot, "originals"),
    resolve(source),
  );
  if ((await stat(sourcePath)).size > 512 * 1024 * 1024)
    throw Error("Source exceeds 512 MiB");
  const originalHash = await fileHash(sourcePath),
    originalPackets = await videoPackets(sourcePath),
    originalProbe = (await probe(sourcePath)) as DetailedProbe;
  const originalMetadata = mediaMetadata(originalProbe, originalPackets);
  const ffmpegHash = await fileHash(mediaBinary("ffmpeg"));
  const { stdout: version } = await ffmpeg(["-version"]);
  const recipeIdentity = {
    version: "presenter-audio-v1",
    targetLufs,
    truePeakCeiling: -1.5,
    lra: 11,
    audioBitrate: 192000,
    ffmpegHash,
    timestampPolicy: "contiguous-samples-v1",
  };
  const recipeHash = contentHash(recipeIdentity),
    assetId = `presenter-asset-${contentHash({ originalHash, recipeHash, presenterId })}`;
  const parent = resolve(presenterRoot, "prepared");
  await mkdir(parent, { recursive: true });
  await assertInside(presenterRoot, parent);
  const directory = resolve(parent, assetId);
  // Exclusive directory creation avoids overwriting an original or a prior variant.
  await mkdir(directory);
  const originalWav = resolve(directory, "audio-original.wav"),
    preparedWav = resolve(directory, "audio-prepared.wav"),
    preparedPath = resolve(directory, "prepared.mp4");
  const first = await measureLoudness(sourcePath, targetLufs);
  await writeFile(resolve(directory, "loudness-original.log"), first.log);
  await atomicJson(resolve(directory, "original-ffprobe.json"), originalProbe);
  await ffmpeg([
    "-v",
    "error",
    "-i",
    sourcePath,
    "-map",
    "0:a:0",
    "-c:a",
    "pcm_s16le",
    originalWav,
  ]);
  const pcmOriginal = analyzePcm16(await readFile(originalWav));
  await assertContinuousAudio(sourcePath, pcmOriginal.sampleFrames);
  const m = first.raw;
  const filterGraph = `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=false:print_format=json,aresample=48000,atrim=end_sample=${pcmOriginal.sampleFrames},asetpts=N/SR/TB`;
  const args = [
    "-v",
    "info",
    "-copyts",
    "-i",
    sourcePath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0",
    "-map_metadata",
    "-1",
    "-c:v",
    "copy",
    "-af",
    filterGraph,
    "-ar",
    "48000",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    preparedPath,
  ];
  const processing = await ffmpeg(args);
  await writeFile(resolve(directory, "processing.log"), processing.stderr);
  const preparedProbe = (await probe(preparedPath)) as DetailedProbe,
    preparedPackets = await videoPackets(preparedPath);
  assertSameVideoPackets(originalPackets, preparedPackets);
  const preparedMetadata = mediaMetadata(preparedProbe, preparedPackets);
  await ffmpeg([
    "-v",
    "error",
    "-i",
    preparedPath,
    "-map",
    "0:a:0",
    "-c:a",
    "pcm_s16le",
    preparedWav,
  ]);
  const pcmPrepared = analyzePcm16(await readFile(preparedWav));
  await assertContinuousAudio(preparedPath, pcmPrepared.sampleFrames);
  if (
    pcmOriginal.sampleFrames !== pcmPrepared.sampleFrames ||
    pcmOriginal.channels !== pcmPrepared.channels ||
    pcmPrepared.channelStats.some((c) => c.fullScaleSamples > 0)
  )
    throw Error("Audio sample count/channels/clipping validation failed");
  const final = await measureLoudness(preparedPath, targetLufs);
  if (
    Math.abs(final.measurement.integratedLufs - targetLufs) > 1 ||
    final.measurement.truePeakDbtp > -1
  )
    throw Error("Prepared loudness/true peak outside tolerance");
  if ((await fileHash(sourcePath)) !== originalHash)
    throw Error("Source changed during preparation");
  const relativePath = (p: string) =>
    relative(workspace, p).replaceAll("\\", "/");
  const asset = PresenterAssetSchema.parse({
    version: 1,
    assetId,
    presenterId,
    source: {
      kind: "recordedVideo",
      path: relativePath(sourcePath),
      metadata: originalMetadata,
    },
    originalHash,
    preparedHash: await fileHash(preparedPath),
    preparedPath: relativePath(preparedPath),
    duration: preparedMetadata.durationSeconds,
    width: preparedMetadata.width,
    height: preparedMetadata.height,
    fps: preparedMetadata.fps,
    preparedMetadata,
    audio: {
      original: first.measurement,
      prepared: final.measurement,
      sampleFrames: pcmOriginal.sampleFrames,
    },
    privacy: {
      classification: "private",
      localOnly: true,
      gitIgnored: true,
      approvedForMontage: false,
    },
    recipe: {
      version: "presenter-audio-v1",
      hash: recipeHash,
      ffmpegVersion: version.split(/\r?\n/)[0],
      ffmpegHash,
      filterGraph,
      targetLufs,
      truePeakCeiling: -1.5,
      audioBitrate: 192000,
      videoProcessing: "streamCopy",
    },
    temporalModifications: { kind: "none" },
    validation: {
      videoPacketsAndTimestampsIdentical: true,
      audioSampleCountIdentical: true,
      sourceHashPreserved: true,
    },
  });
  await atomicJson(resolve(directory, "prepared-ffprobe.json"), preparedProbe);
  await atomicJson(resolve(directory, "pcm-original.json"), pcmOriginal);
  await atomicJson(resolve(directory, "pcm-prepared.json"), pcmPrepared);
  await atomicJson(resolve(directory, "reproduction.json"), {
    args,
    recipeIdentity,
    originalHash,
    preparedHash: asset.preparedHash,
    apiCostEur: 0,
  });
  await writeFile(resolve(directory, "loudness-prepared.log"), final.log);
  await atomicJson(resolve(directory, "asset.json"), asset);
  await access(preparedPath);
  return { directory, asset };
}
