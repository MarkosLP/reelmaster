import type { TimedToken } from "../ports/alignment";
// La caja de subtítulos mide 900 px (1080 menos 90 de margen a cada lado) y cada
// token añade 24 px de relleno horizontal. 0,62 em es una cota superior prudente
// del avance medio de ReelSans para el juego latino en uso: es una estimación
// conservadora, no una medida del motor de texto. Con fontSize 49 devuelve
// exactamente los 26 caracteres que esta heurística llevaba fijos, que era el
// tamaño de la demo para el que se ajustaron; a 56 o a 72 aquel límite fijo
// desbordaba la caja y nada lo comprobaba.
const MAX_TOKENS = 4;
const TOKEN_PADDING_PX = 24;
const MAX_ADVANCE_EM = 0.62;
export const CAPTION_BOX_PX = 900;
export function captionCharBudget(
  fontSize: number,
  boxWidthPx = CAPTION_BOX_PX,
) {
  const usable = boxWidthPx - MAX_TOKENS * TOKEN_PADDING_PX;
  return Math.max(10, Math.floor(usable / (fontSize * MAX_ADVANCE_EM)));
}
export function prepareCaptionLines(
  tokens: TimedToken[],
  durationMs: number,
  fontSize: number,
) {
  const maxChars = captionCharBudget(fontSize);
  const groups: TimedToken[][] = [];
  let current: TimedToken[] = [];
  for (const token of tokens) {
    const candidate = [...current, token];
    if (
      current.length &&
      (candidate.length > MAX_TOKENS ||
        candidate.map((t) => t.text).join(" ").length > maxChars ||
        /[.!?;:]$/.test(current.at(-1)!.text))
    ) {
      groups.push(current);
      current = [];
    }
    current.push(token);
  }
  if (current.length) groups.push(current);
  return groups.map((g, i) => ({
    id: `line-${i}`,
    tokenIds: g.map((t) => t.id),
    startMs: g[0].startMs,
    endMs: Math.min(
      durationMs,
      groups[i + 1]?.[0].startMs ?? durationMs,
      g.at(-1)!.endMs + 500,
    ),
  }));
}
