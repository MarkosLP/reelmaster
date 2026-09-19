import { z } from "zod";
import { ReelDraftSchema, type ReelDraft } from "../domain/reel-draft";
import {
  marcosVoice,
  VoiceProfileSchema,
  type VoiceProfile,
} from "../domain/voice";
import {
  marcosPresenter,
  PresenterProfileSchema,
  type PresenterProfile,
} from "../domain/presenter";
import { contentHash } from "../snapshot/hash";

export const HashSchema = z.string().regex(/^[a-f0-9]{64}$/);
export class ProductionError extends Error {
  constructor(
    public readonly code:
      | "INVALID_PLAN"
      | "INVALID_STATE"
      | "INVALID_AUDIO"
      | "INVALID_REVIEW"
      | "UNSUPPORTED"
      | "ASSETS_PENDING"
      | "UNSAFE_PATH"
      | "STALE_ARTIFACT"
      | "BUSY",
    message: string,
  ) {
    super(message);
    this.name = "ProductionError";
  }
}
export const AssetRequirementSchema = z
  .object({
    sceneId: z.string().regex(/^scene-[1-8]$/),
    type: z.enum(["presenter", "screenCapture", "broll", "image", "none"]),
    status: z.enum(["pending", "notRequired"]),
    description: z.string().min(1).max(300),
    sourcePreference: z.enum(["recorded", "local", "none"]),
  })
  .strict()
  .refine(
    (a) =>
      a.type === "none"
        ? a.status === "notRequired" && a.sourcePreference === "none"
        : a.status === "pending" && a.sourcePreference !== "none",
    "Invalid asset requirement state",
  );
export const NarrationSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("recorded") }).strict(),
  z.object({ kind: z.literal("generated") }).strict(),
]);
const ReceiptSchema = z
  .object({
    recordingHash: HashSchema,
    narrationHash: HashSchema,
    importHash: HashSchema,
  })
  .strict();
export const ProductionStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("draft") }).strict(),
  z.object({ kind: z.literal("waitingForNarration") }).strict(),
  z
    .object({ kind: z.literal("narrationReady"), receipt: ReceiptSchema })
    .strict(),
  z
    .object({
      kind: z.literal("prepared"),
      receipt: ReceiptSchema,
      preparedHash: HashSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("renderable"),
      receipt: ReceiptSchema,
      preparedHash: HashSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("rendered"),
      receipt: ReceiptSchema,
      preparedHash: HashSchema,
      videoHash: HashSchema,
    })
    .strict(),
]);
const requirementTypes = {
  avatarTalking: "presenter",
  screenDemo: "screenCapture",
  broll: "broll",
  image: "image",
  textOnly: "none",
} as const;
export function requirementsFor(draft: ReelDraft) {
  return draft.scenes.map((s) =>
    AssetRequirementSchema.parse({
      sceneId: s.id,
      type: requirementTypes[s.visualIntent.kind],
      status: s.visualIntent.kind === "textOnly" ? "notRequired" : "pending",
      description: s.visualIntent.description,
      sourcePreference:
        s.visualIntent.kind === "textOnly"
          ? "none"
          : ["avatarTalking", "screenDemo"].includes(s.visualIntent.kind)
            ? "recorded"
            : "local",
    }),
  );
}
export function narrationIdentity(draft: ReelDraft) {
  return contentHash({
    locale: draft.locale,
    voiceProfileId: draft.voiceProfileId,
    scenes: draft.scenes.map((s) => ({
      sceneId: s.id,
      order: s.order,
      narration: s.narration,
    })),
  });
}
export const ProductionPlanSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().regex(/^production-[a-f0-9]{64}$/),
    draftContentHash: HashSchema,
    draft: ReelDraftSchema,
    voiceProfile: VoiceProfileSchema,
    presenter: PresenterProfileSchema,
    narrationSource: NarrationSourceSchema,
    narrationHash: HashSchema,
    assetRequirements: z.array(AssetRequirementSchema).min(2).max(8),
    visualManifestHash: HashSchema.optional(),
    state: ProductionStateSchema,
  })
  .strict()
  .superRefine((plan, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (plan.draftContentHash !== contentHash(plan.draft))
      issue("Stale draft content hash");
    if (plan.narrationHash !== narrationIdentity(plan.draft))
      issue("Stale narration hash");
    if (
      plan.voiceProfile.id !== plan.draft.voiceProfileId ||
      plan.voiceProfile.locale !== plan.draft.locale ||
      plan.presenter.defaultVoiceProfileId !== plan.voiceProfile.id
    )
      issue("Incoherent presenter/voice/locale");
    if (plan.id !== productionId(plan)) issue("Stale production identity");
    if (
      contentHash(plan.assetRequirements) !==
      contentHash(requirementsFor(plan.draft))
    )
      issue("Unresolved assets cannot be invented");
    if (
      "receipt" in plan.state &&
      plan.state.receipt.narrationHash !== plan.narrationHash
    )
      issue("Receipt belongs to another narration");
    if (
      ["renderable", "rendered"].includes(plan.state.kind) &&
      plan.assetRequirements.some((a) => a.status === "pending") &&
      !plan.visualManifestHash
    )
      issue("Pending visuals prevent rendering");
  });
