import { Composition, registerRoot } from "remotion";
import { PresenterReel } from "./PresenterReel";
import type { PresenterEditPlan } from "../snapshot/presenter";
const empty: PresenterEditPlan = {
  version: 1,
  sourceHash: "",
  rawTranscriptHash: "",
  reviewedTranscriptHash: "",
  fps: 30,
  durationFrames: 30,
  segments: [],
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
      defaultProps={{ plan: empty, videoUrl: "" }}
      calculateMetadata={({ props }) => ({
        durationInFrames: props.plan.durationFrames,
      })}
    />
  );
}
registerRoot(Root);
