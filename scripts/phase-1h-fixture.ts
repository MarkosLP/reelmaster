import { compileReelDraft } from "../src/application/generate-reel-content";
import {
  createProductionPlan,
  transitionProduction,
} from "../src/application/production-plan";
import type { GeneratedContent } from "../src/domain/reel-draft";
export const technicalIdentity = {
  voiceProfile: {
    id: "voice-technical",
    displayName: "Audio de prueba: tonos sin voz",
    locale: "es-ES",
    source: "recorded-reference" as const,
  },
  presenter: {
    id: "presenter-technical",
    displayName: "Demo sin persona",
    defaultVoiceProfileId: "voice-technical",
  },
};
export const qualityConcepts = [
  {
    title: "IA ORGANIZANDO TAREAS",
    narration: "La IA organiza tareas alrededor de un objetivo.",
    description:
      "Imagen IA conceptual: un nodo digital central organizando unos pocos elementos abstractos, sin texto ni personas",
  },
  {
    title: "AGENTES COLABORANDO",
    narration: "Tres agentes colaboran en un objetivo compartido.",
    description:
      "Imagen IA conceptual: tres nodos digitales conectados alrededor de un objetivo central, sin texto ni personas",
  },
  {
    title: "DE IDEA A CONTENIDO",
    narration: "Una idea se transforma en contenido digital.",
    description:
      "Imagen IA conceptual: una chispa o núcleo transformándose en unos pocos elementos visuales digitales, sin interfaces ni texto",
  },
];
export function qualityProduction() {
  const scenes: GeneratedContent["scenes"] = qualityConcepts.map((c, i) => ({
    narration: c.narration,
    purpose: i === 0 ? "hook" : "example",
    visualIntent: { kind: "image", description: c.description },
    estimatedDurationMs: 5000,
    onScreenText: c.title,
  }));
  const draft = compileReelDraft(
    {
      topic: "Dirección visual y revisión editorial local",
      locale: "es-ES",
      targetDurationMs: 15000,
      contentStyle: "tech",
      audience: "Revisión técnica",
      voiceProfileId: "voice-technical",
      orientation: "vertical",
    },
    { title: "Calidad visual · FASE 1H", scenes },
  );
  return transitionProduction(createProductionPlan(draft, technicalIdentity), {
    kind: "waitingForNarration",
  });
}
