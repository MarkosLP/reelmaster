import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  VisualDirectionSchema,
  type VisualDirectorInput,
} from "../src/domain/visual-direction";
import {
  ImageQualityReviewSchema,
  type ImageQualityReview,
} from "../src/domain/image-quality";
import { reelMasterBrand, type VisualPlan } from "../src/domain/visual-plan";
import {
  LocalVisualDirector,
  fallbackDirection,
  directionProfile,
} from "../src/application/visual-director";
import { buildDirectedImageRequest } from "../src/application/image-prompt-v2";
import type { VisualDirectionProvider } from "../src/application/ports/visual-director";
import {
  createVisualManifest,
  assignVisualAsset,
} from "../src/application/visual-manifest";
import { planVisuals } from "../src/application/visual-planning";
import { compileReelDraft } from "../src/application/generate-reel-content";
import { createProductionPlan } from "../src/application/production-plan";
import { contentHash } from "../src/snapshot/hash";
import { GeneratedImageResolver } from "../src/infrastructure/visual/generated-image-resolver";
import {
  ImageCandidateSession,
  type ImageCandidate,
} from "../src/infrastructure/visual/image-candidates";
import { FakeImageProvider } from "./fixtures/fake-image-provider";
import { ImageGenerationRequestSchema } from "../src/domain/image-generation";
import { VisualAssetManifestSchema } from "../src/domain/visual-asset";
import { directorSystemPrompt } from "../src/infrastructure/visual/ollama-visual-director";
import { verifyVisualFiles } from "../src/infrastructure/visual/operations";

