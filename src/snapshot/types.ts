import type { z } from "zod";
import type { ThemeSchema } from "../domain/reel";
import type { MotionGraphic } from "./motion";
export type RenderProfile = {
  id: string;
  width: number;
  height: number;
  fps: number;
};
export type SnapshotToken = {
  id: string;
  text: string;
  startFrame: number;
  endFrame: number;
};
export type SnapshotLine = {
  id: string;
  startFrame: number;
  endFrame: number;
  tokens: SnapshotToken[];
};
export type SnapshotScene = {
  presentation?: MotionGraphic;
  id: string;
  startFrame: number;
  durationFrames: number;
  fadeFrames: number;
  headline: string;
  label: string;
  accent: string;
  visual:
    | { kind: "typography"; motif: "orbit" | "cards" | "signal" }
    | {
        kind: "image" | "video";
        src: string;
        fit: "cover" | "contain";
        focalPointX: number;
        focalPointY: number;
        startOffsetFrames: number;
        muted: true;
        box: { x: number; y: number; width: number; height: number };
      };
  audio: { src: string; volume: number };
  lines: SnapshotLine[];
};
export type CompositionSnapshot = {
  version: 1;
  templateVersion: "typography-v2" | "local-media-v1";
  profile: RenderProfile;
  durationInFrames: number;
  theme: z.infer<typeof ThemeSchema>;
  scenes: SnapshotScene[];
};
