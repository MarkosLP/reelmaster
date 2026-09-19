import { interpolate } from "remotion";
import type { SnapshotLine } from "../snapshot/types";
export const opacityAt = (frame: number, duration: number, fade: number) =>
  fade === 0
    ? 1
    : interpolate(
        frame,
        [0, fade, duration - fade - 1, duration - 1],
        [0, 1, 1, 0],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );
export const lineAt = (lines: SnapshotLine[], frame: number) =>
  lines.find((l) => frame >= l.startFrame && frame < l.endFrame);
