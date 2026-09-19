import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generateReelContent } from "../src/application/generate-reel-content";
import {
  marcosEditorialProfile,
  marcosIdeaDefaults,
} from "../src/application/editorial-prompt";
import {
  OllamaTextAdapter,
  ollamaConfigFromEnvironment,
} from "../src/infrastructure/text/ollama";
import { GenerationError } from "../src/ports/text-provider";

// Tanda de borradores con el modelo local, en la línea del reel ya publicado:
// IA práctica y cotidiana. Son guiones para grabar, no reels: no hay voz ni
// vídeo hasta que alguien se pone delante del micrófono.
const IDEAS = [
  {
    topic:
      "Tres atajos con IA para vaciar la bandeja de entrada sin leerlo todo",
    duration: 30,
  },
  {
    topic:
      "Cómo usar la IA para planificar la compra semanal y no tirar comida",
    duration: 30,
  },
  {
    topic: "Tres errores que casi todos cometen al pedirle cosas a una IA",
    duration: 30,
  },
  {
    topic: "Preparar un viaje entero con IA: itinerario, presupuesto y maleta",
    duration: 45,
  },
  {
    topic:
      "La IA como segundo par de ojos: revisar un contrato o una factura antes de firmar",
    duration: 30,
  },
  {
    topic:
      "Cómo pedirle a una IA que te explique algo difícil sin que suene a manual",
    duration: 30,
  },
];

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());

const directory = resolve(".local/generated");
await mkdir(directory, { recursive: true });
const provider = await OllamaTextAdapter.connect(
  ollamaConfigFromEnvironment(process.env),
  controller.signal,
);

const summary: Record<string, unknown>[] = [];
for (const [index, idea] of IDEAS.entries()) {
  const label = `[${index + 1}/${IDEAS.length}]`;
  try {
    const started = Date.now();
    const result = await generateReelContent(
      {
        ...marcosIdeaDefaults,
        topic: idea.topic,
        targetDurationMs: idea.duration * 1000,
      },
      {
        provider,
        editorialProfile: marcosEditorialProfile,
        signal: controller.signal,
      },
    );
    const file = resolve(
      directory,
      `${result.generation.inputHash.slice(0, 16)}-${result.generation.contentHash.slice(0, 16)}-${Date.now()}.json`,
    );
    await writeFile(file, JSON.stringify(result, null, 2) + "\n", {
      flag: "wx",
    });
    summary.push({
      topic: idea.topic,
      title: result.draft.title,
      scenes: result.draft.scenes.length,
      targetDurationMs: result.draft.targetDurationMs,
      model: result.generation.model,
      attempts: result.generation.attemptCount,
      seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      file,
    });
    console.log(`${label} ${result.draft.title}`);
  } catch (error) {
    const failure =
      error instanceof GenerationError
        ? { code: error.code, message: error.message }
        : { code: "UNKNOWN", message: String(error) };
    summary.push({ topic: idea.topic, failed: failure });
    console.log(`${label} falló: ${failure.code} · ${failure.message}`);
  }
}

await writeFile(
  resolve(directory, "tanda.json"),
  JSON.stringify(
    { generatedAt: new Date().toISOString(), drafts: summary },
    null,
    2,
  ) + "\n",
);
const ok = summary.filter((s) => !s.failed).length;
console.log(`\n${ok}/${IDEAS.length} borradores en ${directory}`);
