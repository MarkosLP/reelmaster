import { readFileSync, existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { VisualResolutionError } from "../../domain/visual-plan";

export function localBaseUrl(value: string) {
  const u = new URL(value);
  // Check the original authority too: URL normalization accepts exotic numeric IPs.
  if (
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?\/?$/.test(value) ||
    u.username ||
    u.password ||
    u.search ||
    u.hash
  )
    throw new VisualResolutionError(
      "INVALID_SPEC",
      "Image backend requires plain HTTP on localhost or 127.0.0.1; no credentials, paths or redirects",
    );
  u.hostname = "127.0.0.1"; // No DNS resolution, even for localhost.
  return u.origin;
}
export const ComfyConfigSchema = z
  .object({
    baseUrl: z.string().transform(localBaseUrl),
    checkpoint: z.literal("sdxl_lightning_2step.safetensors"),
    checkpointPath: z.string().refine(isAbsolute),
    checkpointHash: z.string().regex(/^[a-f0-9]{64}$/),
    runtimeVersion: z.literal("0.3.76"),
    runtimeCommit: z.string().regex(/^[a-f0-9]{40}$/),
    startupTimeoutMs: z.number().int().min(100).max(300000),
    generationTimeoutMs: z.number().int().min(100).max(600000),
    pollMs: z.number().int().min(10).max(5000),
    width: z.literal(512),
    height: z.literal(768),
    steps: z.literal(2),
    cfg: z.literal(1),
    sampler: z.literal("euler"),
    scheduler: z.literal("sgm_uniform"),
    batch: z.literal(1),
    startup: z
      .object({
        executable: z.string().refine(isAbsolute),
        args: z.array(z.string()).max(20),
        cwd: z.string().refine(isAbsolute),
      })
      .strict()
      .optional(),
  })
  .strict();
export type ComfyConfig = z.infer<typeof ComfyConfigSchema>;
export function readComfyConfig(
  path = process.env.REELMASTER_COMFY_CONFIG,
): ComfyConfig | undefined {
  if (!path) return undefined;
  const config = ComfyConfigSchema.parse(
    JSON.parse(readFileSync(resolve(path), "utf8")),
  );
  if (!existsSync(config.checkpointPath))
    throw new VisualResolutionError(
      "MODEL_MISSING",
      "Configured checkpoint is missing; no downloads allowed",
    );
  if (
    config.startup &&
    (!existsSync(config.startup.executable) || !existsSync(config.startup.cwd))
  )
    throw new VisualResolutionError(
      "UNAVAILABLE",
      "Configured local installation is missing",
    );
  return config;
}
