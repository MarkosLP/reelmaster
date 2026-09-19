import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, unlink, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  PresenterEditPlanSchema,
  type PresenterEditPlan,
} from "../src/domain/presenter-edit";
import { PresenterEditReviewSchema } from "../src/domain/presenter-edit-review";
import { presenterReviewServer } from "../src/infrastructure/review/server";
import { contentHash } from "../src/snapshot/hash";
import { fileHash } from "../src/infrastructure/audio/inspect";

const runId = randomUUID();
const workspace = resolve(".");
const directory = resolve(".local/review-tests", runId);
const videoPath = resolve(directory, "montage.mp4");
// El servidor no decodifica el vídeo: lo sirve y verifica su hash.
const videoBytes = Buffer.from(`fake montage ${runId}`.repeat(64));

function plan(): PresenterEditPlan {
  return PresenterEditPlanSchema.parse({
    version: 1,
    sourceHash: "a".repeat(64),
    rawTranscriptHash: "b".repeat(64),
    reviewedTranscriptHash: "c".repeat(64),
    fps: 30,
    durationFrames: 60,
    segments: [
      {
        sourceStartFrame: 30,
        sourceEndFrame: 60,
        outputStartFrame: 0,
        scale: 1,
        reason: `trim ${runId}`,
      },
      {
        sourceStartFrame: 90,
        sourceEndFrame: 120,
        outputStartFrame: 30,
        scale: 1.03,
        reason: "cut",
      },
    ],
    captions: [],
    overlays: [],
  });
}

const verdict = {
  decision: "ACCEPT",
  issues: [],
  timingApproval: true,
  notes: "Visto y oído entero; los cortes y la sincronía funcionan.",
};

let server: Awaited<ReturnType<typeof presenterReviewServer>>;

before(async () => {
  await mkdir(directory, { recursive: true });
  await writeFile(videoPath, videoBytes);
  server = await presenterReviewServer({
    workspace,
    plan: plan(),
    planHash: contentHash(plan()),
    videoPath,
    videoHash: await fileHash(videoPath),
    reviewer: "Marcos",
  });
});

after(async () => {
  await server.close();
  await rm(directory, { recursive: true, force: true });
  await unlink(server.reviewPath).catch(() => undefined);
});

test("the review schema ties acceptance to the absence of open issues", () => {
  const base = {
    version: 1,
    planHash: "a".repeat(64),
    videoHash: "b".repeat(64),
    sourceHash: "c".repeat(64),
    durationFrames: 60,
    watched: true,
    reviewer: { kind: "human", name: "Marcos" },
    reviewedAt: new Date().toISOString(),
    notes: "Revisado entero.",
  };
  assert.ok(
    PresenterEditReviewSchema.safeParse({
      ...base,
      decision: "ACCEPT",
      issues: [],
      timingApproval: true,
    }).success,
  );
  // Aceptar con pegas abiertas, o rechazar sin ninguna, no es coherente.
  for (const bad of [
    { decision: "ACCEPT", issues: ["pacing"], timingApproval: false },
    { decision: "REJECT", issues: [], timingApproval: false },
    { decision: "REJECT", issues: ["pacing"], timingApproval: true },
    { decision: "ACCEPT", issues: [], timingApproval: true, extra: 1 },
    {
      decision: "ACCEPT",
      issues: [],
      timingApproval: true,
      reviewer: { kind: "codexInspection", name: "Codex" },
    },
  ])
    assert.equal(
      PresenterEditReviewSchema.safeParse({ ...base, ...bad }).success,
      false,
      JSON.stringify(bad),
    );
});

test("timing cannot be approved while audio sync is an open issue", () => {
  const parsed = PresenterEditReviewSchema.safeParse({
    version: 1,
    planHash: "a".repeat(64),
    videoHash: "b".repeat(64),
    sourceHash: "c".repeat(64),
    durationFrames: 60,
    watched: true,
    decision: "REJECT",
    issues: ["audioSync"],
    timingApproval: true,
    notes: "El audio va adelantado.",
    reviewer: { kind: "human", name: "Marcos" },
    reviewedAt: new Date().toISOString(),
  });
  assert.equal(parsed.success, false);
});

test("the review surface is loopback-only and gated by its token", async () => {
  assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{48}\/$/);
  const page = await fetch(server.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.match(
    page.headers.get("content-security-policy") ?? "",
    /default-src 'none'/,
  );

  const wrongToken = server.url.replace(
    /\/[a-f0-9]{48}\/$/,
    `/${"0".repeat(48)}/`,
  );
  assert.equal((await fetch(wrongToken)).status, 404);
  assert.equal(
    (await fetch(server.url, { headers: { Origin: "https://evil.example" } }))
      .status,
    403,
  );
});

test("the montage is served with byte ranges so the reviewer can scrub", async () => {
  const whole = await fetch(`${server.url}video.mp4`);
  assert.equal(whole.status, 200);
  assert.equal(whole.headers.get("accept-ranges"), "bytes");
  assert.equal(Buffer.from(await whole.arrayBuffer()).equals(videoBytes), true);
  const part = await fetch(`${server.url}video.mp4`, {
    headers: { Range: "bytes=4-9" },
  });
  assert.equal(part.status, 206);
  assert.equal(
    part.headers.get("content-range"),
    `bytes 4-9/${videoBytes.length}`,
  );
  assert.equal(
    Buffer.from(await part.arrayBuffer()).toString(),
    videoBytes.subarray(4, 10).toString(),
  );
});

test("the plan travels to the page with the hashes it will be judged against", async () => {
  const body = (await (await fetch(`${server.url}plan.json`)).json()) as {
    plan: PresenterEditPlan;
    planHash: string;
    videoHash: string;
    reviewer: string;
  };
  assert.deepEqual(body.plan, plan());
  assert.equal(body.planHash, contentHash(plan()));
  assert.equal(body.videoHash, await fileHash(videoPath));
  assert.equal(body.reviewer, "Marcos");
});

test("an incoherent verdict is refused and nothing is written", async () => {
  const response = await fetch(`${server.url}verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...verdict, issues: ["pacing"] }),
  });
  assert.equal(response.status, 400);
  await assert.rejects(readFile(server.reviewPath), { code: "ENOENT" });
  assert.equal(server.review, null);
});

test("a saved verdict is sealed against the plan and the video that were watched", async () => {
  const response = await fetch(`${server.url}verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(verdict),
  });
  assert.equal(response.status, 200);
  const stored = PresenterEditReviewSchema.parse(
    JSON.parse(await readFile(server.reviewPath, "utf8")),
  );
  assert.equal(stored.decision, "ACCEPT");
  assert.equal(stored.timingApproval, true);
  assert.equal(stored.watched, true);
  assert.equal(stored.reviewer.kind, "human");
  // El veredicto no puede despegarse del par plan/vídeo que se revisó.
  assert.equal(stored.planHash, contentHash(plan()));
  assert.equal(stored.videoHash, await fileHash(videoPath));
  assert.equal(stored.sourceHash, plan().sourceHash);
  assert.deepEqual(await server.done, stored);
});

test("the server refuses to open on a video that is not the one declared", async () => {
  await assert.rejects(
    presenterReviewServer({
      workspace,
      plan: plan(),
      planHash: contentHash(plan()),
      videoPath,
      videoHash: "f".repeat(64),
      reviewer: "Marcos",
    }),
    /no coincide con el hash declarado/,
  );
});
