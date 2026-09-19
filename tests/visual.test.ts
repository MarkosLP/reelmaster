import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { get } from "node:http";
import { createTechnicalVisualProduction } from "./fixtures/visual-fixtures";
import {
  createVisualManifest,
  validateVisualManifest,
  assignVisualAsset,
  visualAssignmentState,
  resolveSceneVisual,
} from "../src/application/visual-manifest";
import {
  VisualAssetManifestSchema,
  BindingPresentationSchema,
  VisualAssetSchema,
} from "../src/domain/visual-asset";
import { importVisualAsset } from "../src/infrastructure/visual/import-asset";
import {
  listProductionAssets,
  assignProductionAsset,
  productionAssetStatus,
} from "../src/infrastructure/visual/operations";
import { compilePreparedReel } from "../src/application/prepared-reel";
import {
  loadPreparedProduction,
  importProduction,
} from "../src/infrastructure/production/operations";
import { privateAssetServer } from "../src/infrastructure/audio/private-server";
import { fileHash } from "../src/infrastructure/audio/inspect";
import { contentHash } from "../src/snapshot/hash";
import { ffmpeg } from "../src/infrastructure/audio/ffmpeg";
let demo: Awaited<ReturnType<typeof createTechnicalVisualProduction>>;
let image: Awaited<ReturnType<typeof importVisualAsset>>,
  video: typeof image,
  screen: typeof image;
