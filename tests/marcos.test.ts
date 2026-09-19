import { before, test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { prepareRecording } from "../src/infrastructure/audio/prepare";
import {
  locateRecording,
  measurePcm,
  fileHash,
} from "../src/infrastructure/audio/inspect";
import { createMarcosReel } from "../src/application/prepare-marcos";
import {
  LocalEstimatedAlignment,
  tokenize,
} from "../src/infrastructure/alignment/local-estimator";
import {
  compileCompositionSnapshot,
  msToFrames,
} from "../src/snapshot/compile";
import { ReelSchema } from "../src/domain/reel";
import { marcosVoice } from "../src/domain/voice";
import { originalHash, paragraphs } from "../src/fixtures/marcos";
import { lineAt } from "../src/composition/timing";
import { privateAssetServer } from "../src/infrastructure/audio/private-server";
import { get } from "node:http";
let preparation: Awaited<ReturnType<typeof prepareRecording>>;
before(async () => {
  preparation = await prepareRecording(resolve("."), resolve(".local/marcos"));
});
function pcm(bytes: Buffer) {
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(offset + 4);
    if (bytes.toString("ascii", offset, offset + 4) === "data")
      return bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  throw new Error("No WAV data");
}
test("original is detected, inspected and preserved; no substitution", async () => {
  assert.equal(
    await locateRecording(resolve(".")),
    resolve(".local/presenters/presenter-marcos/originals/VozMarcos.m4a"),
  );
  assert.equal(preparation.original.metadata.streams[0].codec_name, "aac");
  assert.equal(preparation.original.metadata.streams[0].sample_rate, "48000");
  assert.equal(preparation.original.metadata.streams[0].channels, 2);
  assert.equal(
    await fileHash(await locateRecording(resolve("."))),
    originalHash,
  );
});
test("normalization is measured PCM48 stereo; segmentation reconstructs every sample", async () => {
  const measured = await measurePcm(resolve(".local/marcos/normalized.wav"));
  assert.equal(
    measured.durationSamples,
    preparation.normalized.durationSamples,
  );
  assert.equal(
    measured.measuredDurationMs,
    Math.round((measured.durationSamples * 1000) / measured.sampleRate),
  );
  const source = pcm(await readFile(resolve(".local/marcos/normalized.wav")));
  const parts = await Promise.all(
    preparation.segments.map(async (s) =>
      pcm(await readFile(resolve(".local/marcos", s.path))),
    ),
  );
  assert.deepEqual(Buffer.concat(parts), source);
  assert.equal(
    preparation.segments.reduce((n, s) => n + s.durationSamples, 0),
    measured.durationSamples,
  );
  for (const boundary of preparation.boundaries.slice(1, -1))
    assert.ok(
      preparation.silences.some(
        (s) => boundary > s.startMs && boundary < s.endMs,
      ),
    );
  const lufs = Number(preparation.normalization.measuredOutput.input_i);
  assert.ok(lufs > -19 && lufs < -14);
  assert.ok(Number(preparation.normalization.measuredOutput.input_tp) <= -1.3);
});
test("normalization recipe regenerates identical audio bytes", async () => {
  const original = preparation.segments.map((s) => s.contentHash);
  const again = await prepareRecording(resolve("."), resolve(".local/marcos"));
  assert.deepEqual(
    again.segments.map((s) => s.contentHash),
    original,
  );
  assert.equal(
    again.normalized.contentHash,
    preparation.normalized.contentHash,
  );
});
test("Marcos is provider-independent default; every scene keeps its own audio and measured duration", () => {
  const { reel } = createMarcosReel(preparation, new LocalEstimatedAlignment());
  assert.equal(marcosVoice.locale, "es-ES");
  assert.equal(marcosVoice.providerBinding, undefined);
  assert.equal(reel.defaultVoiceProfileId, marcosVoice.id);
  assert.equal(new Set(reel.scenes.map((s) => s.audio.artifactId)).size, 5);
  assert.ok(
    reel.scenes.every((s) => s.audio.voiceProfileId === marcosVoice.id),
  );
  const changed = structuredClone(reel);
  changed.scenes[0].audio.voiceProfileId = "unknown";
  assert.equal(ReelSchema.safeParse(changed).success, false);
});
test("known transcript tokens preserve punctuation, Spanish and exact UTF-16 offsets", () => {
  const text = "¡Sí! Ágil, práctico: á é í ó ú ü ñ ¿cómo?";
  for (const t of tokenize(text))
    assert.equal(text.slice(t.charStart, t.charEnd), t.text);
  assert.equal(
    tokenize(paragraphs.join(" "))
      .map((t) => t.text)
      .join(" "),
    paragraphs.join(" "),
  );
});
test("estimated timing, lines, pauses and total snapshot obey the existing contract", () => {
  const aligner = new LocalEstimatedAlignment();
  const { reel, assets } = createMarcosReel(preparation, aligner);
  const snapshot = compileCompositionSnapshot(reel, assets);
  assert.equal(
    snapshot.durationInFrames,
    msToFrames(preparation.normalized.measuredDurationMs, 30),
  );
  assert.deepEqual(
    snapshot,
    compileCompositionSnapshot(structuredClone(reel), assets),
  );
  assert.ok(snapshot.durationInFrames > 360);
  for (let i = 0; i < reel.scenes.length; i++) {
    const scene = reel.scenes[i];
    assert.equal(scene.captions.source, "estimated");
    assert.equal(scene.narration, paragraphs[i]);
    scene.captions.tokens.forEach((t, j) => {
      assert.equal(t.confidence, undefined);
      assert.equal(scene.narration.slice(t.charStart, t.charEnd), t.text);
      if (j) assert.ok(t.startMs >= scene.captions.tokens[j - 1].endMs);
    });
    for (const l of scene.captions.lines) {
      const words = l.tokenIds.map(
        (id) => scene.captions.tokens.find((t) => t.id === id)!.text,
      );
      assert.ok(words.length <= 4);
      assert.ok(words.join(" ").length <= 26);
    }
  }
  const lastLine = snapshot.scenes[0].lines.at(-1)!;
  const lastToken = lastLine.tokens.at(-1)!;
  assert.ok(lineAt(snapshot.scenes[0].lines, lastToken.endFrame + 1));
  assert.equal(snapshot.theme.captionStyle.highlightActive, false);
});
test("private media is loopback-only, allowlisted and absent from public bundle inputs", async () => {
  const { assets } = createMarcosReel(
    preparation,
    new LocalEstimatedAlignment(),
  );
  const media = await privateAssetServer(resolve(".local/marcos"), assets);
  const request = (url: string) =>
    new Promise<number>((resolve, reject) =>
      get(url, (res) => {
        res.resume();
        resolve(res.statusCode!);
      }).on("error", reject),
    );
  try {
    assert.match(media.baseUrl, /^http:\/\/127\.0\.0\.1:/);
    assert.equal(await request(`${media.baseUrl}/audio/marcos-0.wav`), 200);
    assert.equal(await request(`${media.baseUrl}/VozMarcos.m4a`), 404);
    assert.equal(await request(`${media.baseUrl}/../normalized.wav`), 404);
  } finally {
    await media.close();
  }
  async function check(directory: string) {
    for (const e of await readdir(directory, { withFileTypes: true })) {
      assert.doesNotMatch(e.name, /marcos|normalized/i);
      if (e.isDirectory()) await check(join(directory, e.name));
    }
  }
  await check(resolve("public"));
});
test("local-only execution rejects outbound TCP before attempting a connection", () => {
  const code =
    "import net from 'node:net';try{net.connect({host:'blocked.invalid',port:443});process.exitCode=1;}catch(e){if(!e.message.includes('outbound network disabled'))throw e;}";
  execFileSync(
    process.execPath,
    [
      "--import",
      pathToFileURL(resolve("scripts/local-only.mjs")).href,
      "--input-type=module",
      "-e",
      code,
    ],
    { windowsHide: true },
  );
});
