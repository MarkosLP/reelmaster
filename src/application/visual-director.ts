import { VisualResolutionError } from "../domain/visual-plan";
import {
  VisualDirectionSchema,
  VisualDirectorInputSchema,
  directorVersion,
  noTextElements,
  type VisualDirection,
  type VisualDirectorInput,
} from "../domain/visual-direction";
import type {
  VisualDirector,
  VisualDirectionProvider,
  VisualDirectorResult,
} from "./ports/visual-director";

export function validateDirectorInput(raw: VisualDirectorInput) {
  const input = VisualDirectorInputSchema.parse(raw);
  if (
    input.visualIntent.kind !== "image" ||
    /\b(marcos|presenter|retrato|captura|screenshot|logotipo|face.?swap|identidad)\b/i.test(
      `${input.narration} ${input.visualIntent.description}`,
    )
  )
    throw new VisualResolutionError(
      "INVALID_SPEC",
      "Visual director only supports anonymous conceptual imagery",
    );
  return input;
}
export function directionProfile(brand: VisualDirectorInput["brand"]) {
  const rgb = [1, 3, 5].map((i) =>
    parseInt(brand.colors.accent.slice(i, i + 2), 16),
  );
  const accent =
    rgb[1] >= rgb[0] && rgb[1] >= rgb[2]
      ? "green"
      : rgb[2] >= rgb[0]
        ? "blue"
        : "warm red";
  return {
    environment: "dark charcoal studio, seamless black surroundings",
    lighting: `cinematic soft rim lighting, subtle ${accent} accent glow`,
    mood: "calm, precise, modern technological atmosphere",
    composition:
      "one central visual concept, vertical composition, generous breathing room, details away from edges" as const,
    framing: "medium-wide view, entire subject visible" as const,
    palette: {
      background: brand.colors.background,
      accent: brand.colors.accent,
      profileId: brand.id,
    },
    forbiddenElements: [...noTextElements],
  };
}
export function fallbackDirection(raw: VisualDirectorInput): VisualDirection {
  const input = validateDirectorInput(raw);
  const context = `${input.narration} ${input.visualIntent.description}`;
  const concept = /colabor|agentes|agents/i.test(context)
    ? {
        subject:
          "three small luminous glass nodes around one central glowing orb",
        action: "thin light filaments connect the nodes to the central orb",
        semanticGoal: "Several agents cooperate around one shared objective",
      }
    : /contenido|transform|chispa|content/i.test(context)
      ? {
          subject:
            "one glowing crystal core with a few small luminous geometric fragments",
          action:
            "the fragments emerge from the core in a simple radial arrangement",
          semanticGoal:
            "One idea develops into several pieces of digital content",
        }
      : {
          subject:
            "one central luminous orb surrounded by a few small geometric blocks",
          action: "the blocks form an orderly ring around the central orb",
          semanticGoal: "One AI system organizes tasks into a coherent order",
        };
  return VisualDirectionSchema.parse({
    version: 1,
    ...concept,
    ...directionProfile(input.brand),
  });
}
export class LocalVisualDirector implements VisualDirector {
  constructor(
    private readonly provider?: VisualDirectionProvider,
    private readonly timeoutMs = 180000,
  ) {}
  async direct(
    raw: VisualDirectorInput,
    signal?: AbortSignal,
  ): Promise<VisualDirectorResult> {
    const input = validateDirectorInput(raw),
      started = performance.now();
    const issues: string[] = [];
    let attempts = 0;
    const controller = new AbortController();
    const combined = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (signal?.aborted)
        throw new VisualResolutionError(
          "CANCELLED",
          "Visual direction cancelled",
        );
      if (this.provider) {
        const operation = async () => {
          let repair: string | undefined;
          for (let attempt = 0; attempt < 2; attempt++) {
            attempts++;
            const rawDirection = await this.provider!.propose(
              input,
              repair,
              combined,
            );
            const parsed = VisualDirectionSchema.safeParse(rawDirection);
            const profile = directionProfile(input.brand);
            if (
              parsed.success &&
              Object.entries(profile).every(
                ([key, value]) =>
                  JSON.stringify(parsed.data[key as keyof VisualDirection]) ===
                  JSON.stringify(value),
              )
            )
              return parsed.data;
            repair = parsed.success
              ? "Environment, lighting, mood, framing, composition, palette and forbiddenElements must exactly match the supplied brand profile"
              : parsed.error.issues
                  .map((i) => i.message)
                  .slice(0, 4)
                  .join("; ");
            issues.push(repair);
          }
          return undefined;
        };
        const direction = await Promise.race([
          operation(),
          new Promise<undefined>((resolve) => {
            timer = setTimeout(() => {
              controller.abort();
              issues.push("Director timeout; conservative fallback");
              resolve(undefined);
            }, this.timeoutMs);
          }),
        ]);
        if (signal?.aborted)
          throw new VisualResolutionError(
            "CANCELLED",
            "Visual direction cancelled",
          );
        if (direction)
          return {
            direction,
            directorVersion,
            source: "localDirector",
            attempts,
            elapsedMs: performance.now() - started,
            issues,
            provider: this.provider.identity(),
          };
      }
    } catch (error) {
      if (signal?.aborted)
        throw new VisualResolutionError(
          "CANCELLED",
          "Visual direction cancelled",
        );
      issues.push(
        error instanceof VisualResolutionError
          ? error.message
          : "Local director unavailable or invalid; conservative fallback",
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
    return {
      direction: fallbackDirection(input),
      directorVersion,
      source: "deterministicFallback",
      attempts,
      elapsedMs: performance.now() - started,
      issues,
    };
  }
}
