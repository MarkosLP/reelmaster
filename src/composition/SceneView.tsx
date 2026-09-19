import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { SnapshotScene, CompositionSnapshot } from "../snapshot/types";
import { opacityAt, lineAt } from "./timing";
import { MediaSceneView } from "./MediaSceneView";
import { MotionSceneView } from "./MotionSceneView";

export function SceneView({
  scene,
  theme,
  mediaBaseUrl,
}: {
  scene: SnapshotScene;
  theme: CompositionSnapshot["theme"];
  mediaBaseUrl?: string;
}) {
  const frame = useCurrentFrame();
  if (scene.presentation)
    return (
      <MotionSceneView
        scene={scene}
        graphic={scene.presentation}
        theme={theme}
      />
    );
  if (scene.visual.kind !== "typography")
    return (
      <MediaSceneView scene={scene} theme={theme} mediaBaseUrl={mediaBaseUrl} />
    );
  const motif = scene.visual.motif;
  const opacity = opacityAt(frame, scene.durationFrames, scene.fadeFrames);
  const y = interpolate(frame, [0, 22], [65, 0], { extrapolateRight: "clamp" });
  const group = lineAt(scene.lines, frame)?.tokens ?? [];
  const captionStyle = theme.captionStyle;
  return (
    <AbsoluteFill
      style={{
        opacity,
        padding: "130px 90px",
        color: theme.foreground,
        fontFamily: "ReelSans, Arial, sans-serif",
        background: `radial-gradient(ellipse at 100% 40%, #252735, ${theme.background} 70%)`,
      }}
    >
      <div style={{ fontSize: 26, letterSpacing: 7, color: scene.accent }}>
        REELMASTER <span style={{ color: "#777987" }}> / LAB</span>
      </div>
      <div
        style={{
          marginTop: 165,
          fontSize: 25,
          letterSpacing: 5,
          color: scene.accent,
        }}
      >
        {scene.label}
      </div>
      <div
        style={{
          marginTop: 40,
          fontSize: 100,
          fontWeight: 700,
          lineHeight: 1.06,
          letterSpacing: -5,
          whiteSpace: "pre-line",
          transform: `translateY(${y}px)`,
        }}
      >
        {scene.headline}
      </div>
      <div
        style={{
          position: "absolute",
          top: 870,
          left: 140,
          width: 800,
          height: 430,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              width: motif === "cards" ? 500 : 260 + i * 130,
              height: motif === "cards" ? 220 : 260 + i * 130,
              border: `${i === 0 ? 4 : 2}px solid ${scene.accent}`,
              borderRadius: motif === "cards" ? 30 : "50%",
              opacity: 1 - i * 0.25,
              transform: `rotate(${frame * 0.22 + i * 24}deg) scale(${1 + Math.sin(frame / 25 + i) * 0.035})`,
            }}
          />
        ))}
        <div style={{ fontSize: 92, color: scene.accent, fontWeight: 700 }}>
          IA
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 330,
          left: 90,
          right: 90,
          textAlign: "center",
          fontSize: captionStyle.fontSize,
          fontWeight: 700,
          lineHeight: 1.6,
        }}
      >
        {group.map((w) => (
          <span
            key={w.id}
            style={{
              padding: "8px 12px",
              borderRadius: 12,
              background:
                captionStyle.highlightActive !== false &&
                frame >= w.startFrame &&
                frame < w.endFrame
                  ? captionStyle.activeBackground
                  : "transparent",
              color:
                captionStyle.highlightActive !== false &&
                frame >= w.startFrame &&
                frame < w.endFrame
                  ? captionStyle.activeTextColor
                  : captionStyle.textColor,
            }}
          >
            {w.text}{" "}
          </span>
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 210,
          left: 90,
          right: 90,
          height: 3,
          background: "#363840",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${(100 * frame) / (scene.durationFrames - 1)}%`,
            background: scene.accent,
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 155,
          fontSize: 20,
          letterSpacing: 4,
          color: "#858792",
        }}
      >
        IDEAS EN MOVIMIENTO
      </div>
    </AbsoluteFill>
  );
}
