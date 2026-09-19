export type MotionGraphic = {
  version: 1;
  layout:
    "time-hook" | "question-answer" | "organize" | "data-report" | "recap";
  title: string;
  ordinal?: number;
  count: number;
};

/** Duration-relative, deterministic motion; never changes the scene clock. */
export function motionProgress(
  frame: number,
  duration: number,
  start: number,
  end: number,
) {
  const p = Math.max(
    0,
    Math.min(1, (frame / Math.max(1, duration - 1) - start) / (end - start)),
  );
  return p * p * (3 - 2 * p);
}