export type ProductionPlan = z.infer<typeof ProductionPlanSchema>;
function productionId(plan: {
  draftContentHash: string;
  voiceProfile: VoiceProfile;
  presenter: PresenterProfile;
  narrationSource: z.infer<typeof NarrationSourceSchema>;
}) {
  return `production-${contentHash({ version: 1, draftContentHash: plan.draftContentHash, voiceProfile: plan.voiceProfile, presenter: plan.presenter, narrationSource: plan.narrationSource })}`;
}
export function createProductionPlan(
  raw: unknown,
  identity = { voiceProfile: marcosVoice, presenter: marcosPresenter },
): ProductionPlan {
  const draft = ReelDraftSchema.parse(raw);
  const base = {
    schemaVersion: 1 as const,
    draft,
    draftContentHash: contentHash(draft),
    ...identity,
    narrationSource: { kind: "recorded" as const },
    narrationHash: narrationIdentity(draft),
    assetRequirements: requirementsFor(draft),
    state: { kind: "draft" as const },
  };
  return ProductionPlanSchema.parse({ ...base, id: productionId(base) });
}
export function transitionProduction(
  raw: ProductionPlan,
  state: z.infer<typeof ProductionStateSchema>,
): ProductionPlan {
  const plan = ProductionPlanSchema.parse(raw);
  const next = ProductionStateSchema.parse(state);
  const edges: Record<ProductionPlan["state"]["kind"], string[]> = {
    draft: ["waitingForNarration"],
    waitingForNarration: ["narrationReady"],
    narrationReady: ["prepared"],
    prepared: ["renderable"],
    renderable: ["rendered"],
    rendered: [],
  };
  if (!edges[plan.state.kind].includes(next.kind))
    throw new ProductionError(
      "INVALID_STATE",
      "Invalid production state transition",
    );
  if (
    "receipt" in plan.state &&
    "receipt" in next &&
    contentHash(plan.state.receipt) !== contentHash(next.receipt)
  )
    throw new ProductionError(
      "INVALID_STATE",
      "Narration receipt cannot change",
    );
  if (
    "preparedHash" in plan.state &&
    "preparedHash" in next &&
    plan.state.preparedHash !== next.preparedHash
  )
    throw new ProductionError(
      "INVALID_STATE",
      "Prepared content cannot change",
    );
  return ProductionPlanSchema.parse({ ...plan, state: next });
}
export function createNarrationManifest(raw: ProductionPlan) {
  const plan = ProductionPlanSchema.parse(raw);
  return {
    schemaVersion: 1,
    productionId: plan.id,
    draftContentHash: plan.draftContentHash,
    narrationHash: plan.narrationHash,
    title: plan.draft.title,
    voiceProfileId: plan.voiceProfile.id,
    locale: plan.draft.locale,
    targetDurationMs: plan.draft.targetDurationMs,
    fullScript: plan.draft.fullNarration,
    scenes: plan.draft.scenes.map((s) => ({
      sceneId: s.id,
      order: s.order,
      narration: s.narration,
      estimatedDurationMs: s.estimatedDurationMs,
      visualIntent: s.visualIntent,
    })),
    recordingInstructions:
      "Lee solo las narraciones, en orden y sin cambios. Deja una pausa clara entre escenas. Graba un único archivo en .local/recordings/. Los tiempos son orientativos: no aceleres tu voz. Revisa el contenido y los puntos de corte antes de importar. No grabes los encabezados.",
  };
}
export function narrationText(plan: ProductionPlan) {
  const manifest = createNarrationManifest(plan);
  return `REEL: ${manifest.title}\nVOZ: ${plan.voiceProfile.displayName} (${manifest.locale})\n\n${manifest.recordingInstructions}\n\n${manifest.scenes.map((s, i) => `ESCENA ${i + 1} · ${s.sceneId}\nReferencia editorial: ${s.estimatedDurationMs / 1000} s (no es un límite)\n\n${s.narration}`).join("\n\n")}\n`;
}
