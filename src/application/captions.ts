import type { TimedToken } from "../ports/alignment";
export function prepareCaptionLines(tokens: TimedToken[], durationMs: number) {
  const groups: TimedToken[][] = [];
  let current: TimedToken[] = [];
  for (const token of tokens) {
    const candidate = [...current, token];
    if (
      current.length &&
      (candidate.length > 4 ||
        candidate.map((t) => t.text).join(" ").length > 26 ||
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
