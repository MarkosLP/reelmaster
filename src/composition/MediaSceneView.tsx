import { AbsoluteFill, Img, OffthreadVideo, useCurrentFrame } from "remotion";
import type { SnapshotScene, CompositionSnapshot } from "../snapshot/types";
import { opacityAt, lineAt } from "./timing";
export function MediaSceneView({
  scene,
  theme,
  mediaBaseUrl,
}: {
  scene: SnapshotScene;
  theme: CompositionSnapshot["theme"];
  mediaBaseUrl?: string;
}) {
  const frame = useCurrentFrame(),
    visual = scene.visual;
  if (visual.kind === "typography") return null;
  if (!mediaBaseUrl)
    throw new Error("Resolved visuals require private media transport");
  const src = `${mediaBaseUrl}/${visual.src}`;
  const style = {
    width: "100%",
    height: "100%",
    objectFit: visual.fit,
    objectPosition: `${visual.focalPointX * 100}% ${visual.focalPointY * 100}%`,
  } as const;
  return (
    <AbsoluteFill
      style={{
        background: theme.background,
        color: theme.foreground,
        fontFamily: "ReelSans, Arial, sans-serif",
        opacity: opacityAt(frame, scene.durationFrames, scene.fadeFrames),
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          top: 140,
          fontSize: 58,
          fontWeight: 700,
          lineHeight: 1.15,
        }}
      >
        {scene.headline}
      </div>
      <div
        style={{
          position: "absolute",
          left: visual.box.x,
          top: visual.box.y,
          width: visual.box.width,
          height: visual.box.height,
          overflow: "hidden",
          background: "#000000",
          borderRadius: 18,
        }}
      >
        {visual.kind === "image" ? (
          <Img src={src} style={style} />
        ) : (
          <OffthreadVideo
            src={src}
            trimBefore={visual.startOffsetFrames}
            muted={visual.muted}
            style={style}
          />
        )}
      </div>
      <div
        style={{
          position: "absolute",
          left: 90,
          right: 90,
          bottom: 280,
          padding: 24,
          background: "#101116",
          borderRadius: 16,
          textAlign: "center",
          fontSize: theme.captionStyle.fontSize,
          fontWeight: 700,
          lineHeight: 1.4,
        }}
      >
        {lineAt(scene.lines, frame)
          ?.tokens.map((t) => t.text)
          .join(" ")}
      </div>
    </AbsoluteFill>
  );
}
