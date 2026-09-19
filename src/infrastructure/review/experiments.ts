import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { privateRoot, atomicJson } from "../production/local-files";
import {
  ReelExperimentSchema,
  type ReelExperiment,
  type ReelFingerprint,
} from "../../domain/reel-experiment";

// El registro vive en .local/experiments/, un archivo por reel, nombrado por
// el hash del vídeo: un experimento no se puede despegar de lo que se publicó.
export async function experimentsRoot(workspace: string) {
  return privateRoot(workspace, "experiments");
}

export async function readExperiments(
  workspace: string,
): Promise<Map<string, ReelExperiment>> {
  const root = await experimentsRoot(workspace);
  const found = new Map<string, ReelExperiment>();
  for (const name of await readdir(root).catch(() => [])) {
    if (!name.endsWith(".json")) continue;
    const raw = await readFile(resolve(root, name), "utf8").catch(() => null);
    if (!raw) continue;
    try {
      const parsed = ReelExperimentSchema.safeParse(JSON.parse(raw));
      if (parsed.success) found.set(parsed.data.videoHash, parsed.data);
    } catch {
      continue;
    }
  }
  return found;
}

export async function saveExperiment(
  workspace: string,
  input: {
    reelId: string;
    videoHash: string;
    fingerprint: ReelFingerprint;
    publishedAt: string | null;
    metrics: unknown;
    notes?: string;
  },
) {
  const measuring = input.metrics !== null && input.metrics !== undefined;
  const experiment = ReelExperimentSchema.parse({
    version: 1,
    reelId: input.reelId,
    videoHash: input.videoHash,
    fingerprint: input.fingerprint,
    publishedAt: input.publishedAt,
    platform: "instagram",
    metrics: measuring ? input.metrics : null,
    // La fecha de medición la pone quien guarda, no quien escribe el número.
    measuredAt: measuring ? new Date().toISOString() : null,
    notes: input.notes ?? "",
  });
  const root = await experimentsRoot(workspace);
  const path = resolve(root, `${experiment.videoHash}.json`);
  await atomicJson(path, experiment);
  return { path, experiment };
}
