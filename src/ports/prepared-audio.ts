import type { TimeRange } from "./alignment";
export type PreparedAudioSegment = {
  artifactId: string;
  path: string;
  inputHash: string;
  contentHash: string;
  measuredDurationMs: number;
  durationSamples: number;
  sampleRate: number;
  speechRegions: TimeRange[];
};
