import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  writeFile,
  readFile,
  copyFile,
  open,
  readdir,
  unlink,
} from "node:fs/promises";
import { resolve, join } from "node:path";
import { randomUUID } from "node:crypto";
import { locateRecording } from "../src/infrastructure/audio/inspect";
import {
  createProductionPlan,
  transitionProduction,
  createNarrationManifest,
  narrationText,
  ProductionPlanSchema,
  requirementsFor,
} from "../src/application/production-plan";
import {
  acceptNarration,
  prepareProductionReel,
  finishPreparation,
  compilePreparedReel,
  durationDelta,
  PreparedReelSchema,
} from "../src/application/prepared-reel";
import { compileReelDraft } from "../src/application/generate-reel-content";
import { marcosIdeaDefaults } from "../src/application/editorial-prompt";
import { marcosVoice } from "../src/domain/voice";
import { marcosPresenter } from "../src/domain/presenter";
import {
  importRecording,
  inspectRecording,
} from "../src/infrastructure/audio/import-recording";
import { LocalEstimatedAlignment } from "../src/infrastructure/alignment/local-estimator";
import { fileHash } from "../src/infrastructure/audio/inspect";
import { contentHash } from "../src/snapshot/hash";
import { compileCompositionSnapshot } from "../src/snapshot/compile";
import {
  prepareProduction,
  importProduction,
  loadPreparedProduction,
} from "../src/infrastructure/production/operations";
import {
  privateRoot,
  assertInside,
  withProductionLock,
  readLocalJson,
} from "../src/infrastructure/production/local-files";
import {
  RecordingReviewSchema,
  type RecordingImport,
} from "../src/ports/recorded-narration";

// Technical waveform fixture only. These tones are not Marcos speaking or a product demo.
const runId = randomUUID();
const draft = compileReelDraft(
  {
    ...marcosIdeaDefaults,
    topic: "Prueba técnica sintética",
    targetDurationMs: 15000,
  },
  {
    title: `Prueba técnica ${runId}`,
    scenes: [
      {
        narration: "Prueba técnica de audio sintético.",
        purpose: "hook",
        visualIntent: { kind: "textOnly", description: "Texto de prueba" },
        estimatedDurationMs: 5000,
        onScreenText: "Prueba técnica",
      },
      {
        narration: "Estos tonos no representan una narración real.",
        purpose: "closing",
        visualIntent: { kind: "textOnly", description: "Aviso de prueba" },
        estimatedDurationMs: 10000,
        onScreenText: "Sin voz real",
      },
    ],
  },
);
const initial = createProductionPlan(draft);
const waiting = transitionProduction(initial, { kind: "waitingForNarration" });
const workspace = resolve(".");
let audioPath: string,
  imported: RecordingImport,
  reviewed: ReturnType<typeof review>,
  destination: string;
