import type {
  VisualDirection,
  VisualDirectorInput,
} from "../../domain/visual-direction";
export type VisualDirectorResult = {
  direction: VisualDirection;
  directorVersion: "visual-director-v1";
  source: "localDirector" | "deterministicFallback";
  attempts: number;
  elapsedMs: number;
  issues: string[];
  provider?: { model: string; modelDigest: string; runtimeVersion: string };
};
export interface VisualDirector {
  direct(
    input: VisualDirectorInput,
    signal?: AbortSignal,
  ): Promise<VisualDirectorResult>;
}
// Independent from text generation and image generation ports.
export interface VisualDirectionProvider {
  propose(
    input: VisualDirectorInput,
    repair: string | undefined,
    signal: AbortSignal,
  ): Promise<unknown>;
  identity(): { model: string; modelDigest: string; runtimeVersion: string };
}