const input: VisualDirectorInput = {
  narration: "La IA organiza tareas.",
  purpose: "example",
  visualIntent: {
    kind: "image",
    description:
      "Imagen IA conceptual: un nodo central organizando elementos abstractos",
  },
  contentStyle: "tech",
  brand: reelMasterBrand,
};
class DirectorFake implements VisualDirectionProvider {
  calls = 0;
  repairs: Array<string | undefined> = [];
  constructor(private replies: unknown[]) {}
  identity() {
    return {
      model: "test-instruct",
      modelDigest: "a".repeat(64),
      runtimeVersion: "1",
    };
  }
  async propose(_: VisualDirectorInput, repair: string | undefined) {
    this.repairs.push(repair);
    return this.replies[this.calls++];
  }
}
test("VisualDirection schema separates visual concepts from infrastructure and writing surfaces", () => {
  const d = fallbackDirection(input);
  assert.ok(VisualDirectionSchema.safeParse(d).success);
  for (const patch of [
    { subject: "Marcos presenter" },
    { subject: "a dashboard with labels" },
    { subject: "a document" },
    { subject: "human hands" },
    { environment: "white background" },
    { sampler: "euler" },
    { forbiddenElements: [] },
  ])
    assert.equal(
      VisualDirectionSchema.safeParse({ ...d, ...patch }).success,
      false,
    );
  assert.throws(() =>
    fallbackDirection({
      ...input,
      visualIntent: { kind: "avatarTalking", description: "Marcos" },
    }),
  );
  assert.throws(() =>
    fallbackDirection({ ...input, narration: "Un retrato de Marcos" }),
  );
});
test("Director validates output, uses one repair only, then conservative fallback", async () => {
  const good = fallbackDirection(input),
    first = new DirectorFake([good]);
  assert.equal(
    (await new LocalVisualDirector(first).direct(input)).source,
    "localDirector",
  );
  assert.equal(first.calls, 1);
  const repaired = new DirectorFake([{}, good]);
  assert.equal(
    (await new LocalVisualDirector(repaired).direct(input)).source,
    "localDirector",
  );
  assert.equal(repaired.calls, 2);
  assert.ok(repaired.repairs[1]);
  const broken = new DirectorFake([{}, {}]);
  const result = await new LocalVisualDirector(broken).direct(input);
  assert.equal(result.source, "deterministicFallback");
  assert.equal(broken.calls, 2);
  assert.deepEqual(result.direction, good);
  const absent = await new LocalVisualDirector().direct(input);
  assert.equal(absent.attempts, 0);
  assert.equal(absent.source, "deterministicFallback");
});
test("Director timeout is bounded even for noncooperative provider; cancellation does not silently fallback", async () => {
  class Slow extends DirectorFake {
    override async propose() {
      return new Promise(() => {});
    }
  }
  const timed = await new LocalVisualDirector(new Slow([]), 20).direct(input);
  assert.equal(timed.source, "deterministicFallback");
  assert.equal(timed.attempts, 1);
  await assert.rejects(
    new LocalVisualDirector().direct(input, AbortSignal.abort()),
    { code: "CANCELLED" },
  );
});
test("Brand is the source of the dark profile, palette and positive lighting", async () => {
  const profile = directionProfile(reelMasterBrand);
  assert.equal(profile.palette.accent, reelMasterBrand.colors.accent);
  assert.match(profile.lighting, /green/);
  assert.match(profile.environment, /dark.*black/);
  const blue = {
    ...reelMasterBrand,
    colors: { ...reelMasterBrand.colors, accent: "#99ccff" },
  };
  assert.match(directionProfile(blue).lighting, /blue/);
  const wrong = {
    ...fallbackDirection(input),
    palette: { ...profile.palette, accent: "#ffffff" },
  };
  const result = await new LocalVisualDirector(
    new DirectorFake([wrong, wrong]),
  ).direct(input);
  assert.equal(result.source, "deterministicFallback");
});
test("Prompt v2 uses concise affirmative direction, never narration/semanticGoal/hex or no-text words in positive prompt", () => {
  const d = fallbackDirection(input),
    r = buildDirectedImageRequest(d, "scene-1", "es-ES", 1001, 1);
  assert.equal(r.promptVersion, "concept-image-v2");
  assert.ok(r.prompt.length < 850);
  assert.doesNotMatch(
    r.prompt,
    /La IA organiza|semanticGoal|#[a-f0-9]{6}|infographic|poster|diagram|presentation|dashboard|document|typography|written information/i,
  );
  assert.match(r.prompt, /Single continuous scene/);
  assert.match(r.negativePrompt!, /infographic/);
  assert.equal(r.options.guidanceStrength, 1);
  assert.equal(r.directionProvenance?.visualDirectionHash, contentHash(d));
  assert.equal(
    ImageGenerationRequestSchema.safeParse({
      ...r,
      directionProvenance: undefined,
    }).success,
    false,
  );
  assert.match(directorSystemPrompt, /ONE central concept/);
});
test("Three concepts simplify to central objects, not complex groups/interfaces", () => {
  assert.match(fallbackDirection(input).subject, /one central/);
  assert.match(
    fallbackDirection({ ...input, narration: "Agentes colaborando" }).subject,
    /three small.*one central/,
  );
  assert.match(
    fallbackDirection({
      ...input,
      narration: "Transformación de una idea en contenido",
    }).subject,
    /one glowing/,
  );
});
function review(
  c: ImageCandidate,
  decision: "ACCEPT" | "REJECT",
  kind: "human" | "codexInspection" = "human",
): ImageQualityReview {
  return ImageQualityReviewSchema.parse({
    version: 1,
    candidateId: c.candidateId,
    contentHash: c.technicalAsset?.contentHash ?? null,
    technicalValid: Boolean(c.technicalAsset),
    editorialValid: decision === "ACCEPT",
    issues:
      decision === "ACCEPT"
        ? []
        : [c.technicalAsset ? "pseudotext" : "technicalFailure"],
    decision,
    reviewer: {
      kind,
      name: kind === "human" ? "Test human" : "Test inspection",
    },
    inspected: true,
    notes: "Explicit test-only review of fixture bytes.",
    reviewedAt: new Date().toISOString(),
  });
}
async function session() {
  const workspace = resolve("."),
    provider = new FakeImageProvider();
  const draft = compileReelDraft(
    {
      topic: "Quality test",
      locale: "es-ES",
      targetDurationMs: 15000,
      contentStyle: "tech",
      audience: "Test",
      voiceProfileId: "voice-technical",
      orientation: "vertical",
    },
    {
      title: `Quality ${randomUUID()}`,
      scenes: [
        {
          narration: input.narration,
          purpose: "hook",
          visualIntent: input.visualIntent,
          estimatedDurationMs: 7500,
          onScreenText: "Quality",
        },
        {
          narration: "Fin de prueba",
          purpose: "closing",
          visualIntent: { kind: "textOnly", description: "Texto" },
          estimatedDurationMs: 7500,
          onScreenText: "Fin",
        },
      ],
    },
  );
  const plan = createProductionPlan(draft, {
      voiceProfile: {
        id: "voice-technical",
        displayName: "Test tones",
        locale: "es-ES",
        source: "recorded-reference",
      },
      presenter: {
        id: "presenter-technical",
        displayName: "No person",
        defaultVoiceProfileId: "voice-technical",
      },
    }),
    directory = resolve(workspace, ".local/productions", plan.id);
  await mkdir(directory, { recursive: true });
  const entry = planVisuals(
      plan,
      createVisualManifest(plan),
      provider.capability(),
    )[0],
    direction = fallbackDirection(input);
  return {
    workspace,
    provider,
    plan,
    directory,
    entry,
    direction,
    manager: new ImageCandidateSession(
      workspace,
      directory,
      provider,
      entry,
      direction,
      [1001, 1002],
      true,
    ),
  };
}
test("QualityReview rejects inconsistent validity and requires explicit rejection issues", () => {
  const c = {
    candidateId: "a".repeat(64),
    technicalAsset: { contentHash: "b".repeat(64) },
  } as ImageCandidate;
  const good = review(c, "ACCEPT");
  assert.ok(ImageQualityReviewSchema.safeParse(good).success);
  for (const patch of [
    { technicalValid: false },
    { editorialValid: false },
    { issues: ["pseudotext"] },
    { inspected: false },
  ])
    assert.equal(
      ImageQualityReviewSchema.safeParse({ ...good, ...patch }).success,
      false,
    );
});
test("Candidate 1 ACCEPT: pending asset cannot bind; human gate; accepted candidate caches without backend", async () => {
  const s = await session(),
    c = await s.manager.generateNext();
  assert.equal(s.provider.calls, 1);
  assert.throws(() =>
    assignVisualAsset(
      s.plan,
      createVisualManifest(s.plan),
      s.entry.requirementId,
      c.technicalAsset!,
    ),
  );
  await assert.rejects(s.manager.acceptedAsset(), { code: "REVIEW_REQUIRED" });
  await assert.rejects(s.manager.generateNext(), { code: "REVIEW_REQUIRED" });
  await s.manager.inspect(review(c, "ACCEPT", "codexInspection"));
  await assert.rejects(
    s.manager.review(review(c, "ACCEPT", "codexInspection")),
    { code: "REVIEW_REQUIRED" },
  );
  await s.manager.review(review(c, "ACCEPT"));
  const asset = await s.manager.acceptedAsset();
  const manifest = assignVisualAsset(
    s.plan,
    createVisualManifest(s.plan),
    s.entry.requirementId,
    asset,
  );
  assert.equal(manifest.status, "resolved");
  await verifyVisualFiles(s.directory, manifest);
  assert.equal(asset.aiGeneration!.editorial!.reviewDecision, "ACCEPT");
  assert.equal(asset.aiGeneration!.editorial!.candidateNumber, 1);
  const reopened = new ImageCandidateSession(
    s.workspace,
    s.directory,
    s.provider,
    s.entry,
    s.direction,
    [1001, 1002],
    true,
  );
  assert.deepEqual(await reopened.acceptedAsset(), asset);
  assert.equal(s.provider.calls, 1);
  await assert.rejects(reopened.generateNext(), { code: "REVIEW_REQUIRED" });
  const pending = { ...manifest, assets: [c.technicalAsset] };
  assert.equal(VisualAssetManifestSchema.safeParse(pending).success, false);
});
test("Candidate 1 rejected permits exactly candidate 2 with different seed; second rejection requires manual review", async () => {
  const s = await session(),
    c1 = await s.manager.generateNext();
  await s.manager.inspect(review(c1, "REJECT", "codexInspection"));
  await s.manager.review(review(c1, "REJECT"));
  await assert.rejects(s.manager.acceptedAsset(), { code: "REVIEW_REQUIRED" });
  const c2 = await s.manager.generateNext();
  assert.equal(c2.candidateNumber, 2);
  assert.notEqual(c1.seed, c2.seed);
  assert.notEqual(c1.candidateId, c2.candidateId);
  await s.manager.inspect(review(c2, "REJECT", "codexInspection"));
  await s.manager.review(review(c2, "REJECT"));
  assert.equal((await s.manager.status()).status, "manualReviewRequired");
  await assert.rejects(s.manager.generateNext(), { code: "CANDIDATE_LIMIT" });
  assert.equal(s.provider.calls, 2);
  await assert.rejects(s.manager.review(review(c1, "ACCEPT")), {
    code: "REVIEW_REQUIRED",
  });
  const reopened = new ImageCandidateSession(
    s.workspace,
    s.directory,
    s.provider,
    s.entry,
    s.direction,
    [1001, 1002],
    true,
  );
  await assert.rejects(reopened.acceptedAsset(), { code: "REVIEW_REQUIRED" });
});
test("Rejected cache remains evidence; candidate 2 can be accepted with its own sealed provenance", async () => {
  const s = await session(),
    first = await s.manager.generateNext();
  await s.manager.inspect(review(first, "REJECT", "codexInspection"));
  await s.manager.review(review(first, "REJECT"));
  const second = await s.manager.generateNext();
  await s.manager.inspect(review(second, "ACCEPT", "codexInspection"));
  await s.manager.review(review(second, "ACCEPT"));
  const accepted = await s.manager.acceptedAsset();
  assert.equal(accepted.aiGeneration!.editorial!.candidateNumber, 2);
  assert.notEqual(accepted.contentHash, first.technicalAsset!.contentHash);
  assert.equal(
    (await s.manager.status()).candidates[0].review!.decision,
    "REJECT",
  );
  const corrupted = resolve(s.directory, accepted.path);
  await writeFile(corrupted, "changed");
  await assert.rejects(s.manager.acceptedAsset(), { code: "CACHE_CORRUPT" });
  assert.equal(s.provider.calls, 2);
});
test("Directed resolver cannot bypass human gate and candidate cache key includes direction, builder, seed and model", async () => {
  const s = await session(),
    request = buildDirectedImageRequest(
      s.direction,
      s.entry.sceneId,
      "es-ES",
      1001,
      1,
    ),
    plan = { ...s.entry, imageRequest: request } as VisualPlan;
  const resolver = new GeneratedImageResolver(
    s.workspace,
    s.directory,
    s.provider,
    true,
  );
  await assert.rejects(resolver.resolve(plan), { code: "REVIEW_REQUIRED" });
  const first = await resolver.generateCandidate(plan),
    hit = await resolver.generateCandidate(plan);
  assert.equal(hit.metrics.cache, "hit");
  assert.equal(s.provider.calls, 1);
  const other = await resolver.generateCandidate({
    ...plan,
    imageRequest: buildDirectedImageRequest(
      { ...s.direction, action: "small blocks align around the luminous core" },
      s.entry.sceneId,
      "es-ES",
      1001,
      1,
    ),
  });
  assert.notEqual(other.metrics.inputHash, first.metrics.inputHash);
  const receipt = JSON.parse(
    await readFile(
      resolve(
        s.directory,
        `visual-assets/generated-ai/receipt-${first.technicalAsset.aiGeneration!.receiptHash}.json`,
      ),
      "utf8",
    ),
  );
  assert.equal(
    receipt.request.directionProvenance.visualDirectionHash,
    contentHash(s.direction),
  );
  assert.equal(
    receipt.request.directionProvenance.promptBuilderVersion,
    "concept-image-v2",
  );
});
test("Changing session context cannot reset attempts or reuse another review", async () => {
  const s = await session();
  await s.manager.generateNext();
  const changed = new ImageCandidateSession(
    s.workspace,
    s.directory,
    s.provider,
    s.entry,
    s.direction,
    [2001, 2002],
    true,
  );
  await assert.rejects(changed.status(), { code: "STALE_PLAN" });
});

