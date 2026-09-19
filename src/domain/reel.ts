import { z } from "zod";
import { VoiceProfileSchema } from "./voice";
import { ResolvedMediaVisualSchema } from "./visual-asset";
const ms = z.number().int().min(0).max(60000);
const id = z.string().min(1).max(100);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
export const AudioSchema = z
  .object({
    artifactId: id,
    voiceProfileId: id.optional(),
    inputHash: hash,
    contentHash: hash,
    measuredDurationMs: ms.refine((n) => n > 0),
    precision: z
      .object({
        durationSamples: z.number().int().positive().max(576000000),
        sampleRate: z.number().int().min(8000).max(192000),
      })
      .strict()
      .optional(),
    mimeType: z.enum(["audio/wav", "audio/mpeg"]),
    volume: z.number().min(0).max(1),
  })
  .strict()
  .superRefine((a, c) => {
    if (
      a.precision &&
      Math.round(
        (a.precision.durationSamples * 1000) / a.precision.sampleRate,
      ) !== a.measuredDurationMs
    )
      c.addIssue({
        code: "custom",
        message: "Audio samples disagree with measured milliseconds",
      });
  });
export const TokenSchema = z
  .object({
    id,
    text: z.string().min(1).max(80),
    startMs: ms,
    endMs: ms,
    charStart: z.number().int().nonnegative(),
    charEnd: z.number().int().positive(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .strict()
  .refine(
    (t) => t.endMs > t.startMs && t.charEnd > t.charStart,
    "Empty token range",
  );
export const LineSchema = z
  .object({ id, tokenIds: z.array(id).min(1).max(30), startMs: ms, endMs: ms })
  .strict()
  .refine((l) => l.endMs > l.startMs, "Empty line");
export const ThemeSchema = z
  .object({
    background: color,
    foreground: color,
    captionStyle: z
      .object({
        fontSize: z.number().int().min(24).max(72),
        textColor: color,
        activeTextColor: color,
        activeBackground: color,
        highlightActive: z.boolean().optional(),
      })
      .strict(),
  })
  .strict();
export function sceneDurationMs(s: {
  audio: { measuredDurationMs: number };
  paddingAfterMs: number;
}) {
  return s.audio.measuredDurationMs + s.paddingAfterMs;
}
export const SceneSchema = z
  .object({
    id,
    revision: z.number().int().positive(),
    targetDurationMs: ms.refine((n) => n >= 1000),
    narration: z.string().min(1).max(2000),
    headline: z.string().min(1).max(120),
    label: z.string().max(40),
    accent: color,
    visual: z.union([
      z
        .object({
          kind: z.literal("typography"),
          motif: z.enum(["orbit", "cards", "signal"]),
        })
        .strict(),
      ResolvedMediaVisualSchema,
    ]),
    audio: AudioSchema,
    paddingAfterMs: ms,
    transition: z
      .object({
        kind: z.literal("fade-through-background"),
        durationMs: ms.refine((n) => n <= 1000),
      })
      .strict(),
    captions: z
      .object({
        audioContentHash: hash,
        source: z.enum([
          "simulated",
          "provider",
          "forced-alignment",
          "estimated",
        ]),
        tokens: z.array(TokenSchema).max(300),
        lines: z.array(LineSchema).max(100),
      })
      .strict(),
  })
  .strict()
  .superRefine((s, c) => {
    const issue = (message: string) => c.addIssue({ code: "custom", message });
    if (sceneDurationMs(s) < 1000 || sceneDurationMs(s) > 60000)
      issue("Scene duration outside 1–60s");
    if (s.transition.durationMs * 2 > sceneDurationMs(s))
      issue("Transition exceeds scene");
    if (s.captions.audioContentHash !== s.audio.contentHash)
      issue("Stale captions for audio");
    const tokens = s.captions.tokens;
    const byId = new Map(tokens.map((t) => [t.id, t]));
    if (byId.size !== tokens.length) issue("Duplicate token IDs");
    tokens.forEach((t, i) => {
      if (
        t.endMs > s.audio.measuredDurationMs ||
        s.narration.slice(t.charStart, t.charEnd) !== t.text ||
        (i > 0 &&
          (t.startMs < tokens[i - 1].endMs ||
            t.charStart < tokens[i - 1].charEnd))
      )
        issue("Invalid token timing or transcript offsets");
    });
    const seen = new Set<string>();
    const lineIds = new Set<string>();
    s.captions.lines.forEach((l, i) => {
      if (
        lineIds.has(l.id) ||
        l.endMs > sceneDurationMs(s) ||
        (i > 0 && l.startMs < s.captions.lines[i - 1].endMs)
      )
        issue("Invalid line range or ID");
      lineIds.add(l.id);
      let end = 0;
      l.tokenIds.forEach((tid) => {
        const t = byId.get(tid);
        if (
          !t ||
          seen.has(tid) ||
          t.startMs < l.startMs ||
          t.endMs > l.endMs ||
          t.startMs < end
        )
          issue("Invalid line token reference/order");
        if (t) end = t.endMs;
        seen.add(tid);
      });
    });
    if (seen.size !== tokens.length)
      issue("Every token must belong to one line");
  });
export const ReelSchema = z
  .object({
    schemaVersion: z.literal(2),
    id,
    revision: z.number().int().positive(),
    renderProfileId: z.enum(["instagram-reel-v1"]),
    defaultVoiceProfileId: id.optional(),
    voiceProfiles: z.array(VoiceProfileSchema).min(1).max(20).optional(),
    theme: ThemeSchema,
    scenes: z.array(SceneSchema).min(1).max(20),
  })
  .strict()
  .superRefine((r, c) => {
    const voices = new Set(r.voiceProfiles?.map((v) => v.id));
    if (
      (r.voiceProfiles && voices.size !== r.voiceProfiles.length) ||
      (r.defaultVoiceProfileId && !voices.has(r.defaultVoiceProfileId)) ||
      r.scenes.some(
        (s) => s.audio.voiceProfileId && !voices.has(s.audio.voiceProfileId),
      )
    )
      c.addIssue({
        code: "custom",
        message: "Missing or duplicate voice profile",
      });
    if (new Set(r.scenes.map((s) => s.id)).size !== r.scenes.length)
      c.addIssue({ code: "custom", message: "Duplicate scene IDs" });
    if (r.scenes.reduce((n, s) => n + sceneDurationMs(s), 0) > 60000)
      c.addIssue({ code: "custom", message: "Reel exceeds 60 seconds" });
  });
export type DomainReel = z.infer<typeof ReelSchema>;
export type Scene = z.infer<typeof SceneSchema>;
