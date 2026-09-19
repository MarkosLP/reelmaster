import { z } from "zod";
export const PresenterProfileSchema = z
  .object({
    id: z.string().min(1).max(100),
    displayName: z.string().min(1).max(100),
    defaultVoiceProfileId: z.string().min(1).max(100),
  })
  .strict();
export const marcosPresenter = PresenterProfileSchema.parse({
  id: "presenter-marcos",
  displayName: "Marcos",
  defaultVoiceProfileId: "voice-marcos",
});
export type PresenterProfile = z.infer<typeof PresenterProfileSchema>;
