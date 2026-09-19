import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, copyFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { ffmpeg } from "../src/infrastructure/audio/ffmpeg";
import { fileHash, locateRecording } from "../src/infrastructure/audio/inspect";
import { analyzePcm16 } from "../src/infrastructure/audio/pcm-analysis";
import {
  preparePresenter,
  assertSameVideoPackets,
  assertContinuousAudio,
} from "../src/infrastructure/presenter/prepare";
import { PresenterAssetSchema } from "../src/domain/presenter-asset";
import { createVisualFixtures } from "./fixtures/visual-fixtures";

test("presenter preparation preserves real video payload/timestamps and audio length, rejects unsafe paths and overwrite", async () => {
  const workspace = resolve(`.local/presenter-test-${randomUUID()}`),
    originals = resolve(
      workspace,
      ".local/presenters/test-presenter/originals",
    );
  await mkdir(originals, { recursive: true });
  await writeFile(resolve(workspace, ".gitignore"), ".local/\n");
  const source = resolve(originals, "technical.mp4");
  const fixtures = await createVisualFixtures(workspace);
  await ffmpeg([
    "-v",
    "error",
    "-f",
    "image2",
    "-framerate",
    "30",
    "-i",
    resolve(fixtures.mediaDirectory, "frame-%03d.png"),
    "-i",
    fixtures.audio,
    "-vf",
    "scale=120:214",
    "-t",
    "2.048",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-af",
    "volume=0.1",
    "-c:a",
    "aac",
    "-ar",
    "48000",
    "-b:a",
    "96k",
    source,
  ]);
  const originalHash = await fileHash(source),
    { asset, directory } = await preparePresenter(
      workspace,
      source,
      "test-presenter",
    );
  assert.equal(await fileHash(source), originalHash);
  assert.equal(asset.validation.videoPacketsAndTimestampsIdentical, true);
  assert.equal(asset.temporalModifications.kind, "none");
  assert.equal(asset.audio.sampleFrames, 98304);
  assert.ok(Math.abs(asset.audio.prepared.integratedLufs + 18) < 1);
  await assertContinuousAudio(resolve(workspace, asset.preparedPath), 98304);
  const pcm = analyzePcm16(
    await readFile(resolve(directory, "audio-prepared.wav")),
  );
  assert.equal(pcm.sampleFrames, 98304);
  assert.equal(pcm.channelStats[0].fullScaleSamples, 0);
  const altered = structuredClone(asset);
  altered.presenterId = "someone-else";
  assert.equal(PresenterAssetSchema.safeParse(altered).success, false);
  assert.equal(
    PresenterAssetSchema.safeParse({
      ...asset,
      privacy: { ...asset.privacy, classification: "public" },
    }).success,
    false,
  );
  assert.equal(
    PresenterAssetSchema.safeParse({
      ...asset,
      temporalModifications: { kind: "speed", factor: 1.05 },
    }).success,
    false,
  );
  await assert.rejects(preparePresenter(workspace, source, "test-presenter"), {
    code: "EEXIST",
  });
  await assert.rejects(
    preparePresenter(workspace, resolve("README.md"), "test-presenter"),
  );
  await assert.rejects(
    assertContinuousAudio(resolve(workspace, asset.preparedPath), 98305),
    /exactly/,
  );
});

test("packet verification rejects same frames at shifted timestamps", () => {
  const packet = {
    pts: "0",
    dts: "0",
    duration: "3000",
    size: "10",
    data_hash: "SHA256:example",
  };
  assertSameVideoPackets([packet], [{ ...packet }]);
  assert.throws(
    () => assertSameVideoPackets([packet], [{ ...packet, pts: "3000" }]),
    /timestamps/,
  );
  assert.throws(
    () =>
      assertSameVideoPackets([packet], [{ ...packet, data_hash: "changed" }]),
    /payload/,
  );
});

test("PCM analysis detects clipping and rejects truncated input", () => {
  const wav = Buffer.alloc(48);
  wav.write("RIFF");
  wav.writeUInt32LE(40, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(48000, 24);
  wav.writeUInt32LE(96000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(4, 40);
  wav.writeInt16LE(32767, 44);
  wav.writeInt16LE(-32768, 46);
  const metrics = analyzePcm16(wav);
  assert.equal(metrics.sampleFrames, 2);
  assert.equal(metrics.channelStats[0].fullScaleSamples, 2);
  assert.throws(() => analyzePcm16(wav.subarray(0, 47)), /Truncated/);
});

test("recording relocation remains discoverable and ambiguous originals fail closed", async () => {
  const root = resolve(`.local/recording-path-test-${randomUUID()}`),
    organized = resolve(root, ".local/presenters/presenter-marcos/originals");
  await mkdir(organized, { recursive: true });
  const original = await locateRecording(resolve("."));
  await copyFile(original, resolve(organized, "VozMarcos.m4a"));
  assert.equal(
    await locateRecording(root),
    resolve(organized, "VozMarcos.m4a"),
  );
  await copyFile(original, resolve(root, "VozMarcos.m4a"));
  await assert.rejects(locateRecording(root), /found 2/);
});
