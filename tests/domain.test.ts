import { test } from "node:test";
import assert from "node:assert/strict";
import { ReelSchema, sceneDurationMs } from "../src/domain/reel";
import { demo, assets, spanishCharacters } from "../src/fixtures/demo";
import {
  compileCompositionSnapshot,
  msToFrames,
} from "../src/snapshot/compile";
import { contentHash } from "../src/snapshot/hash";
import { lineAt, opacityAt } from "../src/composition/timing";
import { captionCharBudget } from "../src/application/captions";
test("ms conversion uses the supplied FPS and a shared rounding rule", () => {
  assert.equal(msToFrames(1000, 30), 30);
  assert.equal(msToFrames(1000, 60), 60);
  assert.equal(msToFrames(16, 30), 0);
  assert.equal(msToFrames(17, 30), 1);
  assert.throws(() => msToFrames(1.5, 30));
});
test("measured audio plus padding controls duration, target is authoring only", () => {
  const r = structuredClone(demo);
  r.scenes[0].targetDurationMs = 6000;
  r.scenes[0].paddingAfterMs = 500;
  const s = compileCompositionSnapshot(r, assets);
  assert.equal(sceneDurationMs(r.scenes[0]), 4500);
  assert.deepEqual(
    s.scenes.map((s) => s.startFrame),
    [0, 135, 255],
  );
  assert.equal(s.durationInFrames, 375);
});
test("fractional frame boundaries do not accumulate per-scene rounding drift", () => {
  const r = structuredClone(demo);
  r.scenes.forEach((s) => (s.paddingAfterMs = 17));
  const s = compileCompositionSnapshot(r, assets);
  assert.equal(s.durationInFrames, msToFrames(12051, 30));
  assert.equal(
    s.scenes.reduce((n, s) => n + s.durationFrames, 0),
    s.durationInFrames,
  );
});
test("schema rejects stale audio, invalid offsets, line references, duplicates, floats and unknown fields", () => {
  const mutations: Array<(r: typeof demo) => void> = [
    (r) => (r.scenes[1].id = r.scenes[0].id),
    (r) => (r.scenes[0].audio.measuredDurationMs = 4001),
    (r) => (r.scenes[0].captions.tokens[0].charEnd = 1),
    (r) => (r.scenes[0].captions.lines[0].tokenIds = ["missing"]),
    (r) => (r.scenes[0].captions.tokens[1].startMs = 400),
    (r) => (r.scenes[0].captions.audioContentHash = "a".repeat(64)),
    (r) => (r.scenes[0].paddingAfterMs = 0.5),
    (r) => (r.scenes[0].transition.durationMs = 1001),
  ];
  for (const mutate of mutations) {
    const r = structuredClone(demo);
    mutate(r);
    assert.equal(ReelSchema.safeParse(r).success, false);
  }
  assert.equal(ReelSchema.safeParse({ ...demo, extra: 1 }).success, false);
  assert.throws(() => compileCompositionSnapshot(demo, {}));
});
test("audio substitution is scene-local and style does not change generative inputs", () => {
  const r = structuredClone(demo);
  r.scenes[0].audio = structuredClone(r.scenes[1].audio);
  r.scenes[0].captions.audioContentHash = r.scenes[0].audio.contentHash;
  const s = compileCompositionSnapshot(r, assets);
  assert.equal(s.scenes[0].audio.src, s.scenes[1].audio.src);
  assert.deepEqual(r.scenes[2], demo.scenes[2]);
  const styled = structuredClone(demo);
  styled.theme.captionStyle.activeBackground = "#FF0000";
  assert.deepEqual(
    styled.scenes.map((s) => s.audio),
    demo.scenes.map((s) => s.audio),
  );
  assert.notEqual(
    contentHash(compileCompositionSnapshot(styled, assets)),
    contentHash(compileCompositionSnapshot(demo, assets)),
  );
});
test("caption lines remain visible through a natural 150ms word pause", () => {
  const s = compileCompositionSnapshot(demo, assets).scenes[0];
  const frame = msToFrames(700, 30);
  const line = lineAt(s.lines, frame);
  assert.ok(line);
  assert.equal(line.tokens.length, 3);
  assert.equal(
    line.tokens.some((t) => frame >= t.startFrame && frame < t.endFrame),
    false,
  );
  assert.equal(lineAt(s.lines, msToFrames(1600, 30))?.id, "line-1");
});
test("same input yields deterministic snapshot/hash; object key order is irrelevant", () => {
  assert.deepEqual(
    compileCompositionSnapshot(demo, assets),
    compileCompositionSnapshot(structuredClone(demo), assets),
  );
  assert.equal(contentHash({ b: 2, a: 1 }), contentHash({ a: 1, b: 2 }));
});
test("Spanish transcript offsets preserve UTF-16 text exactly", () => {
  const r = structuredClone(demo);
  const s = r.scenes[0];
  s.narration = spanishCharacters;
  s.captions.tokens = [
    {
      id: "es",
      text: spanishCharacters,
      charStart: 0,
      charEnd: spanishCharacters.length,
      startMs: 300,
      endMs: 1000,
    },
  ];
  s.captions.lines = [
    { id: "es-line", tokenIds: ["es"], startMs: 300, endMs: 1500 },
  ];
  assert.equal(
    compileCompositionSnapshot(r, assets).scenes[0].lines[0].tokens[0].text,
    "áéíóúüñ¿¡",
  );
});
test("transition boundaries exhaustively stay renderable for every quantized fade", () => {
  for (let durationMs = 1000; durationMs <= 2100; durationMs += 1) {
    for (const fadeMs of [
      0,
      1,
      Math.floor(durationMs / 2) - 1,
      Math.floor(durationMs / 2),
      1000,
    ]) {
      const r = structuredClone(demo);
      const s = r.scenes[0];
      r.scenes = [s];
      s.audio.measuredDurationMs = durationMs;
      delete s.audio.precision;
      s.captions.tokens = [];
      s.captions.lines = [];
      s.transition.durationMs = fadeMs;
      if (!ReelSchema.safeParse(r).success) continue;
      const compiled = compileCompositionSnapshot(r, assets).scenes[0];
      for (const f of [
        0,
        compiled.fadeFrames,
        compiled.durationFrames - compiled.fadeFrames - 1,
        compiled.durationFrames - 1,
      ])
        assert.ok(
          Number.isFinite(
            opacityAt(f, compiled.durationFrames, compiled.fadeFrames),
          ),
        );
    }
  }
});
test("the audio contract is WAV from the domain to the private server", () => {
  const mpeg = structuredClone(demo) as unknown as {
    scenes: { audio: { mimeType: string } }[];
  };
  mpeg.scenes[0].audio.mimeType = "audio/mpeg";
  assert.equal(ReelSchema.safeParse(mpeg).success, false);
  const mp3 = structuredClone(assets) as Record<
    string,
    { path: string; contentHash: string }
  >;
  mp3["voice-0"].path = "audio/scene-0.mp3";
  assert.throws(() => compileCompositionSnapshot(demo, mp3));
});
test("the caption budget follows the caption font size instead of a fixed 26 characters", () => {
  // 26 era el límite fijo anterior; es el que corresponde al tamaño de la demo.
  assert.equal(captionCharBudget(49), 26);
  assert.equal(captionCharBudget(56), 23);
  assert.equal(captionCharBudget(72), 18);
  assert.ok(captionCharBudget(24, 1200) > captionCharBudget(24));
  for (let fontSize = 24; fontSize < 72; fontSize++)
    assert.ok(captionCharBudget(fontSize) >= captionCharBudget(fontSize + 1));
});
