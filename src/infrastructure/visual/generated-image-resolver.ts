import { access, mkdir, writeFile, stat, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, resolve } from "node:path";
import { z } from "zod";
import type {
  VisualResolver,
  VisualResolution,
} from "../../application/ports/visual-resolver";
import type { ImageGenerationProvider } from "../../application/ports/image-generation-provider";
import { ImageGenerationRequestSchema } from "../../domain/image-generation";
import {
  VisualPlanSchema,
  VisualResolutionError,
  type VisualPlan,
} from "../../domain/visual-plan";
import { VisualAssetSchema } from "../../domain/visual-asset";
import { contentHash } from "../../snapshot/hash";
import { fileHash } from "../audio/inspect";
import {
  assertInside,
  atomicJson,
  readLocalJson,
} from "../production/local-files";
import { importVisualAsset } from "./import-asset";
import { createLocalImageProvider } from "./image-provider";
const hash = z.string().regex(/^[a-f0-9]{64}$/),
  alias = z.string().regex(/^[a-zA-Z0-9_.-]{1,120}$/);
const IdentitySchema = z
  .object({
    runtimeId: alias,
    runtimeVersion: alias,
    modelId: alias,
    modelHash: hash.optional(),
    testOnly: z.boolean(),
    recipe: z
      .object({
        workflowVersion: alias,
        runtimeCommit: z.string().regex(/^[a-f0-9]{40}$/),
        steps: z.number(),
        cfg: z.number(),
        sampler: alias,
        scheduler: alias,
      })
      .strict()
      .optional(),
  })
  .strict();
const ReceiptSchema = z
  .object({
    version: z.literal(1),
    resolver: z.literal("generatedImage-v1"),
    identity: IdentitySchema,
    request: ImageGenerationRequestSchema,
    inputHash: hash,
    promptHash: hash,
    negativePromptHash: hash.optional(),
    outputHash: hash,
    contentHash: hash,
    elapsedMs: z.number().nonnegative(),
    reproducibility: z.literal("seeded-not-bitwise-guaranteed"),
  })
  .strict();
