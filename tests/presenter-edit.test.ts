import test from "node:test";
import assert from "node:assert/strict";
import {
  PresenterEditPlanSchema,
  sourceToOutputFrame,
} from "../src/domain/presenter-edit";
const fixture = () => ({
  version: 1,
  sourceHash: "a".repeat(64),
  rawTranscriptHash: "b".repeat(64),
  reviewedTranscriptHash: "c".repeat(64),
  fps: 30,
  durationFrames: 60,
  segments: [
    {
      sourceStartFrame: 30,
      sourceEndFrame: 60,
      outputStartFrame: 0,
      scale: 1,
      reason: "trim",
    },
    {
      sourceStartFrame: 90,
      sourceEndFrame: 120,
      outputStartFrame: 30,
      scale: 1.03,
      reason: "cut",
    },
  ],
  captions: [],
  overlays: [],
});
test("Presenter cuts map retained source frames and exclude removed audio/video together", () => {
  const plan = PresenterEditPlanSchema.parse(fixture());
  assert.equal(sourceToOutputFrame(plan, 30), 0);
  assert.equal(sourceToOutputFrame(plan, 90), 30);
  assert.equal(sourceToOutputFrame(plan, 75), null);
  assert.equal(sourceToOutputFrame(plan, 120), null);
});
test("Presenter plan rejects gaps, reordered cuts, mismatched duration and out-of-range captions", () => {
  const gap = fixture();
  gap.segments[1].outputStartFrame = 31;
  assert.throws(() => PresenterEditPlanSchema.parse(gap));
  const reversed = fixture();
  reversed.segments[1].sourceStartFrame = 29;
  assert.throws(() => PresenterEditPlanSchema.parse(reversed));
  assert.throws(() =>
    PresenterEditPlanSchema.parse({ ...fixture(), durationFrames: 61 }),
  );
  assert.throws(() =>
    PresenterEditPlanSchema.parse({
      ...fixture(),
      captions: [
        {
          startFrame: 59,
          endFrame: 62,
          text: "test",
          reviewedWordIds: [0],
          timingSource: "MODEL_ESTIMATED_HUMAN_TEXT",
        },
      ],
    }),
  );
});
