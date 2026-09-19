import {
  PresenterEditPlanSchema,
  type PresenterEditPlan,
} from "../domain/presenter-edit";

// Recorta la entrada de un montaje: tira todo lo anterior a `startOutputFrame`
// y reubica lo que queda al comienzo. Sirve para probar ganchos distintos
// sobre la misma toma, que es la única forma de saber si acortar la entrada
// cambia algo sin cambiar también la interpretación.
//
// No parte palabras: el corte debe caer en la frontera de un subtítulo, y se
// rechaza si no es así. Un subtítulo partido suena a error, no a decisión.
export function trimMontageStart(
  plan: PresenterEditPlan,
  startOutputFrame: number,
): PresenterEditPlan {
  if (startOutputFrame <= 0) return plan;
  if (startOutputFrame >= plan.durationFrames)
    throw new Error("El recorte se comería el montaje entero");
  const straddled = plan.captions.find(
    (c) => c.startFrame < startOutputFrame && c.endFrame > startOutputFrame,
  );
  if (straddled)
    throw new Error(
      `El corte parte el subtítulo "${straddled.text}"; elige una frontera`,
    );

  let cursor = 0;
  const segments = plan.segments.flatMap((segment) => {
    const length = segment.sourceEndFrame - segment.sourceStartFrame;
    const end = segment.outputStartFrame + length;
    if (end <= startOutputFrame) return [];
    // Del segmento que contiene el corte solo sobrevive su segunda mitad.
    const inside = Math.max(0, startOutputFrame - segment.outputStartFrame);
    const trimmed = {
      ...segment,
      sourceStartFrame: segment.sourceStartFrame + inside,
      outputStartFrame: cursor,
    };
    cursor += length - inside;
    return [trimmed];
  });
  if (!segments.length)
    throw new Error("No queda ningún corte tras el recorte");

  const shift = <T extends { startFrame: number; endFrame: number }>(
    items: T[],
  ) =>
    items
      .filter((item) => item.endFrame > startOutputFrame)
      .map((item) => ({
        ...item,
        startFrame: Math.max(0, item.startFrame - startOutputFrame),
        endFrame: item.endFrame - startOutputFrame,
      }));

  return PresenterEditPlanSchema.parse({
    ...plan,
    durationFrames: cursor,
    segments,
    captions: shift(plan.captions),
    overlays: shift(plan.overlays),
  });
}

// La frontera de subtítulo más cercana a un objetivo en segundos, para elegir
// dónde entrar sin cortar a mitad de palabra.
export function captionBoundaryNear(
  plan: PresenterEditPlan,
  seconds: number,
): number {
  const target = Math.round(seconds * plan.fps);
  const boundaries = [0, ...plan.captions.map((c) => c.startFrame)];
  return boundaries.reduce((best, frame) =>
    Math.abs(frame - target) < Math.abs(best - target) ? frame : best,
  );
}
