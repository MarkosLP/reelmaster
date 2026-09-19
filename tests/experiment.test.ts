import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { PresenterEditPlanSchema } from "../src/domain/presenter-edit";
import {
  ReelExperimentSchema,
  ReelFingerprintSchema,
} from "../src/domain/reel-experiment";
import {
  fingerprintPresenterPlan,
  fingerprintSnapshot,
} from "../src/application/fingerprint";
import {
  saveExperiment,
  readExperiments,
} from "../src/infrastructure/review/experiments";
import { demo, assets } from "../src/fixtures/demo";
import {
  compileCompositionSnapshot,
  type AssetManifest,
} from "../src/snapshot/compile";

const workspace = resolve(".");

function plan() {
  return PresenterEditPlanSchema.parse({
    version: 1,
    sourceHash: "a".repeat(64),
    rawTranscriptHash: "b".repeat(64),
    reviewedTranscriptHash: "c".repeat(64),
    fps: 30,
    durationFrames: 300,
    segments: [
      {
        sourceStartFrame: 0,
        sourceEndFrame: 90,
        outputStartFrame: 0,
        scale: 1,
        reason: "hook",
      },
      {
        sourceStartFrame: 120,
        sourceEndFrame: 330,
        outputStartFrame: 90,
        scale: 1.04,
        reason: "cuerpo",
      },
    ],
    captions: [
      {
        startFrame: 0,
        endFrame: 60,
        text: "una dos tres",
        reviewedWordIds: [0],
        timingSource: "MODEL_ESTIMATED_HUMAN_TEXT",
      },
      {
        startFrame: 60,
        endFrame: 150,
        text: "cuatro cinco",
        reviewedWordIds: [1],
        timingSource: "MODEL_ESTIMATED_HUMAN_TEXT",
      },
    ],
    overlays: [{ startFrame: 30, endFrame: 90, kind: "checklist" }],
  });
}

test("the presenter fingerprint counts what is actually in the montage", () => {
  const f = fingerprintPresenterPlan(plan());
  assert.equal(f.template, "presenter");
  assert.equal(f.durationSeconds, 10);
  // El primer corte entra en el frame 90 de salida: 3 segundos.
  assert.equal(f.firstCutSeconds, 3);
  assert.equal(f.cuts, 2);
  assert.equal(f.cutsPerMinute, 12);
  assert.equal(f.captions, 2);
  assert.equal(f.wordsPerCaption, 2.5);
  // 150 de 300 frames con texto, 60 de 300 con apoyo.
  assert.equal(f.textOnScreenRatio, 0.5);
  assert.equal(f.overlayRatio, 0.2);
  assert.equal(f.punchIns, 1);
  assert.equal(f.closingStartRatio, 0.3);
});

test("both templates produce the same shape, so they can be compared", () => {
  const snapshot = compileCompositionSnapshot(demo, assets as AssetManifest);
  const typography = fingerprintSnapshot(snapshot);
  const presenter = fingerprintPresenterPlan(plan());
  assert.equal(typography.template, "typography");
  // Lo que solo existe en presentador vale 0 en tipografía, nunca se inventa.
  assert.equal(typography.overlayRatio, 0);
  assert.equal(typography.punchIns, 0);
  assert.deepEqual(
    Object.keys(typography).sort(),
    Object.keys(presenter).sort(),
  );
  assert.ok(ReelFingerprintSchema.safeParse(typography).success);
  assert.ok(typography.cuts === snapshot.scenes.length);
});

test("an experiment cannot carry numbers for something unpublished", () => {
  const base = {
    version: 1,
    reelId: "x/y",
    videoHash: "d".repeat(64),
    fingerprint: fingerprintPresenterPlan(plan()),
    platform: "instagram",
    notes: "",
  };
  const when = "2026-09-19T10:00:00.000Z";
  assert.ok(
    ReelExperimentSchema.safeParse({
      ...base,
      publishedAt: null,
      metrics: null,
      measuredAt: null,
    }).success,
  );
  for (const bad of [
    // Números sin publicación.
    { publishedAt: null, metrics: { likes: 10 }, measuredAt: when },
    // Medición sin fecha, y fecha sin medición.
    { publishedAt: when, metrics: { likes: 10 }, measuredAt: null },
    { publishedAt: when, metrics: null, measuredAt: when },
    // Medido antes de publicar.
    {
      publishedAt: when,
      metrics: { likes: 10 },
      measuredAt: "2026-09-18T10:00:00.000Z",
    },
    // Una medición vacía no es una medición.
    { publishedAt: when, metrics: {}, measuredAt: when },
  ])
    assert.equal(
      ReelExperimentSchema.safeParse({ ...base, ...bad }).success,
      false,
      JSON.stringify(bad),
    );
});

test("a saved experiment is stored under the hash of what was published", async () => {
  const videoHash = randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64);
  const fingerprint = fingerprintPresenterPlan(plan());
  const { path, experiment } = await saveExperiment(workspace, {
    reelId: "prueba/experimento",
    videoHash,
    fingerprint,
    publishedAt: "2026-09-19T10:00:00.000Z",
    metrics: { likes: 42, saves: 7 },
    notes: "prueba",
  });
  try {
    assert.ok(path.endsWith(`${videoHash}.json`));
    assert.equal(experiment.metrics?.likes, 42);
    // measuredAt lo pone quien guarda, no quien escribe el número.
    assert.ok(experiment.measuredAt);
    const stored = ReelExperimentSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
    assert.deepEqual(stored.fingerprint, fingerprint);
    const all = await readExperiments(workspace);
    assert.deepEqual(all.get(videoHash), stored);
  } finally {
    await rm(path, { force: true });
  }
});
