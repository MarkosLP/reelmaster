import { readFile, mkdir, copyFile, access, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia, renderStill } from "@remotion/renderer";
import { PresenterEditPlanSchema } from "../src/domain/presenter-edit";
import { localBrowser } from "../src/infrastructure/audio/browser";
import { privateAssetServer } from "../src/infrastructure/audio/private-server";
import { fileHash } from "../src/infrastructure/audio/inspect";

const { values } = parseArgs({
  options: {
    plan: { type: "string" },
    video: { type: "string" },
    output: { type: "string" },
  },
  strict: true,
});
if (!values.plan || !values.video || !values.output)
  throw Error("--plan --video --output required");
const planPath = resolve(values.plan),
  videoPath = resolve(values.video),
  output = resolve(values.output);
const workspace = resolve(".");
for (const path of [planPath, videoPath])
  if (!path.startsWith(resolve(".local") + "\\"))
    throw Error("Private input required");
if (!output.startsWith(resolve(".local") + "\\"))
  throw Error("Private intermediate output required");
try {
  await access(output);
  throw Error("Output already exists");
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const plan = PresenterEditPlanSchema.parse(
  JSON.parse(await readFile(planPath, "utf8")),
);
const directory = resolve(".local/phase-1k/render");
await mkdir(resolve(directory, "visual-assets"), { recursive: true });
await mkdir(resolve(directory, "public"), { recursive: true });
await copyFile(
  resolve("public/ReelSans.woff2"),
  resolve(directory, "public/ReelSans.woff2"),
);
const hash = await fileHash(videoPath),
  alias = `visual-assets/${hash}.mp4`;
await copyFile(videoPath, resolve(directory, alias));
const server = await privateAssetServer(directory, {
  presenter: { path: alias, contentHash: hash },
});
try {
  const serveUrl = await bundle({
    entryPoint: resolve("src/composition/presenter-index.tsx"),
    outDir: resolve(directory, "bundle"),
    publicDir: resolve(directory, "public"),
  });
  const browserExecutable = await localBrowser();
  const inputProps = { plan, videoUrl: `${server.baseUrl}/${alias}` };
  const composition = (
    await getCompositions(serveUrl, { inputProps, browserExecutable })
  ).find((c) => c.id === "PresenterReel");
  if (!composition) throw Error("Composition not found");
  for (const frame of [
    0,
    60,
    Math.min(245, plan.durationFrames - 1),
    Math.min(370, plan.durationFrames - 1),
    Math.min(510, plan.durationFrames - 1),
    plan.durationFrames - 15,
  ])
    await renderStill({
      serveUrl,
      composition,
      inputProps,
      browserExecutable,
      frame,
      output: resolve(directory, `preview-${frame}.png`),
    });
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    browserExecutable,
    codec: "h264",
    muted: true,
    pixelFormat: "yuv420p",
    colorSpace: "bt709",
    crf: 18,
    concurrency: 2,
    outputLocation: output,
    onProgress: (p) => {
      if (p.renderedFrames % 120 === 0)
        console.log(`Rendered ${p.renderedFrames}/${plan.durationFrames}`);
    },
  });
  await writeFile(
    resolve(directory, "render.json"),
    JSON.stringify(
      {
        frames: plan.durationFrames,
        hash: await fileHash(output),
        width: 1080,
        height: 1920,
        fps: 30,
        workspace,
      },
      null,
      2,
    ),
  );
} finally {
  await server.close();
}
