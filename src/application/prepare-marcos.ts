import { ReelSchema } from "../domain/reel";
import { marcosVoice } from "../domain/voice";
import { paragraphs, headlines } from "../fixtures/marcos";
import type { AlignmentProvider } from "../ports/alignment";
import type { PreparedAudioSegment } from "../ports/prepared-audio";
import { prepareCaptionLines } from "./captions";
// Preparation data is supplied by the local CLI, not loaded by the domain/renderer.
export function createMarcosReel(
  preparation: { segments: PreparedAudioSegment[] },
  aligner: AlignmentProvider,
) {
  if (preparation.segments.length !== paragraphs.length)
    throw new Error("Prepared segments do not match the fixture transcript");
  const alignmentRecords: Array<{
    artifactId: string;
    timingSource: string;
    methodVersion: string;
  }> = [];
  const assets = Object.fromEntries(
    preparation.segments.map((s) => [
      s.artifactId,
      { path: s.path, contentHash: s.contentHash },
    ]),
  );
  const reel = ReelSchema.parse({
    schemaVersion: 2,
    id: "marcos-reference-reel",
    revision: 1,
    renderProfileId: "instagram-reel-v1",
    defaultVoiceProfileId: marcosVoice.id,
    voiceProfiles: [marcosVoice],
    theme: {
      background: "#101116",
      foreground: "#F4F4F0",
      captionStyle: {
        fontSize: 56,
        textColor: "#FFFFFF",
        activeTextColor: "#101116",
        activeBackground: "#C6FF6B",
        highlightActive: false,
      },
    },
    scenes: preparation.segments.map((audio, i) => {
      const alignment = aligner.align({
        audio,
        transcript: paragraphs[i],
        locale: marcosVoice.locale,
      });
      alignmentRecords.push({
        artifactId: audio.artifactId,
        timingSource: alignment.timingSource,
        methodVersion: alignment.methodVersion,
      });
      return {
        id: `marcos-scene-${i}`,
        revision: 1,
        targetDurationMs: 5000,
        narration: paragraphs[i],
        headline: headlines[i],
        label: `0${i + 1} / MARCOS`,
        accent: ["#C6FF6B", "#AD9FFF", "#FFAD85", "#C6FF6B", "#AD9FFF"][i],
        visual: { kind: "typography", motif: i % 2 ? "cards" : "orbit" },
        audio: {
          artifactId: audio.artifactId,
          voiceProfileId: marcosVoice.id,
          inputHash: audio.inputHash,
          contentHash: audio.contentHash,
          measuredDurationMs: audio.measuredDurationMs,
          precision: {
            durationSamples: audio.durationSamples,
            sampleRate: audio.sampleRate,
          },
          mimeType: "audio/wav",
          volume: 1,
        },
        paddingAfterMs: 0,
        transition: { kind: "fade-through-background", durationMs: 100 },
        captions: {
          audioContentHash: audio.contentHash,
          source:
            alignment.timingSource === "estimated"
              ? "estimated"
              : alignment.timingSource === "measured"
                ? "provider"
                : "forced-alignment",
          tokens: alignment.tokens,
          lines: prepareCaptionLines(
            alignment.tokens,
            audio.measuredDurationMs,
          ),
        },
      };
    }),
  });
  return { reel, assets, alignmentRecords };
}
