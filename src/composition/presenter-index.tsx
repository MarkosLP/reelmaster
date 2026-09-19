import { Composition, registerRoot } from "remotion";
import { PresenterReel } from "./PresenterReel";
import type { PresenterEditPlan } from "../snapshot/presenter";
const blank = "0".repeat(64);
const placeholder: PresenterEditPlan = {
  version: 1,
  sourceHash: blank,
  rawTranscriptHash: blank,
  reviewedTranscriptHash: blank,
  fps: 30,
  durationFrames: 30,
  segments: [
    {
      sourceStartFrame: 0,
      sourceEndFrame: 30,
      outputStartFrame: 0,
      scale: 1,
      reason: "studio placeholder",
    },
  ],
  captions: [],
  overlays: [],
};
function Root() {
  return (
    <Composition
      id="PresenterReel"
      component={PresenterReel}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={30}
      defaultProps={{ plan: placeholder, videoUrl: "" }}
      calculateMetadata={({ props }) => ({
        durationInFrames: props.plan.durationFrames,
      })}
    />
  );
}
registerRoot(Root);