test("Technical failures consume a reserved attempt and cannot trigger silent retries", async () => {
  const s = await session();
  class FailedProvider extends FakeImageProvider {
    override async generate(): Promise<never> {
      this.calls++;
      throw Error("technical failure");
    }
  }
  const provider = new FailedProvider(),
    manager = new ImageCandidateSession(
      s.workspace,
      s.directory,
      provider,
      s.entry,
      s.direction,
      [1001, 1002],
      true,
    );
  const first = await manager.generateNext();
  assert.equal(first.status, "technicalFailure");
  assert.equal(provider.calls, 1);
  await assert.rejects(manager.generateNext(), { code: "REVIEW_REQUIRED" });
  await manager.inspect(review(first, "REJECT", "codexInspection"));
  await manager.review(review(first, "REJECT"));
  const second = await manager.generateNext();
  assert.equal(second.status, "technicalFailure");
  assert.equal(provider.calls, 2);
  await manager.inspect(review(second, "REJECT", "codexInspection"));
  await manager.review(review(second, "REJECT"));
  await assert.rejects(manager.generateNext(), { code: "CANDIDATE_LIMIT" });
});

test("A modified human receipt fails file verification without invoking the image provider", async () => {
  const s = await session(),
    c = await s.manager.generateNext();
  await s.manager.inspect(review(c, "ACCEPT", "codexInspection"));
  await s.manager.review(review(c, "ACCEPT"));
  const asset = await s.manager.acceptedAsset(),
    manifest = assignVisualAsset(
      s.plan,
      createVisualManifest(s.plan),
      s.entry.requirementId,
      asset,
    );
  await writeFile(
    resolve(
      s.directory,
      `image-candidates/review-${asset.aiGeneration!.editorial!.reviewHash}.json`,
    ),
    "{}",
  );
  await assert.rejects(verifyVisualFiles(s.directory, manifest));
  assert.equal(s.provider.calls, 1);
});
