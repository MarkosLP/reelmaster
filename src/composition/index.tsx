import { Composition, registerRoot } from "remotion";
import prepared from "../fixtures/snapshot.json";
import type { CompositionSnapshot } from "../snapshot/types";
import { Reel } from "./Reel";
const snapshot = prepared as CompositionSnapshot;
function Root() {
  return (
    <Composition
      id="ReelDemo"
      component={Reel}
      width={snapshot.profile.width}
      height={snapshot.profile.height}
      fps={snapshot.profile.fps}
      durationInFrames={snapshot.durationInFrames}
      defaultProps={{ snapshot }}
      calculateMetadata={({ props }) => ({
        width: props.snapshot.profile.width,
        height: props.snapshot.profile.height,
        fps: props.snapshot.profile.fps,
        durationInFrames: props.snapshot.durationInFrames,
      })}
    />
  );
}
registerRoot(Root);
