import { z } from "zod";
import type { CompositionSnapshot } from "./types";
import { contentHash } from "./hash";

export const PresentationSchema = z
  .object({
    version: z.literal(1),
    sourceSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    scenes: z
      .array(
        z
          .object({
            sceneId: z.string().min(1),
            graphic: z
              .object({
                version: z.literal(1),
                layout: z.enum([
                  "time-hook",
                  "question-answer",
                  "organize",
                  "data-report",
                  "recap",
                ]),
                title: z.string().trim().min(1).max(60),
                ordinal: z.number().int().min(1).max(8).optional(),
                count: z.number().int().min(2).max(3),
              })
              .strict()
              .superRefine((graphic, ctx) => {
                const lines = graphic.title.split("\n");
                const twoLines = ["time-hook", "recap"].includes(
                  graphic.layout,
                );
                const limits =
                  graphic.layout === "time-hook" ? [10, 24] : [12, 12];
                if (
                  twoLines
                    ? lines.length !== 2 ||
                      lines.some(
                        (line, i) => !line.length || line.length > limits[i],
                      )
                    : lines.length !== 1 || graphic.title.length > 32
                ) {
                  ctx.addIssue({
                    code: "custom",
                    message: "Title exceeds the readable motion layout",
                  });
                }
                if (graphic.ordinal && graphic.ordinal > graphic.count)
                  ctx.addIssue({
                    code: "custom",
                    message: "Ordinal exceeds count",
                  });
              }),
          })
          .strict(),
      )
      .min(1)
      .max(8),
  })
  .strict();

/** A presentation variant references a sealed snapshot, without resealing production. */
export function applyPresentation(
  source: CompositionSnapshot,
  raw: unknown,
): CompositionSnapshot {
  const presentation = PresentationSchema.parse(raw);
  if (source.profile.width !== 1080 || source.profile.height !== 1920)
    throw Error("Motion presentation requires the vertical 1080x1920 profile");
  if (presentation.sourceSnapshotHash !== contentHash(source))
    throw Error("Stale presentation source");
  const bindings = new Map(
    presentation.scenes.map((s) => [s.sceneId, s.graphic]),
  );
  if (
    bindings.size !== presentation.scenes.length ||
    bindings.size !== source.scenes.length ||
    source.scenes.some((s) => !bindings.has(s.id))
  )
    throw Error("Presentation must bind every source scene exactly once");
  const variant = structuredClone(source);
  for (const scene of variant.scenes)
    scene.presentation = bindings.get(scene.id)!;
  return variant;
}
