import {
  getCompositions,
  renderMedia,
  renderStill,
  getVideoMetadata,
} from "@remotion/renderer";
import { mkdir, stat, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { demo, assets, spanishCharacters } from "../src/fixtures/demo";
import { compileCompositionSnapshot } from "../src/snapshot/compile";
import { contentHash } from "../src/snapshot/hash";
await mkdir("out", { recursive: true });
const serveUrl = resolve("build/renderer");
for (const asset of Object.values(assets)) {
  const bytes = await readFile(resolve(serveUrl, "public", asset.path));
  if (createHash("sha256").update(bytes).digest("hex") !== asset.contentHash)
    throw new Error("Bundled asset hash mismatch; rebuild renderer");
}
const snapshot = compileCompositionSnapshot(demo, assets);
const inputProps = { snapshot };
const compositions = await getCompositions(serveUrl, { inputProps });
console.log(
  "Discovered:",
  compositions.map((c) => ({
    id: c.id,
    width: c.width,
    height: c.height,
    fps: c.fps,
    durationInFrames: c.durationInFrames,
  })),
);
const composition = compositions.find((c) => c.id === "ReelDemo");
if (!composition) throw new Error("Missing composition");
if (!process.argv.includes("--discover")) {
  let last = -1;
  if (!process.argv.includes("--stills"))
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      codec: "h264",
      audioCodec: "aac",
      pixelFormat: "yuv420p",
      colorSpace: "bt709",
      imageFormat: "png",
      crf: 18,
      concurrency: 2,
      outputLocation: resolve("out/reel-demo.mp4"),
      onProgress: ({ progress }) => {
        const step = Math.floor(progress * 10);
        if (step !== last) {
          last = step;
          console.log(`Render ${step * 10}%`);
        }
      },
    });
  for (const frame of [18, 45, 119, 120, 165, 285])
    await renderStill({
      serveUrl,
      composition,
      inputProps,
      frame,
      output: resolve(`out/frame-${frame}.png`),
    });
  const spanish = structuredClone(snapshot);
  spanish.scenes[0].headline = spanishCharacters;
  const spanishComposition = (
    await getCompositions(serveUrl, { inputProps: { snapshot: spanish } })
  ).find((c) => c.id === "ReelDemo");
  if (!spanishComposition) throw new Error("Missing Spanish composition");
  await renderStill({
    serveUrl,
    composition: spanishComposition,
    inputProps: { snapshot: spanish },
    frame: 45,
    output: resolve("out/spanish.png"),
  });
  const metadata = await getVideoMetadata(resolve("out/reel-demo.mp4"));
  const { size } = await stat("out/reel-demo.mp4");
  if (
    metadata.width !== snapshot.profile.width ||
    metadata.height !== snapshot.profile.height ||
    metadata.fps !== snapshot.profile.fps ||
    metadata.durationInSeconds === null ||
    Math.abs(
      metadata.durationInSeconds -
        snapshot.durationInFrames / snapshot.profile.fps,
    ) > 0.1 ||
    metadata.audioCodec !== "aac" ||
    size === 0
  )
    throw new Error("Unexpected output");
  const result = {
    metadata,
    bytes: size,
    snapshotHash: contentHash(snapshot),
    node: process.version,
    remotion: "4.0.523",
  };
  await writeFile("out/validation.json", JSON.stringify(result, null, 2));
  console.log(result);
}
