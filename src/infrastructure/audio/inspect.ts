import { readdir, readFile } from "node:fs/promises";
import { extname, join, parse } from "node:path";
import { createHash } from "node:crypto";
import { probe } from "./ffmpeg";
export const fileHash = async (path: string) =>
  createHash("sha256")
    .update(await readFile(path))
    .digest("hex");
export async function locateRecording(root: string) {
  const candidates: string[] = [];
  for (const directory of [
    root,
    join(root, ".local/presenters/presenter-marcos/originals"),
  ]) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    candidates.push(
      ...entries
        .filter(
          (e) => e.isFile() && parse(e.name).name.toLowerCase() === "vozmarcos",
        )
        .map((e) => join(directory, e.name)),
    );
  }
  if (candidates.length !== 1)
    throw new Error(
      `Expected exactly one VozMarcos recording, found ${candidates.length}`,
    );
  return candidates[0];
}
export async function inspectAudio(path: string) {
  const metadata = await probe(path);
  const streams = metadata.streams.filter((s) => s.codec_type === "audio");
  if (streams.length !== 1 || metadata.streams.length !== 1)
    throw new Error("Expected one audio stream only");
  const stream = streams[0];
  const seconds = Number(stream.duration ?? metadata.format.duration);
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60)
    throw new Error("Audio duration must be positive and <=60s");
  return {
    extension: extname(path),
    metadata,
    contentHash: await fileHash(path),
  };
}
export async function measurePcm(path: string) {
  const info = await inspectAudio(path);
  const s = info.metadata.streams[0];
  const sampleRate = Number(s.sample_rate);
  if (
    s.codec_name !== "pcm_s16le" ||
    sampleRate !== 48000 ||
    s.channels !== 2 ||
    s.time_base !== `1/${sampleRate}` ||
    !Number.isSafeInteger(s.duration_ts) ||
    s.duration_ts! <= 0
  )
    throw new Error("Expected measured stereo PCM16 at 48 kHz");
  return {
    contentHash: info.contentHash,
    measuredDurationMs: Math.round((s.duration_ts! * 1000) / sampleRate),
    durationSamples: s.duration_ts!,
    sampleRate,
    channels: s.channels,
  };
}
