import { compileReelDraft } from "../src/application/generate-reel-content";
import {
  createProductionPlan,
  transitionProduction,
} from "../src/application/production-plan";
import { type GeneratedContent } from "../src/domain/reel-draft";

export function technicalImageProduction(integration: boolean) {
  const scenes: GeneratedContent["scenes"] = integration
    ? [
        {
          purpose: "hook",
          narration: "Una esfera de luz representa una idea conectada.",
          onScreenText: "CONEXIÓN LOCAL",
          visualIntent: {
            kind: "image",
            description:
              "Imagen IA conceptual: una esfera de cristal verde luminosa suspendida en un espacio oscuro, objeto abstracto aislado, sin personas, sin pantallas",
          },
          estimatedDurationMs: 7500,
        },
        {
          purpose: "closing",
          narration: "Prueba técnica de imagen local.",
          onScreenText: "PRUEBA TÉCNICA",
          visualIntent: { kind: "textOnly", description: "Tipografía técnica" },
          estimatedDurationMs: 7500,
        },
      ]
    : [
        {
          purpose: "hook",
          narration: "Texto, gráficos e imágenes locales.",
          onScreenText: "TRES RECURSOS VISUALES",
          visualIntent: { kind: "textOnly", description: "Tipografía técnica" },
          estimatedDurationMs: 3000,
        },
        {
          purpose: "explanation",
          narration: "Idea visual; Generación local; Revisión humana",
          onScreenText: "UN PROCESO CLARO",
          visualIntent: {
            kind: "image",
            description: "Gráfico conceptual de flujo",
          },
          estimatedDurationMs: 3000,
        },
        {
          purpose: "example",
          narration: "La luz conecta distintas ideas.",
          onScreenText: "IDEAS CONECTADAS",
          visualIntent: {
            kind: "image",
            description:
              "Imagen IA conceptual: tres esferas de cristal verde conectadas por filamentos luminosos, naturaleza muerta abstracta sobre fondo negro, composición central, sin personas ni pantallas",
          },
          estimatedDurationMs: 3000,
        },
        {
          purpose: "reinforcement",
          narration: "Una semilla sugiere nuevas posibilidades.",
          onScreenText: "NUEVAS POSIBILIDADES",
          visualIntent: {
            kind: "image",
            description:
              "Imagen IA conceptual: una pequeña planta verde luminosa creciendo entre cubos oscuros de cristal, metáfora del crecimiento digital, objeto central, fondo negro, sin personas ni pantallas",
          },
          estimatedDurationMs: 3000,
        },
        {
          purpose: "closing",
          narration: "Demo visual. Audio de prueba sin voz.",
          onScreenText: "TODO EN LOCAL",
          visualIntent: {
            kind: "textOnly",
            description: "Cierre tipográfico de demo técnica",
          },
          estimatedDurationMs: 3000,
        },
      ];
  const draft = compileReelDraft(
    {
      topic: "Validación visual local",
      locale: "es-ES",
      targetDurationMs: 15000,
      contentStyle: "tech",
      audience: "Revisión técnica del pipeline visual",
      voiceProfileId: "voice-technical",
      orientation: "vertical",
    },
    {
      title: integration
        ? "Integración local de imagen · 1G"
        : "Demo visual mixta · 1G",
      scenes,
    },
  );
  return transitionProduction(
    createProductionPlan(draft, {
      voiceProfile: {
        id: "voice-technical",
        displayName: "Audio de prueba: tonos sin voz",
        locale: "es-ES",
        source: "recorded-reference",
      },
      presenter: {
        id: "presenter-technical",
        displayName: "Demo sin persona",
        defaultVoiceProfileId: "voice-technical",
      },
    }),
    { kind: "waitingForNarration" },
  );
}
