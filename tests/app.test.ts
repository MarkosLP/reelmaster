import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { reelApp } from "../src/infrastructure/review/app";

let app: Awaited<ReturnType<typeof reelApp>>;

before(async () => {
  app = await reelApp({ workspace: resolve("."), reviewer: "Marcos" });
});
after(async () => {
  await app.close();
});

test("the app is loopback-only and gated by its token", async () => {
  assert.match(app.url, /^http:\/\/127\.0\.0\.1:\d+\/[a-f0-9]{48}\/$/);
  const page = await fetch(app.url);
  assert.equal(page.status, 200);
  assert.match(page.headers.get("content-type") ?? "", /text\/html/);
  assert.match(
    page.headers.get("content-security-policy") ?? "",
    /default-src 'none'/,
  );
  const wrong = app.url.replace(/\/[a-f0-9]{48}\/$/, `/${"0".repeat(48)}/`);
  assert.equal((await fetch(wrong)).status, 404);
  assert.equal(
    (await fetch(app.url, { headers: { Origin: "https://evil.example" } }))
      .status,
    403,
  );
});

test("the library lists the delivered reels and flags which one can be reviewed", async () => {
  const body = (await (await fetch(`${app.url}api/library.json`)).json()) as {
    reels: { id: string; phase: string; plan: boolean; bytes: number }[];
    productions: { title: string; state: string }[];
  };
  assert.ok(body.reels.length > 0, "debería encontrar entregas en out/");
  for (const reel of body.reels) assert.ok(reel.bytes > 0);
  // Solo el montaje con edit-plan.json es revisable; el resto se ve y ya.
  assert.deepEqual(
    body.reels.filter((r) => r.plan).map((r) => r.phase),
    app.reels.filter((r) => r.plan).map((r) => r.phase),
  );
  // Las producciones listadas son trabajo real, nunca residuo de tests.
  for (const production of body.productions)
    assert.ok(["rendered", "prepared"].includes(production.state));
});

test("an unknown reel is not served", async () => {
  assert.equal((await fetch(`${app.url}r/no-existe/video.mp4`)).status, 404);
  assert.equal((await fetch(`${app.url}r/no-existe/plan.json`)).status, 404);
});

test("a reel without a montage plan can be watched but not judged", async () => {
  const plain = app.reels.find((r) => !r.plan);
  if (!plain) return;
  const id = encodeURIComponent(plain.id);
  const head = await fetch(`${app.url}r/${id}/video.mp4`, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get("accept-ranges"), "bytes");
  assert.equal((await fetch(`${app.url}r/${id}/plan.json`)).status, 404);
  assert.equal((await fetch(`${app.url}r/${id}/review`)).status, 404);
});

test("a reviewable montage serves its plan with the hashes it will be judged against", async () => {
  const reviewable = app.reels.find((r) => r.plan);
  if (!reviewable) return;
  const id = encodeURIComponent(reviewable.id);
  assert.equal((await fetch(`${app.url}r/${id}/review`)).status, 200);
  const body = (await (await fetch(`${app.url}r/${id}/plan.json`)).json()) as {
    planHash: string;
    videoHash: string;
  };
  assert.equal(body.planHash, reviewable.planHash);
  assert.equal(body.videoHash, reviewable.videoHash);
  // El veredicto se valida antes de tocar el disco.
  const bad = await fetch(`${app.url}r/${id}/verdict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      decision: "ACCEPT",
      issues: ["pacing"],
      timingApproval: true,
      notes: "incoherente a propósito",
    }),
  });
  assert.equal(bad.status, 400);
});
