import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import { probe } from "../audio/ffmpeg";
import { fileHash } from "../audio/inspect";
import { contentHash } from "../../snapshot/hash";
import {
  PresenterEditPlanSchema,
  type PresenterEditPlan,
} from "../../domain/presenter-edit";
import {
  PresenterEditReviewSchema,
  type PresenterEditReview,
} from "../../domain/presenter-edit-review";

export type Reel = {
  id: string;
  phase: string;
  videoPath: string;
  bytes: number;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  videoHash: string;
  plan: PresenterEditPlan | null;
  planPath: string | null;
  planHash: string | null;
  review: PresenterEditReview | null;
};

export type Production = { title: string; state: string };

// Una entrega es un MP4 bajo out/<fase>/. Si existe .local/<fase>/edit-plan.json
// el montaje es revisable; si no, se puede ver pero no juzgar por cortes.
export async function discoverReels(workspace: string): Promise<Reel[]> {
  const out = resolve(workspace, "out");
  const reels: Reel[] = [];
  for (const phase of (await readdir(out).catch(() => [])).sort().reverse()) {
    const directory = join(out, phase);
    if (!(await stat(directory).catch(() => null))?.isDirectory()) continue;
    for (const file of await readdir(directory).catch(() => [])) {
      if (!file.endsWith(".mp4")) continue;
      const videoPath = join(directory, file);
      const info = await stat(videoPath);
      let durationSeconds: number | null = null,
        width: number | null = null,
        height: number | null = null;
      const media = await probe(videoPath).catch(() => null);
      const stream = media?.streams.find((s) => s.codec_type === "video");
      if (stream) {
        width = stream.width ?? null;
        height = stream.height ?? null;
        durationSeconds = Number(media?.format.duration) || null;
      }
      let plan: PresenterEditPlan | null = null,
        planPath: string | null = null,
        planHash: string | null = null,
        review: PresenterEditReview | null = null;
      const candidate = resolve(workspace, ".local", phase, "edit-plan.json");
      const raw = await readFile(candidate, "utf8").catch(() => null);
      if (raw) {
        const parsed = PresenterEditPlanSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          plan = parsed.data;
          planPath = candidate;
          planHash = contentHash(parsed.data);
          const stored = await readFile(
            resolve(workspace, ".local/reviews", `${planHash}.json`),
            "utf8",
          ).catch(() => null);
          if (stored) {
            const verdict = PresenterEditReviewSchema.safeParse(
              JSON.parse(stored),
            );
            if (verdict.success) review = verdict.data;
          }
        }
      }
      reels.push({
        id: `${phase}/${basename(file, ".mp4")}`,
        phase,
        videoPath,
        bytes: info.size,
        durationSeconds,
        width,
        height,
        videoHash: await fileHash(videoPath),
        plan,
        planPath,
        planHash,
        review,
      });
    }
  }
  return reels;
}

// Solo lo real: las producciones de test no llegan a estos estados ni pierden
// el plan. Lo que se lista aquí es trabajo, no residuo.
export async function discoverProductions(
  workspace: string,
): Promise<Production[]> {
  const root = resolve(workspace, ".local/productions");
  const seen = new Map<string, string>();
  for (const name of await readdir(root).catch(() => [])) {
    const raw = await readFile(
      join(root, name, "production-plan.json"),
      "utf8",
    ).catch(() => null);
    if (!raw) continue;
    try {
      const plan = JSON.parse(raw) as {
        state: { kind: string };
        draft: { title: string };
      };
      if (plan.state.kind === "rendered" || plan.state.kind === "prepared")
        seen.set(`${plan.draft.title}|${plan.state.kind}`, plan.state.kind);
    } catch {
      continue;
    }
  }
  return [...seen.keys()]
    .map((key) => {
      const [title, state] = key.split("|");
      return { title, state };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}
