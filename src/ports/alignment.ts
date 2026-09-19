import type { z } from "zod";
import type { TokenSchema } from "../domain/reel";
export type TimeRange = { startMs: number; endMs: number };
export type TimedToken = z.infer<typeof TokenSchema>;
export type AlignmentRequest = {
  audio: {
    artifactId: string;
    contentHash: string;
    measuredDurationMs: number;
    speechRegions: TimeRange[];
  };
  transcript: string;
  locale: string;
};
export type AlignmentResult = {
  timingSource: "estimated" | "aligned" | "measured";
  methodVersion: string;
  tokens: TimedToken[];
};
export interface AlignmentProvider {
  align(request: AlignmentRequest): AlignmentResult;
}
