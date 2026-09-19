import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { getCompositions, renderMedia } from "@remotion/renderer";
import { demo, assets } from "../src/fixtures/demo";
import {
  compileCompositionSnapshot,
  type AssetManifest,
} from "../src/snapshot/compile";
import type { CompositionSnapshot } from "../src/snapshot/types";
import { localBrowser } from "../src/infrastructure/audio/browser";
import { fileHash } from "../src/infrastructure/audio/inspect";
import { contentHash } from "../src/snapshot/hash";

// Variantes del baseline sintético para decidir mirando, no discutiendo.
// Usa tonos de prueba, nunca la voz ni la imagen de nadie.
const { values } = parseArgs({
  options: { only: { type: "string" } },
  strict: true,
});

type Variant = {
  name: string;
  question: string;
  change: string;
  mutate: (snapshot: CompositionSnapshot) => void;
};

const motif = (which: "orbit" | "cards" | "signal"): Variant => ({
  name: `motivo-${which}`,
  question: `¿Cómo se lee el motivo ${which} sostenido durante todo el reel?`,
  change: `Las tres escenas usan el motivo ${which}`,
  mutate: (s) => {
    for (const scene of s.scenes)
      if (scene.visual.kind === "typography") scene.visual.motif = which;
  },
});

const captions = (fontSize: number): Variant => ({
  name: `subtitulos-${fontSize}`,
  question:
    fontSize >= 72
      ? "¿Se sale de la caja de 900 px el tamaño máximo que admite el esquema?"
      : `¿Cómo respira el subtítulo a ${fontSize}?`,
  change: `captionStyle.fontSize = ${fontSize}`,
  mutate: (s) => {
    s.theme.captionStyle.fontSize = fontSize;
  },
});

const variants: Variant[] = [
  motif("orbit"),
  motif("cards"),
  motif("signal"),
  captions(49),
  captions(56),
  captions(72),
];

const chosen = values.only
  ? variants.filter((v) => v.name === values.only)
  : variants;
if (!chosen.length) throw Error(`Variante desconocida: ${values.only}`);

const directory = resolve("out/simulations");
await mkdir(directory, { recursive: true });
const serveUrl = resolve("build/renderer");
const browserExecutable = await localBrowser();
const baseline = compileCompositionSnapshot(demo, assets as AssetManifest);

const results: Record<string, unknown>[] = [];
const startedAll = Date.now();

for (const [index, variant] of chosen.entries()) {
  const snapshot = structuredClone(baseline);
  variant.mutate(snapshot);
  const inputProps = { snapshot };
  // Las props resueltas viajan en la composición: hay que resolver cada una.
  const composition = (
    await getCompositions(serveUrl, { inputProps, browserExecutable })
  ).find((c) => c.id === "ReelDemo");
  if (!composition) throw Error("Falta la composición ReelDemo");
  const output = resolve(directory, `${variant.name}.mp4`);
  await rm(output, { force: true });
  const started = Date.now();
  let lastStep = -1;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    browserExecutable,
    codec: "h264",
    audioCodec: "aac",
    pixelFormat: "yuv420p",
    colorSpace: "bt709",
    imageFormat: "png",
    crf: 18,
    concurrency: 2,
    outputLocation: output,
    onProgress: ({ progress }) => {
      const step = Math.floor(progress * 4);
      if (step !== lastStep) {
        lastStep = step;
        console.log(
          `[${index + 1}/${chosen.length}] ${variant.name} ${step * 25}%`,
        );
      }
    },
  });
  const seconds = (Date.now() - started) / 1000;
  results.push({
    name: variant.name,
    question: variant.question,
    change: variant.change,
    file: `out/simulations/${variant.name}.mp4`,
    frames: snapshot.durationInFrames,
    snapshotHash: contentHash(snapshot),
    outputHash: await fileHash(output),
    renderSeconds: Number(seconds.toFixed(1)),
  });
  console.log(
    `[${index + 1}/${chosen.length}] ${variant.name} listo en ${seconds.toFixed(1)}s`,
  );
}

await writeFile(
  resolve(directory, "simulations.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      note: "Variantes del baseline sintético. Tonos de prueba, sin voz ni imagen personales.",
      totalSeconds: Number(((Date.now() - startedAll) / 1000).toFixed(1)),
      variants: results,
    },
    null,
    2,
  ) + "\n",
);
console.log(`\n${results.length} simulaciones en ${directory}`);
