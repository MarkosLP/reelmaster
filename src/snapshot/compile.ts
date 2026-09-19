import { ReelSchema, sceneDurationMs } from "../domain/reel";
import type { CompositionSnapshot, RenderProfile } from "./types";
export const profiles: Record<"instagram-reel-v1", RenderProfile> = {
  "instagram-reel-v1": {
    id: "instagram-reel-v1",
    width: 1080,
    height: 1920,
    fps: 30,
  },
};
export type AssetManifest = Record<
  string,
  { path: string; contentHash: string }
>;
export function msToFrames(ms: number, fps: number) {
  if (!Number.isSafeInteger(ms) || ms < 0 || !Number.isInteger(fps) || fps <= 0)
    throw new Error("Invalid time or FPS");
  return Math.round((ms * fps) / 1000);
}
export function compileCompositionSnapshot(
  input: unknown,
  assets: AssetManifest,
): CompositionSnapshot {
  const reel = ReelSchema.parse(input);
  const profile = { ...profiles[reel.renderProfileId] };
  let elapsedMs = 0;
  const scenes = reel.scenes.map((s) => {
    const asset = assets[s.audio.artifactId];
    if (
      !asset ||
      asset.contentHash !== s.audio.contentHash ||
      !/^audio\/[a-zA-Z0-9_-]+\.wav$/.test(asset.path)
    )
      throw new Error("Missing, stale or unsafe audio asset");
    const startFrame = msToFrames(elapsedMs, profile.fps);
    const endFrame = msToFrames(elapsedMs + sceneDurationMs(s), profile.fps);
    const durationFrames = endFrame - startFrame;
    let visual: CompositionSnapshot["scenes"][number]["visual"];
    if (s.visual.kind === "typography") visual = { ...s.visual };
    else {
      const media = assets[s.visual.artifactId];
      const extension = s.visual.kind === "image" ? "png" : "mp4";
      if (
        !media ||
        media.contentHash !== s.visual.contentHash ||
        media.path !== `visual-assets/${s.visual.contentHash}.${extension}`
      )
        throw new Error("Missing, stale or unsafe visual asset");
      const startOffsetFrames = msToFrames(s.visual.startOffsetMs, profile.fps);
      if (
        s.visual.kind === "video" &&
        startOffsetFrames + durationFrames >
          Math.floor((s.visual.durationMs * profile.fps) / 1000)
      )
        throw new Error("Visual clip is too short");
      visual = {
        kind: s.visual.kind,
        src: media.path,
        fit: s.visual.fit,
        focalPointX: s.visual.focalPointX,
        focalPointY: s.visual.focalPointY,
        startOffsetFrames,
        muted: true,
        box: { ...s.visual.box },
      };
    }
    const local = (ms: number) =>
      msToFrames(elapsedMs + ms, profile.fps) - startFrame;
    const lines = s.captions.lines
      .map((l) => ({
        id: l.id,
        startFrame: local(l.startMs),
        endFrame: local(l.endMs),
        tokens: l.tokenIds.map((id) => {
          const t = s.captions.tokens.find((t) => t.id === id)!;
          return {
            id: t.id,
            text: t.text,
            startFrame: local(t.startMs),
            endFrame: local(t.endMs),
          };
        }),
      }))
      .filter((l) => l.endFrame > l.startFrame);
    const fadeFrames = Math.min(
      msToFrames(s.transition.durationMs, profile.fps),
      Math.floor((durationFrames - 2) / 2),
    );
    elapsedMs += sceneDurationMs(s);
    return {
      id: s.id,
      startFrame,
      durationFrames,
      fadeFrames,
      headline: s.headline,
      label: s.label,
      accent: s.accent,
      visual,
      audio: { src: asset.path, volume: s.audio.volume },
      lines,
    };
  });
  return {
    version: 1,
    templateVersion: reel.scenes.some((s) => s.visual.kind !== "typography")
      ? "local-media-v1"
      : "typography-v2",
    profile,
    durationInFrames: msToFrames(elapsedMs, profile.fps),
    theme: reel.theme,
    scenes,
  };
}
