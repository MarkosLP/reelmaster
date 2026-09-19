import { ReelSchema } from "../domain/reel";
import assets from "./assets.json";
import { contentHash } from "../snapshot/hash";
export { default as assets } from "./assets.json";
const narrations = [
  "¿Sabías que la IA puede hacer esto?",
  "Puede ayudarte a escribir, investigar y programar.",
  "Y esto solo es el principio.",
];
export const spanishCharacters = "áéíóúüñ¿¡";
export const demo = ReelSchema.parse({
  schemaVersion: 2,
  id: "demo",
  revision: 1,
  renderProfileId: "instagram-reel-v1",
  theme: {
    background: "#101116",
    foreground: "#F4F4F0",
    captionStyle: {
      fontSize: 49,
      textColor: "#FFFFFF",
      activeTextColor: "#101116",
      activeBackground: "#C6FF6B",
    },
  },
  scenes: narrations.map((narration, i) => {
    let cursor = 0;
    const tokens = narration.split(" ").map((text, j) => {
      const charStart = narration.indexOf(text, cursor);
      cursor = charStart + text.length;
      return {
        id: `token-${j}`,
        text,
        charStart,
        charEnd: cursor,
        startMs: 400 + j * 400,
        endMs: 650 + j * 400,
      };
    });
    const split = i === 0 ? 3 : 4;
    const groups = [tokens.slice(0, split), tokens.slice(split)].filter(
      (g) => g.length,
    );
    const lines = groups.map((g, j) => ({
      id: `line-${j}`,
      tokenIds: g.map((t) => t.id),
      startMs: j === 0 ? 300 : g[0].startMs,
      endMs: j === groups.length - 1 ? 3700 : groups[j + 1][0].startMs,
    }));
    const audio = assets[`voice-${i}` as keyof typeof assets];
    return {
      id: `scene-${i}`,
      revision: 1,
      targetDurationMs: 4000,
      narration,
      headline: [
        "Tu próxima idea.\nCon superpoderes.",
        "Escribe.\nInvestiga.\nConstruye.",
        "Esto solo es\nel principio.",
      ][i],
      label: ["01 / DESCUBRE", "02 / EXPLORA", "03 / IMAGINA"][i],
      accent: ["#C6FF6B", "#AD9FFF", "#FFAD85"][i],
      visual: { kind: "typography", motif: ["orbit", "cards", "signal"][i] },
      audio: {
        artifactId: `voice-${i}`,
        inputHash: contentHash({
          recipe: "local-tone-v2",
          frequency: [220, 277.18, 329.63][i],
          sampleRate: 48000,
          durationMs: 4000,
        }),
        contentHash: audio.contentHash,
        measuredDurationMs: 4000,
        precision: { durationSamples: 192000, sampleRate: 48000 },
        mimeType: "audio/wav",
        volume: 0.3,
      },
      paddingAfterMs: 0,
      transition: { kind: "fade-through-background", durationMs: 333 },
      captions: {
        audioContentHash: audio.contentHash,
        source: "simulated",
        tokens,
        lines,
      },
    };
  }),
});
