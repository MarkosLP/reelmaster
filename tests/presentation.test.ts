import { test } from "node:test";
import assert from "node:assert/strict";
import baseline from "../src/fixtures/snapshot.json";
import type { CompositionSnapshot } from "../src/snapshot/types";
import { applyPresentation } from "../src/snapshot/presentation";
import { contentHash } from "../src/snapshot/hash";
import { motionProgress } from "../src/snapshot/motion";

const source = baseline as CompositionSnapshot;
const spec = () => ({
  version: 1,
  sourceSnapshotHash: contentHash(source),
  scenes: source.scenes.map((s) => ({
    sceneId: s.id,
    graphic: { version: 1, layout: "organize", title: "Tareas", count: 3 },
  })),
});
test("presentation preserves every existing snapshot field and does not mutate source", () => {
  const before = structuredClone(source);
  const result = applyPresentation(source, spec());
  assert.deepEqual(source, before);
  for (const scene of result.scenes) delete scene.presentation;
  assert.deepEqual(result, before);
});
test("presentation rejects stale, duplicate, missing, unknown bindings and nonvisual overrides", () => {
  const stale = spec();
  stale.sourceSnapshotHash = "0".repeat(64);
  assert.throws(() => applyPresentation(source, stale), /Stale/);
  const duplicate = spec();
  duplicate.scenes[1].sceneId = duplicate.scenes[0].sceneId;
  assert.throws(() => applyPresentation(source, duplicate), /exactly once/);
  const missing = spec();
  missing.scenes.pop();
  assert.throws(() => applyPresentation(source, missing), /exactly once/);
  const unknown = spec();
  unknown.scenes[0].sceneId = "unknown";
  assert.throws(() => applyPresentation(source, unknown), /exactly once/);
  assert.throws(() =>
    applyPresentation(source, { ...spec(), audio: { src: "other.wav" } }),
  );
  const invalid = spec();
  invalid.scenes[0].graphic.count = 9;
  assert.throws(() => applyPresentation(source, invalid));
});
test("motion is bounded and progresses through the scene at any duration", () => {
  for (const duration of [30, 124, 164, 300]) {
    assert.equal(motionProgress(0, duration, 0.1, 0.95), 0);
    assert.equal(motionProgress(duration - 1, duration, 0.1, 0.95), 1);
    let previous = 0;
    for (let frame = 0; frame < duration; frame++) {
      const value = motionProgress(frame, duration, 0.1, 0.95);
      assert.ok(value >= previous && value <= 1);
      previous = value;
    }
    assert.ok(
      motionProgress(Math.floor(duration * 0.85), duration, 0.1, 0.95) < 1,
    );
  }
});
