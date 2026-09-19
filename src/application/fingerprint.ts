import {
  ReelFingerprintSchema,
  type ReelFingerprint,
} from "../domain/reel-experiment";
import type { PresenterEditPlan } from "../domain/presenter-edit";
import type { CompositionSnapshot } from "../snapshot/types";

// La huella se define igual para las dos plantillas para poder compararlas:
// "corte" es cada tramo con su propio comienzo, y el cierre es el último.
// Lo que solo existe en una plantilla vale 0 en la otra, nunca se inventa.
const round = (value: number, places = 2) => Number(value.toFixed(places)) || 0;

function build(input: {
  template: ReelFingerprint["template"];
  fps: number;
  totalFrames: number;
  cutStarts: number[];
  captionSpans: { start: number; end: number; words: number }[];
  overlayFrames: number;
  punchIns: number;
}): ReelFingerprint {
  const { fps, totalFrames, cutStarts, captionSpans } = input;
  const seconds = totalFrames / fps;
  const onScreen = captionSpans.reduce(
    (total, c) => total + Math.max(0, c.end - c.start),
    0,
  );
  const words = captionSpans.reduce((total, c) => total + c.words, 0);
  return ReelFingerprintSchema.parse({
    template: input.template,
    durationSeconds: round(seconds),
    // Cuánto aguanta el reel antes de su primer cambio de plano.
    firstCutSeconds: round((cutStarts[1] ?? totalFrames) / fps),
    cuts: cutStarts.length,
    cutsPerMinute: round((cutStarts.length / seconds) * 60),
    captions: captionSpans.length,
    wordsPerCaption: captionSpans.length
      ? round(words / captionSpans.length)
      : 0,
    textOnScreenRatio: round(Math.min(1, onScreen / totalFrames), 3),
    overlayRatio: round(Math.min(1, input.overlayFrames / totalFrames), 3),
    punchIns: input.punchIns,
    // Dónde arranca el último tramo: el cierre o la llamada a la acción.
    closingStartRatio: round((cutStarts.at(-1) ?? 0) / totalFrames, 3),
  });
}

export function fingerprintPresenterPlan(
  plan: PresenterEditPlan,
): ReelFingerprint {
  return build({
    template: "presenter",
    fps: plan.fps,
    totalFrames: plan.durationFrames,
    cutStarts: plan.segments.map((s) => s.outputStartFrame),
    captionSpans: plan.captions.map((c) => ({
      start: c.startFrame,
      end: c.endFrame,
      words: c.text.trim().split(/\s+/).filter(Boolean).length,
    })),
    overlayFrames: plan.overlays.reduce(
      (total, o) => total + (o.endFrame - o.startFrame),
      0,
    ),
    punchIns: plan.segments.filter((s) => s.scale > 1).length,
  });
}

export function fingerprintSnapshot(
  snapshot: CompositionSnapshot,
): ReelFingerprint {
  // Los frames de una línea son relativos a su escena, que es lo que recibe
  // el Sequence; hay que llevarlos al tiempo del reel para poder sumarlos.
  const spans = snapshot.scenes.flatMap((scene) =>
    scene.lines.map((line) => ({
      start: scene.startFrame + line.startFrame,
      end: scene.startFrame + line.endFrame,
      words: line.tokens.length,
    })),
  );
  return build({
    template: "typography",
    fps: snapshot.profile.fps,
    totalFrames: snapshot.durationInFrames,
    cutStarts: snapshot.scenes.map((s) => s.startFrame),
    captionSpans: spans,
    // La plantilla tipográfica no tiene apoyos ni punch-ins.
    overlayFrames: 0,
    punchIns: 0,
  });
}
