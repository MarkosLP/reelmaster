import type {
  ImageCapability,
  ImageGenerationRequest,
} from "../../domain/image-generation";
export type ImageProviderIdentity = {
  runtimeId: string;
  runtimeVersion: string;
  modelId: string;
  modelHash?: string;
  testOnly: boolean;
  recipe?: {
    workflowVersion: string;
    runtimeCommit: string;
    steps: number;
    cfg: number;
    sampler: string;
    scheduler: string;
  };
};
// No paths, URLs or backend-specific parameters can come from a visual request.
export interface ImageGenerationProvider {
  close?(): Promise<void>;
  timeoutMs?: number;
  capability(): ImageCapability;
  identity(): ImageProviderIdentity;
  generate(
    request: ImageGenerationRequest,
    signal: AbortSignal,
  ): Promise<Uint8Array>;
}