const workspace = resolve(".");
before(async () => {
  demo = await createTechnicalVisualProduction(workspace);
  image = await importVisualAsset(
    workspace,
    demo.directory,
    demo.fixtures.image,
    "image",
    demo.plan.presenter.id,
    true,
  );
  video = await importVisualAsset(
    workspace,
    demo.directory,
    demo.fixtures.video,
    "broll",
    demo.plan.presenter.id,
    true,
  );
  screen = await importVisualAsset(
    workspace,
    demo.directory,
    demo.fixtures.screen,
    "screenCapture",
    demo.plan.presenter.id,
    true,
  );
});
test("Visual manifest preserves requirements, stable IDs and omits textOnly assets", () => {
  const manifest = createVisualManifest(demo.plan);
  assert.deepEqual(manifest, createVisualManifest(structuredClone(demo.plan)));
  assert.equal(manifest.unresolvedCount, 3);
  assert.equal(manifest.status, "unresolved");
  assert.deepEqual(
    manifest.requirements.map((r) => [r.sceneId, r.requiredType, r.status]),
    [
      ["scene-1", "image", "missing"],
      ["scene-2", "broll", "missing"],
      ["scene-3", "screenCapture", "missing"],
    ],
  );
  assert.equal(
    manifest.requirements.some((r) => r.sceneId === "scene-4"),
    false,
  );
  assert.equal(demo.plan.draft.scenes[3].visualIntent.kind, "textOnly");
});
test("Image inspection uses bytes, real dimensions, hash and leaves original unchanged", async () => {
  assert.equal(image.source.mime, "image/png");
  assert.equal(image.metadata.width, 640);
  assert.equal(image.metadata.height, 480);
  assert.equal(image.metadata.orientation, "landscape");
  assert.equal(image.source.contentHash, await fileHash(demo.fixtures.image));
  assert.equal(
    image.contentHash,
    await fileHash(resolve(demo.directory, image.path)),
  );
  assert.equal(image.source.contentHash, image.contentHash); // Small PNG is copied, not needlessly converted.
  assert.equal(image.privacy.publicable, false);
});
test("Video is decoded, normalized to H264/CFR30 and loses its source audio", async () => {
  assert.equal(video.source.metadata.hasAudio, true);
  assert.equal(video.metadata.hasAudio, false);
  assert.equal(video.metadata.codec, "h264");
  assert.equal(video.metadata.fps, 30);
  assert.equal(video.metadata.rotation, 0);
  assert.equal(video.metadata.durationMs, 4000);
  assert.equal(video.source.contentHash, await fileHash(demo.fixtures.video));
  const again = await importVisualAsset(
    workspace,
    demo.directory,
    demo.fixtures.video,
    "broll",
    demo.plan.presenter.id,
    true,
  );
  assert.equal(again.contentHash, video.contentHash);
  assert.equal(again.recipe.inputHash, video.recipe.inputHash);
});
test("screenCapture remains semantic for both image and video files", async () => {
  assert.equal(screen.type, "screenCapture");
  assert.equal(screen.metadata.kind, "image");
  const recordedScreen = await importVisualAsset(
    workspace,
    demo.directory,
    demo.fixtures.video,
    "screenCapture",
    demo.plan.presenter.id,
    true,
  );
  assert.equal(recordedScreen.type, "screenCapture");
  assert.equal(recordedScreen.metadata.kind, "video");
  const bound = assignVisualAsset(
    demo.plan,
    createVisualManifest(demo.plan),
    "visual-scene-3",
    screen,
  );
  assert.equal(bound.bindings[0].presentation.fit, "contain");
});
test("Presenter assets associate explicitly with presenter identity without alteration", async () => {
  const presenter = await importVisualAsset(
    workspace,
    demo.directory,
    demo.fixtures.image,
    "presenter",
    demo.plan.presenter.id,
    true,
  );
  const presenterVideo = await importVisualAsset(
    workspace,
    demo.directory,
    demo.fixtures.video,
    "presenter",
    demo.plan.presenter.id,
    true,
  );
  assert.equal(presenter.type, "presenterImage");
  assert.equal(presenterVideo.type, "presenterVideo");
  assert.equal(presenter.presenterId, "presenter-technical");
  assert.equal(presenter.contentHash, image.contentHash);
  assert.equal(
    VisualAssetSchema.safeParse({ ...presenter, presenterId: undefined })
      .success,
    false,
  );
});
test("Wrong semantic/physical assignment and cross-production manifests are rejected", () => {
  assert.throws(() =>
    assignVisualAsset(
      demo.plan,
      createVisualManifest(demo.plan),
      "visual-scene-1",
      video,
    ),
  );
  assert.throws(() =>
    assignVisualAsset(
      demo.plan,
      createVisualManifest(demo.plan),
      "visual-scene-3",
      image,
    ),
  );
  assert.throws(
    () =>
      validateVisualManifest(demo.plan, {
        ...createVisualManifest(demo.plan),
        productionId: "other",
      }),
    { code: "STALE_ARTIFACT" },
  );
  assert.equal(
    VisualAssetSchema.safeParse({ ...image, type: "video" }).success,
    false,
  );
});
test("Required missing/assigned/rejected states all remain unresolved", () => {
  const missing = createVisualManifest(demo.plan),
    assigned = visualAssignmentState(missing, "visual-scene-1", "assigned"),
    rejected = visualAssignmentState(
      assigned,
      "visual-scene-1",
      "rejected",
      "INVALID_VISUAL",
    );
  assert.equal(rejected.status, "unresolved");
  assert.equal(rejected.unresolvedCount, 3);
  assert.equal(rejected.requirements[0].status, "rejected");
  assert.equal(rejected.bindings.length, 0);
  assert.equal(
    VisualAssetManifestSchema.safeParse({
      ...rejected,
      unresolvedCount: 0,
      status: "resolved",
    }).success,
    false,
  );
});
test("Presentation defaults mute video and preserve cover/contain with bounded focal points", () => {
  const manifest = assignVisualAsset(
    demo.plan,
    createVisualManifest(demo.plan),
    "visual-scene-2",
    video,
  );
  assert.deepEqual(manifest.bindings[0].presentation, {
    fit: "cover",
    focalPointX: 0.5,
    focalPointY: 0.5,
    startOffsetMs: 0,
    muted: true,
    shortVideoPolicy: "reject",
  });
  for (const patch of [
    { focalPointX: -0.1 },
    { focalPointY: 1.1 },
    { fit: "stretch" },
    { muted: false },
    { shortVideoPolicy: "loop" },
  ])
    assert.equal(
      BindingPresentationSchema.safeParse({
        ...manifest.bindings[0].presentation,
        ...patch,
      }).success,
      false,
    );
  assert.throws(() =>
    assignVisualAsset(
      demo.plan,
      createVisualManifest(demo.plan),
      "visual-scene-1",
      image,
      { startOffsetMs: 1 },
    ),
  );
});
test("Clip policy checks offset and measured frame duration, never estimated targets", () => {
  const manifest = assignVisualAsset(
    demo.plan,
    createVisualManifest(demo.plan),
    "visual-scene-2",
    video,
    { startOffsetMs: 500 },
  );
  assert.equal(
    resolveSceneVisual(manifest, "scene-2", 60, 30).startOffsetMs,
    500,
  );
  assert.throws(() => resolveSceneVisual(manifest, "scene-2", 106, 30), {
    code: "ASSETS_PENDING",
  });
});
test("Format detection accepts renamed PNG but rejects SVG, corrupt media and local escapes", async () => {
  const renamed = resolve(demo.fixtures.mediaDirectory, "misleading.jpg");
  await copyFile(demo.fixtures.image, renamed);
  assert.equal(
    (
      await importVisualAsset(
        workspace,
        demo.directory,
        renamed,
        "image",
        demo.plan.presenter.id,
      )
    ).source.mime,
    "image/png",
  );
  const svg = resolve(demo.fixtures.mediaDirectory, "bad.png");
  await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await assert.rejects(
    importVisualAsset(
      workspace,
      demo.directory,
      svg,
      "image",
      demo.plan.presenter.id,
    ),
  );
  await assert.rejects(
    importVisualAsset(
      workspace,
      demo.directory,
      resolve("README.md"),
      "image",
      demo.plan.presenter.id,
    ),
    { code: "UNSAFE_PATH" },
  );
  await assert.rejects(
    importVisualAsset(
      workspace,
      demo.directory,
      "\\\\server\\share\\photo.png",
      "image",
      demo.plan.presenter.id,
    ),
    { code: "UNSAFE_PATH" },
  );
});
test("JPEG decodes and normalizes; non-default EXIF rotation is explicitly rejected", async () => {
  const jpeg = resolve(demo.fixtures.mediaDirectory, "photo-fixture.jpg");
  await ffmpeg([
    "-v",
    "error",
    "-i",
    demo.fixtures.image,
    "-frames:v",
    "1",
    "-c:v",
    "mjpeg",
    jpeg,
  ]);
  const result = await importVisualAsset(
    workspace,
    demo.directory,
    jpeg,
    "image",
    demo.plan.presenter.id,
    true,
  );
  assert.equal(result.source.mime, "image/jpeg");
  assert.equal(result.mime, "image/png");
  const source = await readFile(jpeg),
    exif = Buffer.from(
      "ffe1002245786966000049492a0008000000010012010300010000000600000000000000",
      "hex",
    );
  const rotated = resolve(demo.fixtures.mediaDirectory, "rotated.jpg");
  await writeFile(
    rotated,
    Buffer.concat([source.subarray(0, 2), exif, source.subarray(2)]),
  );
  await assert.rejects(
    importVisualAsset(
      workspace,
      demo.directory,
      rotated,
      "image",
      demo.plan.presenter.id,
    ),
    { code: "UNSUPPORTED" },
  );
});
test("Visual allowlist serves MIME/ranges on loopback and rejects unknown/traversal paths", async () => {
  const assets = {
    [image.id]: { path: image.path, contentHash: image.contentHash },
    [video.id]: { path: video.path, contentHash: video.contentHash },
  };
  const server = await privateAssetServer(demo.directory, {}, [
    { root: demo.directory, assets },
  ]);
  const request = (url: string, headers = {}) =>
    new Promise<{ status: number; mime: string | undefined; bytes: number }>(
      (resolve, reject) =>
        get(url, { headers }, (res) => {
          let bytes = 0;
          res.on("data", (chunk) => (bytes += chunk.length));
          res.on("end", () =>
            resolve({
              status: res.statusCode!,
              mime: res.headers["content-type"],
              bytes,
            }),
          );
        }).on("error", reject),
    );
  try {
    assert.match(server.baseUrl, /^http:\/\/127\.0\.0\.1:/);
    assert.equal(
      (await request(`${server.baseUrl}/${image.path}`)).mime,
      "image/png",
    );
    assert.deepEqual(
      await request(`${server.baseUrl}/${video.path}`, { Range: "bytes=0-9" }),
      { status: 206, mime: "video/mp4", bytes: 10 },
    );
    for (const path of [
      "visual-assets/originals/source.png",
      "../production-plan.json",
      "visual-assets/%2e%2e/production-plan.json",
      "visual-assets/missing.png",
    ])
      assert.equal((await request(`${server.baseUrl}/${path}`)).status, 404);
  } finally {
    await server.close();
  }
  await assert.rejects(
    privateAssetServer(demo.directory, {
      bad: { path: "../README.md", contentHash: image.contentHash },
    }),
  );
  await assert.rejects(
    privateAssetServer(demo.directory, {
      bad: { path: image.path, contentHash: "0".repeat(64) },
    }),
  );
});
test("Production remains blocked until all validated bindings exist, then snapshot uses prepared references", async () => {
  const loaded = await loadPreparedProduction(workspace, demo.planPath);
  assert.equal(loaded.plan.state.kind, "prepared");
  assert.throws(() => compilePreparedReel(loaded.plan, loaded.prepared), {
    code: "INVALID_STATE",
  });
  await listProductionAssets(workspace, demo.planPath);
  await assignProductionAsset(
    workspace,
    demo.planPath,
    "visual-scene-1",
    demo.fixtures.image,
    { fit: "contain", focalPointX: 0.2 },
    true,
  );
  await assignProductionAsset(
    workspace,
    demo.planPath,
    "visual-scene-2",
    demo.fixtures.video,
    { startOffsetMs: 500 },
    true,
  );
  assert.equal(
    (await productionAssetStatus(workspace, demo.planPath)).productionStatus,
    "prepared",
  );
  const result = await assignProductionAsset(
    workspace,
    demo.planPath,
    "visual-scene-3",
    demo.fixtures.screen,
    undefined,
    true,
  );
  assert.equal(result.plan.state.kind, "renderable");
  assert.equal(result.manifest.unresolvedCount, 0);
  const final = await loadPreparedProduction(workspace, demo.planPath),
    compiled = compilePreparedReel(final.plan, final.prepared);
  assert.deepEqual(
    compiled.snapshot.scenes.map((s) => s.visual.kind),
    ["image", "video", "image", "typography"],
  );
  assert.equal(compiled.snapshot.templateVersion, "local-media-v1");
  assert.equal(compiled.snapshot.durationInFrames, 240);
  const visual = compiled.snapshot.scenes[1].visual;
  if (visual.kind === "typography") assert.fail();
  assert.equal(visual.startOffsetFrames, 15);
  assert.equal(visual.muted, true);
  assert.match(visual.src, /^visual-assets\/[a-f0-9]{64}\.mp4$/);
  assert.ok(
    compiled.snapshot.scenes.every((s) => s.audio.src.startsWith("audio/")),
  );
  assert.equal(contentHash(final.plan.draft), demo.plan.draftContentHash);
  await assert.rejects(
    assignProductionAsset(
      workspace,
      demo.planPath,
      "visual-scene-1",
      demo.fixtures.image,
    ),
    { code: "INVALID_STATE" },
  );
});
test("Composition does not inspect files, assets, requirements or production plans", async () => {
  for (const file of [
    "src/composition/MediaSceneView.tsx",
    "src/composition/SceneView.tsx",
    "src/composition/Reel.tsx",
  ]) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(
      source,
      /ProductionPlan|visualIntent|requirement|ffprobe|readFile|VisualAsset|TextProvider|ollama/i,
    );
  }
});
test("Video rotation is normalized into actual portrait pixels", async () => {
  const rotated = resolve(demo.fixtures.mediaDirectory, "rotated.mp4");
  await ffmpeg([
    "-v",
    "error",
    "-display_rotation:v:0",
    "90",
    "-i",
    demo.fixtures.video,
    "-c",
    "copy",
    rotated,
  ]);
  const result = await importVisualAsset(
    workspace,
    demo.directory,
    rotated,
    "broll",
    demo.plan.presenter.id,
    true,
  );
  assert.notEqual(result.source.metadata.rotation, 0);
  assert.equal(result.metadata.rotation, 0);
  assert.equal(result.metadata.width, 180);
  assert.equal(result.metadata.height, 320);
});
test("Assets assigned before audio are rechecked against measured timing; a short clip cannot discard valid narration", async () => {
  const staged = await createTechnicalVisualProduction(workspace, false);
  const short = resolve(staged.fixtures.mediaDirectory, "short.mp4");
  await ffmpeg([
    "-v",
    "error",
    "-i",
    staged.fixtures.video,
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-an",
    short,
  ]);
  await assignProductionAsset(
    workspace,
    staged.planPath,
    "visual-scene-1",
    staged.fixtures.image,
    undefined,
    true,
  );
  await assignProductionAsset(
    workspace,
    staged.planPath,
    "visual-scene-2",
    short,
    undefined,
    true,
  );
  const assigned = await assignProductionAsset(
    workspace,
    staged.planPath,
    "visual-scene-3",
    staged.fixtures.screen,
    undefined,
    true,
  );
  assert.equal(assigned.manifest.status, "resolved");
  assert.equal(assigned.plan.state.kind, "waitingForNarration");
  const imported = await importProduction(
    workspace,
    staged.planPath,
    staged.fixtures.audio,
    staged.reviewPath,
  );
  assert.equal(imported.plan.state.kind, "prepared");
  const status = await productionAssetStatus(workspace, staged.planPath);
  assert.equal(status.requirements[1].status, "rejected");
  assert.equal(status.unresolvedCount, 1);
  await assert.rejects(
    assignProductionAsset(
      workspace,
      staged.planPath,
      "visual-scene-2",
      short,
      undefined,
      true,
    ),
    { code: "ASSETS_PENDING" },
  );
  assert.equal(
    (
      await assignProductionAsset(
        workspace,
        staged.planPath,
        "visual-scene-2",
        staged.fixtures.video,
        undefined,
        true,
      )
    ).plan.state.kind,
    "renderable",
  );
});
