import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  PresenterEditPlanSchema,
  sourceToOutputFrame,
  type PresenterEditPlan,
} from "../src/domain/presenter-edit";
import {
  trimMontageStart,
  captionBoundaryNear,
} from "../src/application/trim-montage";

function plan(): PresenterEditPlan {
  return PresenterEditPlanSchema.parse({
    version: 1,
    sourceHash: "a".repeat(64),
    rawTranscriptHash: "b".repeat(64),
    reviewedTranscriptHash: "c".repeat(64),
    fps: 30,
    durationFrames: 300,
    segments: [
      {
        sourceStartFrame: 10,
        sourceEndFrame: 100,
        outputStartFrame: 0,
        scale: 1,
        reason: "entrada",
      },
      {
        sourceStartFrame: 200,
        sourceEndFrame: 410,
        outputStartFrame: 90,
        scale: 1.04,
        reason: "cuerpo",
      },
    ],
    captions: [
      {
        startFrame: 0,
        endFrame: 60,
        text: "primera",
        reviewedWordIds: [0],
        timingSource: "MODEL_ESTIMATED_HUMAN_TEXT",
      },
      {
        startFrame: 60,
        endFrame: 150,
        text: "segunda",
        reviewedWordIds: [1],
        timingSource: "MODEL_ESTIMATED_HUMAN_TEXT",
      },
    ],
    overlays: [{ startFrame: 20, endFrame: 200, kind: "checklist" }],
  });
}

test("trimming the opening keeps the rest of the montage coherent", () => {
  // Frame 60 es frontera entre subtítulos: no parte ninguna palabra.
  const trimmed = trimMontageStart(plan(), 60);
  assert.equal(trimmed.durationFrames, 240);
  // El primer tramo pierde sus 60 frames de cabeza, en origen y en salida.
  assert.equal(trimmed.segments[0].sourceStartFrame, 70);
  assert.equal(trimmed.segments[0].outputStartFrame, 0);
  assert.equal(trimmed.segments[1].sourceStartFrame, 200);
  assert.equal(trimmed.segments[1].outputStartFrame, 30);
  // El subtítulo que quedaba antes del corte desaparece; el otro se desplaza.
  assert.equal(trimmed.captions.length, 1);
  assert.equal(trimmed.captions[0].text, "segunda");
  assert.deepEqual(
    [trimmed.captions[0].startFrame, trimmed.captions[0].endFrame],
    [0, 90],
  );
  // El apoyo cruzaba el corte: se recorta, no se pierde.
  assert.deepEqual(
    [trimmed.overlays[0].startFrame, trimmed.overlays[0].endFrame],
    [0, 140],
  );
});

test("a trim that would split a caption is refused", () => {
  // 30 cae dentro de "primera" (0–60): partirlo sonaría a error.
  assert.throws(() => trimMontageStart(plan(), 30), /parte el subtítulo/);
  assert.throws(() => trimMontageStart(plan(), 300), /montaje entero/);
  assert.deepEqual(trimMontageStart(plan(), 0), plan());
});

test("the trimmed plan still maps source frames to output frames", () => {
  const trimmed = trimMontageStart(plan(), 60);
  // El frame 70 de origen es ahora el primero de la salida.
  assert.equal(sourceToOutputFrame(trimmed, 70), 0);
  // Lo eliminado ya no tiene sitio en la salida.
  assert.equal(sourceToOutputFrame(trimmed, 10), null);
  assert.equal(sourceToOutputFrame(trimmed, 200), 30);
});

test("the real 1K montage trims at its own caption boundaries", async () => {
  const base = PresenterEditPlanSchema.parse(
    JSON.parse(
      await readFile(resolve(".local/phase-1k/edit-plan.json"), "utf8"),
    ),
  );
  // Elegir por segundos no debe caer nunca a mitad de palabra.
  for (const seconds of [0.5, 1.2, 2, 3.7, 5]) {
    const frame = captionBoundaryNear(base, seconds);
    assert.doesNotThrow(() => trimMontageStart(base, frame), String(seconds));
  }
  const directo = trimMontageStart(base, 147);
  assert.equal(directo.captions[0].text, "Primero, la IA");
  assert.ok(directo.durationFrames < base.durationFrames);
});
