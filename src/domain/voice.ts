import { z } from "zod";
export const VoiceProfileSchema = z
  .object({
    id: z.string().min(1).max(100),
    displayName: z.string().min(1).max(100),
    locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/),
    source: z.enum(["recorded-reference", "synthesized"]),
    providerBinding: z
      .object({
        providerKey: z.string().min(1),
        externalVoiceId: z.string().min(1),
      })
      .strict()
      .optional(),
  })
  .strict();
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;
export const marcosVoice = VoiceProfileSchema.parse({
  id: "voice-marcos",
  displayName: "Marcos",
  locale: "es-ES",
  source: "recorded-reference",
});
