import { parseArgs } from "node:util";
import { resolve, dirname } from "node:path";
import { readFile, mkdir, access } from "node:fs/promises";
import { applyPresentation } from "../src/snapshot/presentation";
import { randomUUID } from "node:crypto";
import { getCompositions, renderMedia, renderStill } from "@remotion/renderer";
import {
  loadVisualManifest,
  verifyVisualFiles,
} from "../src/infrastructure/visual/operations";
import { contentHash } from "../src/snapshot/hash";
import { loadPreparedProduction } from "../src/infrastructure/production/operations";
import {
  productionDirectory,
  withProductionLock,
  atomicJson,
  assertInside,
} from "../src/infrastructure/production/local-files";
import { compilePreparedReel } from "../src/application/prepared-reel";
import {
  ProductionError,
  transitionProduction,
} from "../src/application/production-plan";
import { privateAssetServer } from "../src/infrastructure/audio/private-server";
import { localBrowser } from "../src/infrastructure/audio/browser";
import { fileHash } from "../src/infrastructure/audio/inspect";
import { probe } from "../src/infrastructure/audio/ffmpeg";
try {
  const { values } = parseArgs({
    options: {
      plan: { type: "string" },
      stills: { type: "boolean", default: false },
      presentation: { type: "string" },
      output: { type: "string" },
    },
    strict: true,
  });
  if (!values.plan)
    throw new ProductionError("INVALID_PLAN", "--plan is required");
  const planPath = resolve(values.plan),
    workspace = resolve(".");
  const directory = await productionDirectory(workspace, planPath);
  await withProductionLock(directory, async () => {
    const { plan, importedRoot, prepared } = await loadPreparedProduction(
      workspace,
      planPath,
    );
    if (
      plan.state.kind !== "renderable" &&
      !(values.presentation && plan.state.kind === "rendered")
    )
      throw new ProductionError(
        "INVALID_STATE",
        "Production must be renderable",
      );
    const {
      snapshot: sourceSnapshot,
      assets,
      visualAssets,
    } = compilePreparedReel(plan, prepared);
    if (Boolean(values.presentation) !== Boolean(values.output))
      throw Error(
        "Presentation variants require both --presentation and --output",
      );
    const snapshot = values.presentation
      ? applyPresentation(
          sourceSnapshot,
          JSON.parse(await readFile(resolve(values.presentation), "utf8")),
        )
      : sourceSnapshot;
    const variantOutput = values.output ? resolve(values.output) : undefined;
    if (variantOutput) {
      await assertInside(resolve(workspace, "out"), dirname(variantOutput));
      if (!variantOutput.endsWith(".mp4"))
        throw Error("Variant output must be MP4");
      let exists = false;
      try {
        await access(variantOutput);
        exists = true;
      } catch {
        /* new output */
      }
      if (exists)
        throw Error("Variant output already exists; choose a new path");
    }
    if (prepared.visualManifest) {
      const manifest = await loadVisualManifest(directory, plan);
      if (contentHash(manifest) !== plan.visualManifestHash)
        throw new ProductionError(
          "STALE_ARTIFACT",
          "Visual manifest differs from sealed production",
        );
      await verifyVisualFiles(directory, manifest);
    }
    for (const asset of Object.values(assets))
      await assertInside(importedRoot, resolve(importedRoot, asset.path));
    const browserExecutable = await localBrowser();
    const media = await privateAssetServer(importedRoot, assets, [
      { root: directory, assets: visualAssets },
    ]);
    const started = performance.now();
    try {
      const serveUrl = resolve("build/renderer"),
        inputProps = { snapshot, mediaBaseUrl: media.baseUrl };
      const composition = (
        await getCompositions(serveUrl, { inputProps, browserExecutable })
      ).find((c) => c.id === "ReelDemo");
      if (!composition)
        throw new ProductionError("INVALID_STATE", "Composition not found");
      const output =
        variantOutput ?? resolve(importedRoot, `reel-${randomUUID()}.mp4`);
      await renderMedia({
        serveUrl,
        inputProps,
        composition,
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
      });
      const metadata = await probe(output),
        video = metadata.streams.find((s) => s.codec_type === "video"),
        audio = metadata.streams.find((s) => s.codec_type === "audio");
      if (
        !video ||
        !audio ||
        video.codec_name !== "h264" ||
        audio.codec_name !== "aac" ||
        video.width !== 1080 ||
        video.height !== 1920 ||
        video.r_frame_rate !== "30/1" ||
        Math.abs(Number(video.duration) - snapshot.durationInFrames / 30) > 0.01
      )
        throw new ProductionError(
          "INVALID_STATE",
          "Rendered output failed media verification",
        );
      const videoHash = await fileHash(output);
      if (values.stills)
        for (const scene of snapshot.scenes)
          await renderStill({
            serveUrl,
            inputProps,
            composition,
            browserExecutable,
            frame: scene.startFrame + Math.floor(scene.durationFrames / 2),
            output: resolve(
              variantOutput ? dirname(variantOutput) : importedRoot,
              `${scene.id}.png`,
            ),
          });
      const evidenceRoot = variantOutput
        ? dirname(variantOutput)
        : importedRoot;
      if (variantOutput) {
        await mkdir(evidenceRoot, { recursive: true });
        await atomicJson(
          resolve(evidenceRoot, "composition-snapshot.json"),
          snapshot,
        );
      }
      await atomicJson(resolve(evidenceRoot, "render-validation.json"), {
        output,
        videoHash,
        elapsedMs: performance.now() - started,
        durationInFrames: snapshot.durationInFrames,
        metadata,
        apiCostEur: 0,
        ...(variantOutput
          ? {
              sourceProductionId: plan.id,
              sourceSnapshotHash: contentHash(sourceSnapshot),
              presentationSnapshotHash: contentHash(snapshot),
              preparedHash: contentHash(prepared),
            }
          : {}),
      });
      if (!variantOutput)
        await atomicJson(
          planPath,
          transitionProduction(plan, {
            ...plan.state,
            kind: "rendered",
            videoHash,
          }),
        );
      console.log({ state: "rendered", output, videoHash, apiCostEur: 0 });
    } finally {
      await media.close();
    }
  });
} catch (error) {
  console.error(
    error instanceof ProductionError
      ? { code: error.code, message: error.message }
      : { code: "RENDER_FAILED", message: "Local production render failed" },
  );
  process.exitCode = 1;
}
