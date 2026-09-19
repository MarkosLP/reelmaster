export type GenerationParameters = {
  temperature: number;
  maxOutputTokens: number;
  seed?: number;
};
export type TextProviderInfo = {
  provider: string;
  model: string;
  modelDigest: string;
  version: string;
};
export type TextResult = {
  text: string;
  info: TextProviderInfo;
  elapsedMs: number;
  usage?: { inputTokens: number; outputTokens: number };
};
export interface TextProvider {
  readonly info: TextProviderInfo;
  generateStructured(request: {
    system: string;
    user: string;
    schema: Record<string, unknown>;
    parameters: GenerationParameters;
    signal?: AbortSignal;
  }): Promise<TextResult>;
}
export type GenerationErrorCode =
  | "INVALID_INPUT"
  | "INVALID_OUTPUT"
  | "CONFIGURATION"
  | "UNAVAILABLE"
  | "TIMEOUT"
  | "ABORTED"
  | "PROVIDER_ERROR";
export class GenerationError extends Error {
  constructor(
    public readonly code: GenerationErrorCode,
    message: string,
    public readonly attempts = 0,
    public readonly details: readonly string[] = [],
  ) {
    super(message);
    this.name = "GenerationError";
  }
}
