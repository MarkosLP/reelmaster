import { test } from "node:test";
import assert from "node:assert/strict";
import { interpolate } from "remotion";
// Frozen legacy transition predicate, retained after the migration as evidence.
test("C1: legacy schema admits exactly 32 failing interpolation ranges", () => {
  const failures: unknown[] = [];
  for (let durationFrames = 30; durationFrames <= 63; durationFrames++)
    for (let frames = 1; frames <= 30; frames++) {
      if (frames * 2 <= durationFrames) {
        try {
          interpolate(
            1,
            [0, frames, durationFrames - frames - 1, durationFrames - 1],
            [0, 1, 1, 0],
          );
        } catch {
          failures.push([durationFrames, frames]);
        }
      }
    }
  assert.deepEqual(
    failures,
    Array.from({ length: 32 }, (_, i) => [30 + i, 15 + Math.floor(i / 2)]),
  );
});
