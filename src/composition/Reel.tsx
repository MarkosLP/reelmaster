import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import type { CompositionSnapshot } from "../snapshot/types";
import { SceneView } from "./SceneView";
import "./fonts";
export function Reel({
  snapshot,
  mediaBaseUrl,
}: {
  snapshot: CompositionSnapshot;
  mediaBaseUrl?: string;
}) {
  return (
    <AbsoluteFill style={{ background: snapshot.theme.background }}>
      {snapshot.scenes.map((scene) => (
        <Sequence
          key={scene.id}
          from={scene.startFrame}
          durationInFrames={scene.durationFrames}
        >
          <SceneView
            scene={scene}
            theme={snapshot.theme}
            mediaBaseUrl={mediaBaseUrl}
          />
          <Audio
            src={
              mediaBaseUrl
                ? `${mediaBaseUrl}/${scene.audio.src}`
                : staticFile(scene.audio.src)
            }
            volume={scene.audio.volume}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