export class GeneratedImageResolver implements VisualResolver {
  readonly id = "generatedImage-v1";
  constructor(
    private readonly workspace: string,
    private readonly directory: string,
    private readonly provider: ImageGenerationProvider = createLocalImageProvider(),
    private readonly allowTestProvider = false,
  ) {}
  async resolve(raw: VisualPlan): Promise<VisualResolution> {
    if (raw.imageRequest?.promptVersion === "concept-image-v2")
      throw new VisualResolutionError(
        "REVIEW_REQUIRED",
        "Directed images must go through candidate generation and human review",
      );
    return this.resolveValidated(raw, true);
  }
  async generateCandidate(raw: VisualPlan): Promise<{
    technicalAsset: VisualResolution["asset"];
    metrics: VisualResolution["metrics"];
  }> {
    if (raw.imageRequest?.promptVersion !== "concept-image-v2")
      throw new VisualResolutionError(
        "INVALID_SPEC",
        "Candidate generation requires a directed v2 request",
      );
    const result = await this.resolveValidated(raw, false);
    return { technicalAsset: result.asset, metrics: result.metrics };
  }
  private async resolveValidated(
    raw: VisualPlan,
    recoverCache: boolean,
  ): Promise<VisualResolution> {
    try {
      return await this.resolveLocal(raw);
    } catch (error) {
      if (
        error instanceof VisualResolutionError &&
        error.code === "CACHE_CORRUPT" &&
        recoverCache
      ) {
        const plan = VisualPlanSchema.parse(raw);
        const inputHash = contentHash({
          request: plan.imageRequest,
          identity: this.provider.identity(),
          resolver: this.id,
          recipeVersion: 1,
        });
        const cache = resolve(this.directory, "visual-assets/generated-ai");
        await assertInside(this.directory, cache);
        const quarantine = resolve(cache, `corrupt-${randomUUID()}`);
        await mkdir(quarantine);
        for (const extension of ["png", "json", "request.json"]) {
          const path = resolve(cache, `${inputHash}.${extension}`);
          try {
            await access(path);
          } catch {
            continue;
          }
          await assertInside(cache, path);
          await rename(path, resolve(quarantine, basename(path)));
        }
        // One recovery attempt only; keep corrupt evidence, never reuse it.
        const recovered = await this.resolveLocal(raw);
        recovered.metrics.cacheRecovered = true;
        return recovered;
      }
      if (error instanceof VisualResolutionError) throw error;
      throw new VisualResolutionError(
        "GENERATION_FAILED",
        "Local image generation/validation failed; no fallback applied",
      );
    }
  }
  private async resolveLocal(raw: VisualPlan): Promise<VisualResolution> {
    const started = performance.now(),
      parsed = VisualPlanSchema.safeParse(raw);
    if (!parsed.success)
      throw new VisualResolutionError(
        "INVALID_SPEC",
        "Invalid image VisualPlan",
      );
    const plan = parsed.data;
    if (plan.strategy !== "generatedImage" || plan.semanticType !== "image")
      throw new VisualResolutionError(
        "UNSUPPORTED_STRATEGY",
        "Image resolver only accepts conceptual image requirements",
      );
    const capability = this.provider.capability();
    if (capability.status !== "available")
      throw new VisualResolutionError("UNAVAILABLE", capability.reason);
    if (
      plan.resolver !== this.id ||
      plan.status === "unavailable" ||
      !plan.imageRequest
    )
      throw new VisualResolutionError(
        "UNAVAILABLE",
        "Image plan is not enabled for a verified local capability",
      );
    const request = ImageGenerationRequestSchema.parse(plan.imageRequest),
      identity = IdentitySchema.parse(this.provider.identity());
    if (
      capability.execution !== "local" ||
      request.width * request.height > capability.maxPixels ||
      (identity.testOnly && !this.allowTestProvider)
    )
      throw new VisualResolutionError(
        "UNAVAILABLE",
        "Backend is not allowed for this resolution context",
      );
    await assertInside(
      resolve(this.workspace, ".local/productions"),
      this.directory,
    );
    if (basename(this.directory) !== plan.productionId)
      throw new VisualResolutionError(
        "STALE_PLAN",
        "Image plan belongs to a different production",
      );
    const inputHash = contentHash({
        request,
        identity,
        resolver: this.id,
        recipeVersion: 1,
      }),
      promptHash = contentHash({
        prompt: request.prompt,
        negativePrompt: request.negativePrompt ?? null,
        promptVersion: request.promptVersion,
      });
    const cache = resolve(this.directory, "visual-assets/generated-ai");
    await mkdir(cache, { recursive: true });
    await assertInside(this.directory, cache);
    const png = resolve(cache, `${inputHash}.png`),
      receiptPath = resolve(cache, `${inputHash}.json`);
    let hit = false;
    try {
      await access(receiptPath);
      hit = true;
    } catch {
      /* no cache */
    }
    let receipt: z.infer<typeof ReceiptSchema> | undefined;
    if (hit) {
      try {
        receipt = ReceiptSchema.parse(
          await readLocalJson(await assertInside(cache, receiptPath)),
        );
        await assertInside(cache, png);
        if (
          (await stat(png)).size > 20 * 1024 * 1024 ||
          receipt.inputHash !== inputHash ||
          receipt.promptHash !== promptHash ||
          contentHash(receipt.request) !== contentHash(request) ||
          contentHash(receipt.identity) !== contentHash(identity) ||
          (await fileHash(png)) !== receipt.outputHash
        )
          throw Error("changed");
        const sealed = resolve(cache, `receipt-${contentHash(receipt)}.json`);
        if (
          contentHash(
            await readLocalJson(await assertInside(cache, sealed)),
          ) !== contentHash(receipt)
        )
          throw Error("changed receipt");
      } catch {
        throw new VisualResolutionError(
          "CACHE_CORRUPT",
          "AI cache receipt or bytes changed",
        );
      }
    } else {
      let orphan = false;
      try {
        await access(png);
        orphan = true;
      } catch {
        /* no output */
      }
      if (orphan)
        throw new VisualResolutionError(
          "CACHE_CORRUPT",
          "Uncommitted cached PNG must be quarantined before generation",
        );
      await atomicJson(resolve(cache, `${inputHash}.request.json`), request);
      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const generationStarted = performance.now();
      let bytes: Uint8Array;
      try {
        bytes = await Promise.race([
          this.provider.generate(request, controller.signal),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => {
              controller.abort();
              reject(
                new VisualResolutionError(
                  "TIMEOUT",
                  "Local generation exceeded the provider operation timeout; no automatic retry",
                ),
              );
            }, this.provider.timeoutMs ?? 120000);
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
      if (
        !(bytes instanceof Uint8Array) ||
        bytes.byteLength > 20 * 1024 * 1024 ||
        !Buffer.from(bytes.subarray(0, 8)).equals(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        )
      )
        throw new VisualResolutionError(
          "INVALID_SPEC",
          "Provider must return a bounded PNG; completion is not validation",
        );
      try {
        await writeFile(png, bytes, { flag: "wx" });
      } catch {
        throw new VisualResolutionError(
          "CACHE_CORRUPT",
          "Uncommitted output already exists; refusing to overwrite it",
        );
      }
      receipt = {
        version: 1,
        resolver: this.id,
        identity,
        request,
        inputHash,
        promptHash,
        negativePromptHash: contentHash(request.negativePrompt ?? ""),
        outputHash: await fileHash(png),
        contentHash: "0".repeat(64),
        elapsedMs: performance.now() - generationStarted,
        reproducibility: "seeded-not-bitwise-guaranteed",
      };
    }
    const importStarted = performance.now();
    const imported = await importVisualAsset(
      this.workspace,
      this.directory,
      png,
      "image",
      "unused",
      identity.testOnly,
    );
    if (
      imported.source.metadata.width !== request.width ||
      imported.source.metadata.height !== request.height
    )
      throw new VisualResolutionError(
        "INVALID_SPEC",
        "Generated dimensions differ from the request",
      );
    if (hit && receipt!.contentHash !== imported.contentHash)
      throw new VisualResolutionError(
        "CACHE_CORRUPT",
        "Normalized cached output changed",
      );
    receipt = ReceiptSchema.parse({
      ...receipt,
      contentHash: imported.contentHash,
    });
    const receiptHash = contentHash(receipt),
      sealedReceipt = resolve(cache, `receipt-${receiptHash}.json`);
    if (hit) {
      try {
        if (
          contentHash(
            await readLocalJson(await assertInside(cache, sealedReceipt)),
          ) !== receiptHash
        )
          throw Error("changed");
      } catch {
        throw new VisualResolutionError(
          "CACHE_CORRUPT",
          "Provenance receipt changed",
        );
      }
    } else {
      await atomicJson(sealedReceipt, receipt);
      await atomicJson(receiptPath, receipt);
    }
    const aiGeneration = {
      resolver: this.id,
      recipeVersion: 1,
      receiptHash,
      inputHash,
      promptHash,
      seed: request.seed,
      contentHash: imported.contentHash,
      ...(request.directionProvenance
        ? {
            editorial: {
              ...request.directionProvenance,
              reviewDecision: "PENDING",
              reviewIssues: [],
            },
          }
        : {}),
    };
    const asset = VisualAssetSchema.parse({
      ...imported,
      id: `visual-${contentHash({ importedId: imported.id, aiGeneration })}`,
      type: "conceptualImage",
      source: { ...imported.source, kind: "generatedLocalAI" },
      aiGeneration,
    });
    return {
      asset,
      metrics: {
        generationMs: performance.now() - started,
        cache: hit ? "hit" : "miss",
        cacheHit: hit,
        importMs: performance.now() - importStarted,
        bytes: asset.bytes,
        inputHash,
      },
    };
  }
}
