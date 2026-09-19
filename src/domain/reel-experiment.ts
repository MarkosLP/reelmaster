import { z } from "zod";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const ratio = z.number().min(0).max(1);

// Huella estructural de un reel entregado. Solo mide lo que se puede contar
// del montaje: nada de juicios sobre si "funciona". Está definida para que un
// reel de presentador y uno tipográfico se puedan comparar entre sí, así que
// todo lo que solo existe en uno de los dos vale 0 en el otro.
export const ReelFingerprintSchema = z
  .object({
    template: z.enum(["presenter", "typography"]),
    durationSeconds: z.number().positive(),
    firstCutSeconds: z.number().nonnegative(),
    cuts: z.number().int().positive(),
    cutsPerMinute: z.number().nonnegative(),
    captions: z.number().int().nonnegative(),
    wordsPerCaption: z.number().nonnegative(),
    textOnScreenRatio: ratio,
    overlayRatio: ratio,
    punchIns: z.number().int().nonnegative(),
    closingStartRatio: ratio,
  })
  .strict();

// Lo que Instagram informa. Nada se calcula ni se estima: o lo has mirado y lo
// has escrito, o el campo no está.
export const ReelMetricsSchema = z
  .object({
    views: z.number().int().nonnegative().optional(),
    likes: z.number().int().nonnegative().optional(),
    saves: z.number().int().nonnegative().optional(),
    shares: z.number().int().nonnegative().optional(),
    comments: z.number().int().nonnegative().optional(),
    follows: z.number().int().nonnegative().optional(),
    watchThroughRatio: ratio.optional(),
  })
  .strict()
  .refine((m) => Object.keys(m).length > 0, {
    message: "Una medición vacía no es una medición",
  });

export const ReelExperimentSchema = z
  .object({
    version: z.literal(1),
    reelId: z.string().min(1).max(200),
    videoHash: hash,
    fingerprint: ReelFingerprintSchema,
    // Sin fecha de publicación no hay experimento: es un reel guardado.
    publishedAt: z.iso.datetime().nullable(),
    platform: z.literal("instagram"),
    metrics: ReelMetricsSchema.nullable(),
    measuredAt: z.iso.datetime().nullable(),
    notes: z.string().trim().max(1000).default(""),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (e.metrics && !e.publishedAt)
      ctx.addIssue({
        code: "custom",
        message:
          "No se pueden registrar números de algo que no se ha publicado",
      });
    if (Boolean(e.metrics) !== Boolean(e.measuredAt))
      ctx.addIssue({
        code: "custom",
        message: "Toda medición lleva la fecha en que se miró, y al revés",
      });
    if (e.publishedAt && e.measuredAt && e.measuredAt < e.publishedAt)
      ctx.addIssue({
        code: "custom",
        message: "No se puede medir antes de publicar",
      });
  });

export type ReelFingerprint = z.infer<typeof ReelFingerprintSchema>;
export type ReelExperiment = z.infer<typeof ReelExperimentSchema>;
export type ReelMetrics = z.infer<typeof ReelMetricsSchema>;
