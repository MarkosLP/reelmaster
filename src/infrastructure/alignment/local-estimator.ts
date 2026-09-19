import type {
  AlignmentProvider,
  AlignmentRequest,
  TimedToken,
} from "../../ports/alignment";
export function tokenize(transcript: string) {
  return [...transcript.matchAll(/\S+/gu)].map((match, i) => ({
    id: `word-${i}`,
    text: match[0],
    charStart: match.index,
    charEnd: match.index + match[0].length,
  }));
}
// Not forced alignment: distribute syllable-weighted transcript over detected speech.
export class LocalEstimatedAlignment implements AlignmentProvider {
  align({ audio, transcript, locale }: AlignmentRequest) {
    if (locale !== "es-ES")
      throw new Error("Local estimator currently supports es-ES only");
    const words = tokenize(transcript);
    const regions = audio.speechRegions;
    if (!words.length || !regions.length)
      throw new Error("Transcript and measured speech regions required");
    let previous = 0;
    for (const r of regions) {
      if (
        !Number.isInteger(r.startMs) ||
        !Number.isInteger(r.endMs) ||
        r.startMs < previous ||
        r.endMs <= r.startMs ||
        r.endMs > audio.measuredDurationMs
      )
        throw new Error("Invalid speech regions");
      previous = r.endMs;
    }
    const voicedMs = regions.reduce((n, r) => n + r.endMs - r.startMs, 0);
    const weights = words.map((w) =>
      Math.max(
        1,
        (w.text.toLocaleLowerCase(locale).match(/[aeiouáéíóúü]+/gu) ?? [])
          .length,
      ),
    );
    const weightTotal = weights.reduce((n, w) => n + w, 0);
    const locate = (t: number, end: boolean) => {
      let acc = 0;
      for (const r of regions) {
        const length = r.endMs - r.startMs;
        if (t < acc + length || (end && t === acc + length))
          return r.startMs + t - acc;
        acc += length;
      }
      return regions.at(-1)!.endMs;
    };
    let consumed = 0;
    const tokens: TimedToken[] = words.map((w, i) => {
      const a = Math.round((voicedMs * consumed) / weightTotal);
      consumed += weights[i];
      const b = Math.round((voicedMs * consumed) / weightTotal);
      if (b <= a) throw new Error("Audio too short for transcript");
      return { ...w, startMs: locate(a, false), endMs: locate(b, true) };
    });
    return {
      timingSource: "estimated" as const,
      methodVersion: "es-syllables-speech-regions-v1",
      tokens,
    };
  }
}
