import { before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderStill } from "@remotion/renderer";
import { demo, assets, spanishCharacters } from "../src/fixtures/demo";
import {
  compileCompositionSnapshot,
  type AssetManifest,
} from "../src/snapshot/compile";
import type { CompositionSnapshot } from "../src/snapshot/types";
import { fileHash } from "../src/infrastructure/audio/inspect";
import { localBrowser } from "../src/infrastructure/audio/browser";
import { ffmpeg, probe } from "../src/infrastructure/audio/ffmpeg";

// La capa de composición solo se verificaba por lint y por lectura del código
// fuente. Estas pruebas la renderizan de verdad y comparan los bytes del PNG,
// sin fijar ningún hash de referencia: un hash dorado dependería de la versión
// del navegador y se rompería en cuanto se actualizara, así que lo que se
// comprueba son relaciones entre renders producidos en la misma ejecución.
const directory = resolve(".local/render-tests");
const baseline = compileCompositionSnapshot(demo, assets as AssetManifest);
type Composition = Awaited<ReturnType<typeof getCompositions>>[number];
// Escena 0 con una palabra activa, ya pasado el fundido de entrada.
const FRAME = 40;
let serveUrl = "";
let browserExecutable = "";
let composition: Composition;

before(async () => {
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  browserExecutable = await localBrowser();
  serveUrl = await bundle({
    entryPoint: resolve("src/composition/index.tsx"),
    outDir: resolve(directory, "bundle"),
  });
  composition = await resolveComposition(baseline);
});

async function resolveComposition(snapshot: CompositionSnapshot) {
  const found = (
    await getCompositions(serveUrl, {
      inputProps: { snapshot },
      browserExecutable,
    })
  ).find((c) => c.id === "ReelDemo");
  assert.ok(found, "Falta la composición ReelDemo");
  return found;
}

// Las props resueltas viajan dentro de la composición, no solo en inputProps:
// cada snapshot tiene que resolverse por separado o se renderiza el de partida.
async function still(snapshot: CompositionSnapshot, name: string) {
  const output = resolve(directory, `${name}.png`);
  await renderStill({
    serveUrl,
    composition: await resolveComposition(snapshot),
    inputProps: { snapshot },
    browserExecutable,
    frame: FRAME,
    imageFormat: "png",
    output,
  });
  return output;
}

function withMotif(motif: "orbit" | "cards" | "signal") {
  const snapshot = structuredClone(baseline);
  const visual = snapshot.scenes[0].visual;
  assert.equal(visual.kind, "typography");
  visual.motif = motif;
  return snapshot;
}

async function pixel(png: string, x: number, y: number) {
  const raw = resolve(directory, "pixel.raw");
  await ffmpeg([
    "-v",
    "error",
    "-y",
    "-i",
    png,
    "-vf",
    `crop=1:1:${x}:${y}`,
    "-f",
    "image2",
    "-c:v",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    raw,
  ]);
  const bytes = await readFile(raw);
  return [bytes[0], bytes[1], bytes[2]];
}

test("the composition reports the profile and duration that the snapshot declares", () => {
  assert.equal(composition.width, baseline.profile.width);
  assert.equal(composition.height, baseline.profile.height);
  assert.equal(composition.fps, baseline.profile.fps);
  assert.equal(composition.durationInFrames, baseline.durationInFrames);
});

test("rendering the same frame twice produces byte-identical pixels", async () => {
  const snapshot = withMotif("orbit");
  const first = await still(snapshot, "orbit");
  const second = await still(snapshot, "orbit-repeat");
  assert.equal(await fileHash(first), await fileHash(second));
  const metadata = await probe(first);
  assert.equal(metadata.streams[0].width, baseline.profile.width);
  assert.equal(metadata.streams[0].height, baseline.profile.height);
});

test("the three typography motifs render as three different frames", async () => {
  // En serie a propósito: tres navegadores a la vez compiten por la máquina y
  // el render deja de ser fiable si algo pesado corre en paralelo.
  const hashes: string[] = [];
  for (const motif of ["orbit", "cards", "signal"] as const)
    hashes.push(
      await fileHash(await still(withMotif(motif), `motif-${motif}`)),
    );
  assert.equal(new Set(hashes).size, 3, "dos motivos se pintan igual");
});

test("accented Spanish characters reach the rendered frame", async () => {
  const plain = structuredClone(baseline);
  plain.scenes[0].headline = "Sin acentos";
  const accented = structuredClone(baseline);
  accented.scenes[0].headline = spanishCharacters;
  assert.notEqual(
    await fileHash(await still(plain, "headline-plain")),
    await fileHash(await still(accented, "headline-accented")),
  );
});

test("turning off the active-word highlight changes the caption band", async () => {
  const off = structuredClone(baseline);
  off.theme.captionStyle.highlightActive = false;
  assert.notEqual(
    await fileHash(await still(baseline, "highlight-on")),
    await fileHash(await still(off, "highlight-off")),
  );
});

test("the rendered background is the theme background, not whatever the browser defaults to", async () => {
  const png = resolve(directory, "orbit.png");
  const [r, g, b] = await pixel(png, 8, baseline.profile.height - 8);
  const expected = [0x10, 0x11, 0x16];
  for (const [i, channel] of [r, g, b].entries())
    assert.ok(
      Math.abs(channel - expected[i]) <= 6,
      `canal ${i}: ${channel} frente a ${expected[i]}`,
    );
});
