import { access, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import {
  VisualDirectionSchema,
  type VisualDirection,
} from "../../domain/visual-direction";
import { ImageGenerationRequestSchema } from "../../domain/image-generation";
import {
  ImageQualityReviewSchema,
  type ImageQualityReview,
} from "../../domain/image-quality";
import { VisualAssetSchema } from "../../domain/visual-asset";
import {
  VisualPlanSchema,
  VisualResolutionError,
  type VisualPlan,
} from "../../domain/visual-plan";
import { buildDirectedImageRequest } from "../../application/image-prompt-v2";
import { contentHash } from "../../snapshot/hash";
import {
  atomicJson,
  assertInside,
  readLocalJson,
  withProductionLock,
} from "../production/local-files";
import { fileHash } from "../audio/inspect";
import type { ImageGenerationProvider } from "../../application/ports/image-generation-provider";
import { GeneratedImageResolver } from "./generated-image-resolver";

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const CandidateSchema = z
  .object({
    candidateId: hash,
    candidateNumber: z.union([z.literal(1), z.literal(2)]),
    seed: z.number().int().min(0).max(4294967295),
    request: ImageGenerationRequestSchema,
    status: z.enum([
      "generating",
      "technicalFailure",
      "awaitingReview",
      "accepted",
      "rejected",
    ]),
    technicalAsset: VisualAssetSchema.optional(),
    metrics: z
      .object({
        generationMs: z.number(),
        importMs: z.number().optional(),
        cache: z.enum(["hit", "miss"]),
        cacheHit: z.boolean().optional(),
        cacheRecovered: z.boolean().optional(),
        bytes: z.number(),
        inputHash: hash,
      })
      .strict()
      .optional(),
    error: z.string().optional(),
    review: ImageQualityReviewSchema.optional(),
    inspection: ImageQualityReviewSchema.optional(),
  })
  .strict();
export const CandidateSessionSchema = z
  .object({
    version: z.literal(1),
    productionId: z.string(),
    requirementId: z.string(),
    contextHash: hash,
    direction: VisualDirectionSchema,
    directionHash: hash,
    seeds: z.tuple([
      z.number().int().min(0).max(4294967295),
      z.number().int().min(0).max(4294967295),
    ]),
    status: z.enum([
      "ready",
      "awaitingReview",
      "accepted",
      "manualReviewRequired",
    ]),
    candidates: z.array(CandidateSchema).max(2),
  })
  .strict()
  .superRefine((s, ctx) => {
    const issue = (message: string) =>
      ctx.addIssue({ code: "custom", message });
    if (
      s.seeds[0] === s.seeds[1] ||
      s.directionHash !== contentHash(s.direction)
    )
      issue("Distinct seeds and matching direction hash required");
    for (const [i, c] of s.candidates.entries()) {
      if (
        c.candidateId !==
        contentHash({
          contextHash: s.contextHash,
          request: c.request,
          candidateNumber: c.candidateNumber,
        })
      )
        issue("Candidate request identity changed");
      if (
        c.candidateNumber !== i + 1 ||
        c.seed !== s.seeds[i] ||
        c.request.seed !== c.seed ||
        c.request.directionProvenance?.visualDirectionHash !==
          s.directionHash ||
        c.request.directionProvenance.candidateNumber !== c.candidateNumber
      )
        issue("Candidate identity/provenance mismatch");
      if (i === 1 && s.candidates[0].review?.decision !== "REJECT")
        issue("Second candidate requires recorded rejection");
      if (
        c.review &&
        (c.review.reviewer.kind !== "human" ||
          c.review.candidateId !== c.candidateId ||
          c.review.contentHash !== (c.technicalAsset?.contentHash ?? null))
      )
        issue("Final human review must match inspected candidate bytes");
      if ((c.status === "accepted") !== (c.review?.decision === "ACCEPT"))
        issue("Acceptance requires final human review");
      if ((c.status === "rejected") !== (c.review?.decision === "REJECT"))
        issue("Rejection requires final human review");
      if (
        c.inspection &&
        (c.inspection.reviewer.kind !== "codexInspection" ||
          c.inspection.candidateId !== c.candidateId ||
          c.inspection.contentHash !== (c.technicalAsset?.contentHash ?? null))
      )
        issue("Inspection must match this candidate");
    }
    const last = s.candidates.at(-1);
    const expected =
      last?.status === "accepted"
        ? "accepted"
        : last?.status === "rejected"
          ? s.candidates.length === 2
            ? "manualReviewRequired"
            : "ready"
          : last
            ? "awaitingReview"
            : "ready";
    if (s.status !== expected) issue("Incoherent candidate session state");
  });
export type CandidateSession = z.infer<typeof CandidateSessionSchema>;
export type ImageCandidate = z.infer<typeof CandidateSchema>;

export class ImageCandidateSession {
  private readonly statePath: string;
  constructor(
    private readonly workspace: string,
    private readonly directory: string,
    private readonly provider: ImageGenerationProvider,
    private readonly plan: VisualPlan,
    private readonly direction: VisualDirection,
    private readonly seeds: readonly [number, number],
    private readonly allowTestProvider = false,
  ) {
    VisualPlanSchema.parse(plan);
    VisualDirectionSchema.parse(direction);
    if (plan.strategy !== "generatedImage")
      throw new VisualResolutionError(
        "INVALID_SPEC",
        "Candidate session requires an image requirement",
      );
    this.statePath = resolve(
      directory,
      `image-candidates/${plan.requirementId}.json`,
    );
  }
  private contextHash() {
    return contentHash({
      plan: this.plan,
      direction: this.direction,
      seeds: this.seeds,
      provider: this.provider.identity(),
      promptBuilderVersion: "concept-image-v2",
    });
  }
  private async load(): Promise<CandidateSession> {
    await assertInside(
      resolve(this.workspace, ".local/productions"),
      this.directory,
    );
    const folder = resolve(this.directory, "image-candidates");
    await mkdir(folder, { recursive: true });
    await assertInside(this.directory, folder);
    let exists = false;
    try {
      await access(this.statePath);
      exists = true;
    } catch {
      /* first session */
    }
    if (exists) {
      const state = CandidateSessionSchema.parse(
        await readLocalJson(await assertInside(folder, this.statePath)),
      );
      if (
        state.contextHash !== this.contextHash() ||
        state.productionId !== this.plan.productionId ||
        state.requirementId !== this.plan.requirementId
      )
        throw new VisualResolutionError(
          "STALE_PLAN",
          "Candidate context changed; existing evidence cannot be reset implicitly",
        );
      return state;
    }
    return CandidateSessionSchema.parse({
      version: 1,
      productionId: this.plan.productionId,
      requirementId: this.plan.requirementId,
      contextHash: this.contextHash(),
      direction: this.direction,
      directionHash: contentHash(this.direction),
      seeds: this.seeds,
      status: "ready",
      candidates: [],
    });
  }
  async status() {
    return this.load();
  }
  private async save(state: CandidateSession) {
    await atomicJson(this.statePath, CandidateSessionSchema.parse(state));
  }
  async generateNext(): Promise<ImageCandidate> {
    return withProductionLock(this.directory, async () => {
      const state = await this.load();
      if (state.status !== "ready")
        throw new VisualResolutionError(
          state.status === "manualReviewRequired"
            ? "CANDIDATE_LIMIT"
            : "REVIEW_REQUIRED",
          "Await final human review; accepted/rejected candidates are never silently regenerated",
        );
      const candidateNumber = (state.candidates.length + 1) as 1 | 2;
      if (candidateNumber > 2)
        throw new VisualResolutionError(
          "CANDIDATE_LIMIT",
          "Maximum two candidates per requirement",
        );
      const request = buildDirectedImageRequest(
        state.direction,
        this.plan.sceneId,
        this.plan.imageRequest?.locale ?? "es-ES",
        state.seeds[candidateNumber - 1],
        candidateNumber,
      );
      const candidate: ImageCandidate = {
        candidateId: contentHash({
          contextHash: state.contextHash,
          request,
          candidateNumber,
        }),
        candidateNumber,
        seed: request.seed,
        request,
        status: "generating",
      };
      state.candidates.push(candidate);
      state.status = "awaitingReview";
      // Reserve the attempt durably BEFORE touching the GPU. Crashes never reset the budget.
      await this.save(state);
      try {
        const result = await new GeneratedImageResolver(
          this.workspace,
          this.directory,
          this.provider,
          this.allowTestProvider,
        ).generateCandidate(
          VisualPlanSchema.parse({ ...this.plan, imageRequest: request }),
        );
        candidate.technicalAsset = result.technicalAsset;
        candidate.metrics = result.metrics;
        candidate.status = "awaitingReview";
      } catch (error) {
        candidate.status = "technicalFailure";
        candidate.error =
          error instanceof VisualResolutionError
            ? error.code
            : "GENERATION_FAILED";
      }
      await this.save(state);
      return candidate;
    });
  }
  async inspect(raw: ImageQualityReview) {
    return withProductionLock(this.directory, async () => {
      const state = await this.load(),
        review = ImageQualityReviewSchema.parse(raw),
        candidate = state.candidates.find(
          (c) => c.candidateId === review.candidateId,
        );
      if (
        !candidate ||
        candidate.review ||
        review.reviewer.kind !== "codexInspection" ||
        review.contentHash !== (candidate.technicalAsset?.contentHash ?? null)
      )
        throw new VisualResolutionError(
          "INVALID_SPEC",
          "Inspection must reference unreviewed candidate",
        );
      if (candidate.technicalAsset) await this.verifyBytes(candidate);
      candidate.inspection = review;
      await this.save(state);
      return state;
    });
  }
  async review(raw: ImageQualityReview) {
    return withProductionLock(this.directory, async () => {
      const state = await this.load(),
        review = ImageQualityReviewSchema.parse(raw),
        candidate = state.candidates.find(
          (c) => c.candidateId === review.candidateId,
        );
      if (
        !candidate ||
        candidate.review ||
        !candidate.inspection ||
        review.reviewer.kind !== "human" ||
        review.contentHash !== (candidate.technicalAsset?.contentHash ?? null)
      )
        throw new VisualResolutionError(
          "REVIEW_REQUIRED",
          "Final decision requires a human review of the inspected candidate; existing reviews are immutable",
        );
      if (candidate.technicalAsset) await this.verifyBytes(candidate);
      candidate.review = review;
      candidate.status = review.decision === "ACCEPT" ? "accepted" : "rejected";
      state.status =
        review.decision === "ACCEPT"
          ? "accepted"
          : state.candidates.length === 2
            ? "manualReviewRequired"
            : "ready";
      const reviewHash = contentHash(review);
      await atomicJson(
        resolve(this.directory, `image-candidates/review-${reviewHash}.json`),
        review,
      );
      await this.save(state);
      return state;
    });
  }
  private async verifyBytes(candidate: ImageCandidate) {
    const path = await assertInside(
      this.directory,
      resolve(this.directory, candidate.technicalAsset!.path),
    );
    if ((await fileHash(path)) !== candidate.technicalAsset!.contentHash)
      throw new VisualResolutionError(
        "CACHE_CORRUPT",
        "Candidate bytes changed after validation",
      );
    const receiptPath = await assertInside(
      this.directory,
      resolve(
        this.directory,
        `visual-assets/generated-ai/receipt-${candidate.technicalAsset!.aiGeneration!.receiptHash}.json`,
      ),
    );
    const receipt = JSON.parse(await readFile(receiptPath, "utf8"));
    if (
      contentHash(receipt) !==
        candidate.technicalAsset!.aiGeneration!.receiptHash ||
      contentHash(receipt.request) !== contentHash(candidate.request)
    )
      throw new VisualResolutionError(
        "CACHE_CORRUPT",
        "Generation receipt changed",
      );
  }
  async acceptedAsset() {
    const state = await this.load(),
      candidate = state.candidates.find((c) => c.status === "accepted");
    if (!candidate?.technicalAsset || !candidate.review)
      throw new VisualResolutionError(
        "REVIEW_REQUIRED",
        "No editorially accepted image",
      );
    await this.verifyBytes(candidate);
    const reviewHash = contentHash(candidate.review);
    const sealed = await readLocalJson(
      await assertInside(
        this.directory,
        resolve(this.directory, `image-candidates/review-${reviewHash}.json`),
      ),
    );
    if (contentHash(sealed) !== reviewHash)
      throw new VisualResolutionError("CACHE_CORRUPT", "Human review changed");
    const asset = candidate.technicalAsset;
    const aiGeneration = {
      ...asset.aiGeneration!,
      editorial: {
        ...candidate.request.directionProvenance!,
        reviewDecision: "ACCEPT",
        reviewIssues: candidate.review.issues,
        reviewHash,
      },
    };
    return VisualAssetSchema.parse({
      ...asset,
      id: `visual-${contentHash({ technicalAssetId: asset.id, aiGeneration })}`,
      aiGeneration,
    });
  }
}
