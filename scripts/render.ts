import { getCompositions, renderMedia, renderStill } from "@remotion/renderer";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  compileCompositionSnapshot,
  type AssetManifest,
} from "../src/snapshot/compile";
import { contentHash } from "../src/snapshot/hash";
import { privateAssetServer } from "../src/infrastructure/audio/private-server";
import { localBrowser } from "../src/infrastructure/audio/browser";
import { probe } from "../src/infrastructure/audio/ffmpeg";
import { fileHash, locateRecording } from "../src/infrastructure/audio/inspect";
import { originalHash } from "../src/fixtures/marcos";
const root = resolve(".local/marcos");
const prepared = JSON.parse(
  await readFile(resolve(root, "prepared.json"), "utf8"),
) as { reel: unknown; assets: AssetManifest };
const snapshot = compileCompositionSnapshot(prepared.reel, prepared.assets);
const browserExecutable = await localBrowser();
const media = await privateAssetServer(root, prepared.assets);
try {
  const serveUrl = resolve("build/renderer");
  const inputProps = { snapshot, mediaBaseUrl: media.baseUrl };
  const compositions = await getCompositions(serveUrl, {
    inputProps,
    browserExecutable,
  });
  const composition = compositions.find((c) => c.id === "ReelDemo");
  if (!composition) throw new Error("Missing composition");
  console.log("Discovered:", {
    id: composition.id,
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    durationInFrames: composition.durationInFrames,
  });
  if (!process.argv.includes("--discover")) {
    const outputDirectory = resolve("out/marcos");
    await mkdir(outputDirectory, { recursive: true });
    const output = resolve(outputDirectory, "reel-marcos.mp4");
    let last = -1;
    const started = performance.now();
    if (!process.argv.includes("--stills"))
      await renderMedia({
        serveUrl,
        composition,
        inputProps,
        browserExecutable,
        codec: "h264",
        audioCodec: "aac",
        audioBitrate: "192k",
        sampleRate: 48000,
        pixelFormat: "yuv420p",
        colorSpace: "bt709",
        imageFormat: "png",
        crf: 18,
        concurrency: 2,
        outputLocation: output,
        onProgress: ({ progress }) => {
          const step = Math.floor(progress * 10);
          if (last !== step) {
            last = step;
            console.log(`Render ${step * 10}%`);
          }
        },
      });
    const renderSeconds = process.argv.includes("--stills")
      ? null
      : (performance.now() - started) / 1000;
    for (const scene of snapshot.scenes) {
      const line = scene.lines[1] ?? scene.lines[0];
      const frame =
        scene.startFrame + Math.floor((line.startFrame + line.endFrame) / 2);
      await renderStill({
        serveUrl,
        composition,
        inputProps,
        browserExecutable,
        frame,
        output: resolve(outputDirectory, `${scene.id}.png`),
      });
    }
    const metadata = await probe(output);
    const video = metadata.streams.find((s) => s.codec_type === "video");
    const audio = metadata.streams.find((s) => s.codec_type === "audio");
    if (
      !video ||
      !audio ||
      video.width !== snapshot.profile.width ||
      video.height !== snapshot.profile.height ||
      video.r_frame_rate !== `${snapshot.profile.fps}/1` ||
      video.codec_name !== "h264" ||
      audio.codec_name !== "aac" ||
      audio.sample_rate !== "48000" ||
      Math.abs(
        Number(video.duration) -
          snapshot.durationInFrames / snapshot.profile.fps,
      ) > 0.01 ||
      Number(metadata.format.size) <= 0
    )
      throw new Error("Final media validation failed");
    if ((await fileHash(await locateRecording(resolve(".")))) !== originalHash)
      throw new Error("Original changed");
    const summary = {
      metadata,
      renderSeconds,
      snapshotHash: contentHash(snapshot),
      snapshotDurationFrames: snapshot.durationInFrames,
      sourceUnchanged: true,
      timingSource: "ESTIMATED",
      apiCost: 0,
      node: process.version,
      remotion: "4.0.523",
    };
    await writeFile(
      resolve(outputDirectory, "validation.json"),
      JSON.stringify(summary, null, 2) + "\n",
    );
    console.log({
      video: video.codec_name,
      audio: audio.codec_name,
      duration: video.duration,
      sampleRate: audio.sample_rate,
      bytes: metadata.format.size,
      renderSeconds,
      snapshotHash: summary.snapshotHash,
      sourceUnchanged: true,
      apiCost: 0,
    });
  }
} finally {
  await media.close();
}