function review(recordingHash: string, plan = waiting) {
  return {
    productionId: plan.id,
    draftContentHash: plan.draftContentHash,
    narrationHash: plan.narrationHash,
    recordingHash,
    exactScriptRead: true as const,
    boundariesReviewed: true as const,
    sceneIds: plan.draft.scenes.map((s) => s.id),
    sceneBoundariesMs: [2000],
  };
}
function wave(seconds = 4, sampleRate = 44100) {
  const count = Math.round(seconds * sampleRate),
    bytes = Buffer.alloc(44 + count * 2);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24);
  bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    bytes.writeInt16LE(
      (t > 0.2 && t < 1.8) || (t > 2.2 && t < 3.8)
        ? Math.round(Math.sin(2 * Math.PI * 440 * t) * 8000)
        : 0,
      44 + i * 2,
    );
  }
  return bytes;
}
function pcm(bytes: Buffer) {
  for (let i = 12; i + 8 <= bytes.length;) {
    const size = bytes.readUInt32LE(i + 4);
    if (bytes.toString("ascii", i, i + 4) === "data")
      return bytes.subarray(i + 8, i + 8 + size);
    i += 8 + size + (size % 2);
  }
  throw new Error("Missing PCM data");
}
before(async () => {
  const recordings = await privateRoot(workspace, "recordings");
  audioPath = resolve(recordings, `synthetic-test-${runId}.wav`);
  await writeFile(audioPath, wave());
  reviewed = review(await fileHash(audioPath));
  destination = resolve(
    await privateRoot(workspace, "productions"),
    `synthetic-test-${runId}`,
  );
  await mkdir(destination);
  imported = await importRecording(
    workspace,
    waiting,
    audioPath,
    reviewed,
    destination,
  );
});
after(async () => {
  const root = await privateRoot(workspace, "recordings");
  for (const file of await readdir(root)) {
    if (file.includes(runId))
      await unlink(await assertInside(root, resolve(root, file)));
  }
});
test("Draft produces a stable plan with exact Marcos identities and preserved scene scripts", () => {
  assert.deepEqual(createProductionPlan(structuredClone(draft)), initial);
  assert.equal(initial.draftContentHash, contentHash(draft));
  assert.deepEqual(initial.voiceProfile, marcosVoice);
  assert.deepEqual(initial.presenter, marcosPresenter);
  assert.equal(initial.narrationSource.kind, "recorded");
  assert.deepEqual(initial.draft.scenes, draft.scenes);
  assert.equal(initial.state.kind, "draft");
  assert.equal(waiting.state.kind, "waitingForNarration");
});
test("Manifest and human script preserve every narration and editorial target", () => {
  const manifest = createNarrationManifest(waiting),
    human = narrationText(waiting);
  assert.equal(manifest.fullScript, draft.fullNarration);
  assert.equal(manifest.voiceProfileId, "voice-marcos");
  assert.equal(manifest.narrationHash, waiting.narrationHash);
  manifest.scenes.forEach((scene, i) => {
    assert.equal(scene.narration, draft.scenes[i].narration);
    assert.equal(scene.order, i);
    assert.ok(human.includes(`ESCENA ${i + 1}`));
    assert.ok(human.includes(scene.narration));
  });
  assert.match(human, /orientativos/);
  assert.match(human, /no aceleres/);
});
test("Plan rejects stale text/hash, mismatched presenter/voice and invented assets", () => {
  for (const update of [
    { draftContentHash: "0".repeat(64) },
    { narrationHash: "0".repeat(64) },
    { presenter: { ...marcosPresenter, defaultVoiceProfileId: "other" } },
    { draft: { ...draft, title: "Edited" } },
    {
      assetRequirements: waiting.assetRequirements.map((a) => ({
        ...a,
        status: "ready",
      })),
    },
  ])
    assert.equal(
      ProductionPlanSchema.safeParse({ ...waiting, ...update }).success,
      false,
    );
});
test("All visual intents map to explicit requirements; none are silently resolved", () => {
  for (const [kind, type] of [
    ["avatarTalking", "presenter"],
    ["screenDemo", "screenCapture"],
    ["broll", "broll"],
    ["image", "image"],
    ["textOnly", "none"],
  ] as const) {
    const changed = structuredClone(draft);
    changed.scenes[0].visualIntent.kind = kind;
    const requirement = requirementsFor(changed)[0];
    assert.equal(requirement.type, type);
    assert.equal(
      requirement.status,
      kind === "textOnly" ? "notRequired" : "pending",
    );
  }
});
test("State machine rejects skipped transitions and impossible payloads", () => {
  assert.throws(
    () => transitionProduction(waiting, { kind: "waitingForNarration" }),
    { code: "INVALID_STATE" },
  );
  assert.equal(
    ProductionPlanSchema.safeParse({
      ...waiting,
      state: { kind: "renderable" },
    }).success,
    false,
  );
  assert.throws(
    () =>
      transitionProduction(initial, {
        kind: "narrationReady",
        receipt: {
          recordingHash: "0".repeat(64),
          narrationHash: initial.narrationHash,
          importHash: "0".repeat(64),
        },
      }),
    { code: "INVALID_STATE" },
  );
});
test("No narration means no prepared reel or renderable snapshot", () => {
  assert.throws(
    () =>
      prepareProductionReel(waiting, imported, new LocalEstimatedAlignment()),
    { code: "INVALID_STATE" },
  );
  const accepted = acceptNarration(waiting, imported),
    prepared = prepareProductionReel(
      accepted,
      imported,
      new LocalEstimatedAlignment(),
    );
  assert.throws(() => compilePreparedReel(waiting, prepared), {
    code: "INVALID_STATE",
  });
});
test("Recorded import measures codec/rate/channels, preserves original and every PCM sample", async () => {
  assert.equal(await fileHash(audioPath), reviewed.recordingHash);
  assert.equal(imported.source.sampleRate, 44100);
  assert.equal(imported.source.channels, 1);
  assert.equal(imported.source.codec, "pcm_s16le");
  assert.equal(imported.normalized.sampleRate, 48000);
  assert.equal(imported.normalized.durationSamples, 192000);
  assert.equal(imported.normalized.measuredDurationMs, 4000);
  const original = pcm(await readFile(resolve(destination, "normalized.wav")));
  const pieces = await Promise.all(
    imported.segments.map(async (s) =>
      pcm(await readFile(resolve(destination, s.path))),
    ),
  );
  assert.deepEqual(Buffer.concat(pieces), original);
  assert.equal(imported.segments[0].sourceEndSample, 96000);
  assert.equal(imported.measurementSource, "MEASURED");
});
test("Review must bind exact script, source hash, scene order and explicit human assertions", async () => {
  for (const patch of [
    { recordingHash: "0".repeat(64) },
    { narrationHash: "0".repeat(64) },
    { sceneIds: [...reviewed.sceneIds].reverse() },
    { draftContentHash: "0".repeat(64) },
  ])
    await assert.rejects(
      importRecording(
        workspace,
        waiting,
        audioPath,
        { ...reviewed, ...patch },
        destination,
      ),
      { code: "INVALID_REVIEW" },
    );
  assert.equal(
    RecordingReviewSchema.safeParse({ ...reviewed, exactScriptRead: false })
      .success,
    false,
  );
  assert.equal(
    RecordingReviewSchema.safeParse({ ...reviewed, boundariesReviewed: false })
      .success,
    false,
  );
});
test("Cuts inside speech are rejected without changing plan state", async () => {
  const target = resolve(destination, "bad-cut");
  await mkdir(target);
  await assert.rejects(
    importRecording(
      workspace,
      waiting,
      audioPath,
      { ...reviewed, sceneBoundariesMs: [1000] },
      target,
    ),
    { code: "INVALID_REVIEW" },
  );
  assert.equal(waiting.state.kind, "waitingForNarration");
});
test("Silence-only scene is rejected and never promoted to narrationReady", async () => {
  const silent = Buffer.from(wave());
  silent.fill(0, 44);
  const path = resolve(
    await privateRoot(workspace, "recordings"),
    `silent-${runId}.wav`,
  );
  await writeFile(path, silent);
  const target = resolve(destination, "silent");
  await mkdir(target);
  await assert.rejects(
    importRecording(
      workspace,
      waiting,
      path,
      review(await fileHash(path)),
      target,
    ),
  );
});
test("Invalid, oversized, unsupported and too-long audio is rejected", async () => {
  const root = await privateRoot(workspace, "recordings");
  const invalid = resolve(root, `invalid-${runId}.wav`);
  await writeFile(invalid, "not audio");
  await assert.rejects(inspectRecording(workspace, invalid), {
    code: "INVALID_AUDIO",
  });
  const large = resolve(root, `large-${runId}.wav`);
  const handle = await open(large, "w");
  await handle.truncate(50 * 1024 * 1024 + 1);
  await handle.close();
  await assert.rejects(inspectRecording(workspace, large), {
    code: "INVALID_AUDIO",
  });
  const long = resolve(root, `long-${runId}.wav`);
  await writeFile(long, wave(61));
  await assert.rejects(inspectRecording(workspace, long), {
    code: "INVALID_AUDIO",
  });
  const unsupported = resolve(root, `unsupported-${runId}.txt`);
  await writeFile(unsupported, wave());
  await assert.rejects(inspectRecording(workspace, unsupported), {
    code: "INVALID_AUDIO",
  });
});
test("Existing Marcos reference is refused even when copied under another filename", async () => {
  const path = resolve(
    await privateRoot(workspace, "recordings"),
    `reserved-reference-${runId}.m4a`,
  );
  await copyFile(await locateRecording(resolve(".")), path);
  await assert.rejects(inspectRecording(workspace, path), {
    code: "INVALID_AUDIO",
  });
});
test("Audio cannot be imported from source/public/remote paths", async () => {
  await assert.rejects(inspectRecording(workspace, resolve("README.md")), {
    code: "UNSAFE_PATH",
  });
  await assert.rejects(
    assertInside(destination, "\\\\server\\share\\audio.wav"),
    { code: "UNSAFE_PATH" },
  );
  await assert.rejects(assertInside(destination, resolve("public")), {
    code: "UNSAFE_PATH",
  });
});
test("Duration deviations preserve editorial intent and measured timing separately", () => {
  assert.deepEqual(durationDelta(15000, 4000), {
    estimatedDurationMs: 15000,
    measuredDurationMs: 4000,
    deltaMs: -11000,
    deltaPercent: -73.33,
  });
  assert.deepEqual(durationDelta(1000, 1500), {
    estimatedDurationMs: 1000,
    measuredDurationMs: 1500,
    deltaMs: 500,
    deltaPercent: 50,
  });
  assert.throws(() => durationDelta(0, 1000), { code: "INVALID_AUDIO" });
});
test("PreparedReel uses measured durations and compiles through the existing compiler", () => {
  const accepted = acceptNarration(waiting, imported),
    prepared = prepareProductionReel(
      accepted,
      imported,
      new LocalEstimatedAlignment(),
    ),
    plan = finishPreparation(accepted, prepared);
  assert.equal(accepted.state.kind, "narrationReady");
  assert.equal(plan.state.kind, "renderable");
  assert.ok(PreparedReelSchema.safeParse(prepared).success);
  assert.equal(prepared.delta.estimatedDurationMs, 15000);
  assert.equal(prepared.delta.measuredDurationMs, 4000);
  assert.equal(prepared.captionTiming, "ESTIMATED");
  assert.equal(prepared.theme.captionStyle.highlightActive, false);
  const result = compilePreparedReel(plan, prepared);
  assert.equal(result.snapshot.durationInFrames, 120);
  assert.deepEqual(
    result.snapshot,
    compileCompositionSnapshot(result.reel, result.assets),
  );
  assert.deepEqual(
    result.snapshot,
    compilePreparedReel(plan, structuredClone(prepared)).snapshot,
  );
  assert.equal(result.reel.scenes[0].audio.measuredDurationMs, 2000);
  assert.equal(
    result.reel.scenes[0].targetDurationMs,
    draft.scenes[0].estimatedDurationMs,
  );
});
test("Pending presenter remains pending after real media preparation and blocks render", () => {
  const changed = structuredClone(draft);
  changed.scenes[0].visualIntent.kind = "avatarTalking";
  const pending = transitionProduction(createProductionPlan(changed), {
    kind: "waitingForNarration",
  });
  const technicalImport = structuredClone(imported);
  technicalImport.review = review(imported.source.contentHash, pending);
  const accepted = acceptNarration(pending, technicalImport),
    prepared = prepareProductionReel(
      accepted,
      technicalImport,
      new LocalEstimatedAlignment(),
    ),
    plan = finishPreparation(accepted, prepared);
  assert.equal(plan.state.kind, "prepared");
  assert.equal(prepared.assetRequirements[0].status, "pending");
  assert.throws(() => compilePreparedReel(plan, prepared), {
    code: "INVALID_STATE",
  });
  if (plan.state.kind !== "prepared") assert.fail();
  const preparedState = plan.state;
  assert.throws(() =>
    transitionProduction(plan, { ...preparedState, kind: "renderable" }),
  );
});
test("Prepared tampering, missing captions and stale receipts cannot be rendered", () => {
  const accepted = acceptNarration(waiting, imported),
    prepared = prepareProductionReel(
      accepted,
      imported,
      new LocalEstimatedAlignment(),
    ),
    plan = finishPreparation(accepted, prepared);
  const altered = structuredClone(prepared);
  altered.scenes[0].narration = "Texto distinto.";
  assert.throws(() => compilePreparedReel(plan, altered));
  const missingCaptions = structuredClone(prepared);
  missingCaptions.scenes[0].captions.tokens = [];
  assert.equal(PreparedReelSchema.safeParse(missingCaptions).success, false);
  assert.throws(
    () => finishPreparation(accepted, { ...prepared, title: "Otro" }),
    { code: "STALE_ARTIFACT" },
  );
  assert.equal(
    PreparedReelSchema.safeParse({
      ...prepared,
      delta: { ...prepared.delta, deltaMs: 0 },
    }).success,
    false,
  );
  const broken = structuredClone(imported);
  broken.segments[1].sourceStartSample++;
  assert.throws(() => acceptNarration(waiting, broken), {
    code: "INVALID_AUDIO",
  });
  const wrong = structuredClone(imported);
  wrong.source.contentHash = "0".repeat(64);
  assert.throws(() => acceptNarration(waiting, wrong), {
    code: "INVALID_REVIEW",
  });
});
test("Rendered is terminal and requires preservation of prepared and narration identity", () => {
  const accepted = acceptNarration(waiting, imported),
    prepared = prepareProductionReel(
      accepted,
      imported,
      new LocalEstimatedAlignment(),
    ),
    plan = finishPreparation(accepted, prepared);
  if (plan.state.kind !== "renderable") assert.fail();
  const renderableState = plan.state;
  const rendered = transitionProduction(plan, {
    ...plan.state,
    kind: "rendered",
    videoHash: "1".repeat(64),
  });
  assert.equal(rendered.state.kind, "rendered");
  assert.throws(
    () => transitionProduction(rendered, { kind: "waitingForNarration" }),
    { code: "INVALID_STATE" },
  );
  assert.throws(
    () =>
      transitionProduction(plan, {
        ...renderableState,
        kind: "rendered",
        videoHash: "1".repeat(64),
        preparedHash: "2".repeat(64),
      }),
    { code: "INVALID_STATE" },
  );
});
test("Filesystem production flow writes manifest, is idempotent and commits only valid imports", async () => {
  const file = resolve(destination, "draft.json");
  await writeFile(
    file,
    JSON.stringify({ draft, generation: { contentHash: contentHash(draft) } }),
  );
  const result = await prepareProduction(workspace, file);
  assert.equal(result.plan.state.kind, "waitingForNarration");
  assert.deepEqual(
    (await prepareProduction(workspace, file)).plan,
    result.plan,
  );
  const manifest = await readLocalJson(
    resolve(result.directory, "narration-manifest.json"),
  );
  assert.deepEqual(manifest, createNarrationManifest(result.plan));
  const reviewPath = resolve(destination, "review.json");
  await writeFile(reviewPath, JSON.stringify(reviewed));
  const planPath = resolve(result.directory, "production-plan.json");
  const resultImport = await importProduction(
    workspace,
    planPath,
    audioPath,
    reviewPath,
  );
  assert.equal(resultImport.plan.state.kind, "renderable");
  const loaded = await loadPreparedProduction(workspace, planPath);
  assert.equal(
    compilePreparedReel(loaded.plan, loaded.prepared).snapshot.durationInFrames,
    120,
  );
  await assert.rejects(
    importProduction(workspace, planPath, audioPath, reviewPath),
    { code: "INVALID_STATE" },
  );
  assert.equal(
    (await prepareProduction(workspace, file)).plan.state.kind,
    "renderable",
  );
});
test("Production operation lock prevents concurrent mutations", async () => {
  await withProductionLock(destination, async () => {
    await assert.rejects(
      withProductionLock(destination, async () => undefined),
      { code: "BUSY" },
    );
  });
});
test("Failed file import preserves waiting state and leaves no accepted receipt", async () => {
  const changed = { ...draft, title: `Failed import ${runId}` };
  const file = resolve(destination, "failed-draft.json");
  await writeFile(file, JSON.stringify(changed));
  const result = await prepareProduction(workspace, file);
  const reviewPath = resolve(destination, "failed-review.json");
  await writeFile(
    reviewPath,
    JSON.stringify(review("0".repeat(64), result.plan)),
  );
  const planPath = resolve(result.directory, "production-plan.json");
  await assert.rejects(
    importProduction(workspace, planPath, audioPath, reviewPath),
    { code: "INVALID_REVIEW" },
  );
  assert.deepEqual(
    ProductionPlanSchema.parse(await readLocalJson(planPath)),
    result.plan,
  );
});
test("Production path has no text generation dependency and no new public audio", async () => {
  for (const path of [
    "src/application/production-plan.ts",
    "src/application/prepared-reel.ts",
    "src/infrastructure/audio/import-recording.ts",
    "src/infrastructure/production/operations.ts",
    "scripts/production.ts",
    "scripts/render-production.ts",
  ]) {
    assert.doesNotMatch(
      await readFile(path, "utf8"),
      /TextProvider|generateReelContent|infrastructure\/text|ports\/text-provider|ollama/i,
      path,
    );
  }
  const check = async (directory: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      assert.doesNotMatch(
        entry.name,
        /synthetic-test|reserved-reference|production-|normalized/,
      );
      if (entry.isDirectory()) await check(join(directory, entry.name));
    }
  };
  await check(resolve("public"));
  assert.match(await readFile(".gitignore", "utf8"), /\.local\//);
});
test("Unsupported locale and orientation cannot silently enter the existing renderer", async () => {
  const english = transitionProduction(
    createProductionPlan(
      { ...draft, locale: "en-US" },
      {
        voiceProfile: { ...marcosVoice, locale: "en-US" },
        presenter: marcosPresenter,
      },
    ),
    { kind: "waitingForNarration" },
  );
  await assert.rejects(
    importRecording(
      workspace,
      english,
      audioPath,
      review(imported.source.contentHash, english),
      destination,
    ),
    { code: "UNSUPPORTED" },
  );
  const changed = structuredClone(draft);
  changed.orientation = "horizontal";
  const plan = transitionProduction(createProductionPlan(changed), {
    kind: "waitingForNarration",
  });
  const audio = structuredClone(imported);
  audio.review = review(audio.source.contentHash, plan);
  const accepted = acceptNarration(plan, audio);
  assert.throws(
    () => prepareProductionReel(accepted, audio, new LocalEstimatedAlignment()),
    { code: "UNSUPPORTED" },
  );
});
