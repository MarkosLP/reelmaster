import { readFile, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { bundle } from "@remotion/bundler";
import { getCompositions, renderMedia } from "@remotion/renderer";
import {
  PresenterEditPlanSchema,
  type PresenterEditPlan,
} from "../src/domain/presenter-edit";
import { trimMontageStart } from "../src/application/trim-montage";
import { fingerprintPresenterPlan } from "../src/application/fingerprint";
import { editFfmpeg } from "../src/infrastructure/audio/ffmpeg";
import { localBrowser } from "../src/infrastructure/audio/browser";
import { privateAssetServer } from "../src/infrastructure/audio/private-server";
import { fileHash } from "../src/infrastructure/audio/inspect";

// Monta variantes de gancho de la misma toma: mismo material, mismas palabras,
// distinta entrada. Es la única forma de saber si acortar la entrada cambia
// algo, porque no cambia nada más.
//
// Reproduce la cadena de la fase 1K —cortar, suavizar empalmes, renderizar,
// muxar— con el ffmpeg del propio proyecto, en vez de los scripts de Python
// atados a phase-1k, que se conservan como registro de aquella entrega.
const { values } = parseArgs({
  options: { only: { type: "string" } },
  strict: true,
});

const SAMPLES_PER_FRAME = 1600; // 48 kHz / 30 fps
const RAMP_SAMPLES = 144; // ~3 ms a cada lado de un empalme

const VARIANTS = [
  {
    name: "gancho-completo",
    startFrame: 0,
    why: "La entrega actual: la pregunta entera antes del primer ejemplo",
  },
  {
    name: "gancho-corto",
    startFrame: 34,
    why: "Entra en 'IA puede ahorrarte', sin el arranque de la pregunta",
  },
  {
    name: "gancho-directo",
    startFrame: 147,
    why: "Sin pregunta: abre directamente en el primer ejemplo",
  },
];

const chosen = values.only
  ? VARIANTS.filter((v) => v.name === values.only)
  : VARIANTS;
if (!chosen.length) throw Error(`Variante desconocida: ${values.only}`);

const source = resolve(
  ".local/presenters/presenter-marcos/denoise/phase-1j2-rnnoise/DENOISED-RNNOISE.mp4",
);
const base = PresenterEditPlanSchema.parse(
  JSON.parse(await readFile(resolve(".local/phase-1k/edit-plan.json"), "utf8")),
);
const work = resolve(".local/variants");
const outDirectory = resolve("out/variants");
await mkdir(work, { recursive: true });
await mkdir(outDirectory, { recursive: true });

// Corta vídeo y audio por los mismos intervalos: nunca se separan, así que no
// puede haber desincronía por construcción.
async function cut(plan: PresenterEditPlan, directory: string) {
  const filters: string[] = [];
  plan.segments.forEach((s, i) => {
    const frames = s.sourceEndFrame - s.sourceStartFrame;
    filters.push(
      `[0:v]trim=start=${s.sourceStartFrame / plan.fps}:end=${s.sourceEndFrame / plan.fps},setpts=PTS-STARTPTS,fps=${plan.fps},tpad=stop_mode=clone:stop_duration=0.1,trim=end_frame=${frames},setpts=N/(${plan.fps}*TB)[v${i}]`,
      `[0:a]atrim=start_sample=${s.sourceStartFrame * SAMPLES_PER_FRAME}:end_sample=${s.sourceEndFrame * SAMPLES_PER_FRAME},asetpts=N/SR/TB[a${i}]`,
    );
  });
  const n = plan.segments.length;
  const vs = plan.segments.map((_, i) => `[v${i}]`).join("");
  const as = plan.segments.map((_, i) => `[a${i}]`).join("");
  filters.push(
    `${vs}concat=n=${n}:v=1:a=0[v]`,
    `${as}concat=n=${n}:v=0:a=1[a]`,
  );
  await editFfmpeg([
    "-v",
    "error",
    "-y",
    "-i",
    source,
    "-filter_complex",
    filters.join(";"),
    "-map",
    "[v]",
    "-an",
    "-c:v",
    "libx264",
    "-crf",
    "16",
    "-preset",
    "fast",
    "-pix_fmt",
    "yuv420p",
    "-video_track_timescale",
    "90000",
    resolve(directory, "edited-video.mp4"),
    "-map",
    "[a]",
    "-c:a",
    "pcm_s24le",
    resolve(directory, "edited-audio.wav"),
  ]);
}

// Rampas de 3 ms a cada lado de cada empalme. Solo tocan la frontera: no
// desplazan ni mezclan palabras.
async function declick(plan: PresenterEditPlan, directory: string) {
  const raw = resolve(directory, "audio.f32");
  await editFfmpeg([
    "-v",
    "error",
    "-y",
    "-i",
    resolve(directory, "edited-audio.wav"),
    "-c:a",
    "pcm_f32le",
    "-f",
    "f32le",
    raw,
  ]);
  const bytes = await readFile(raw);
  const samples = new Float32Array(
    bytes.buffer,
    bytes.byteOffset,
    Math.floor(bytes.byteLength / 4),
  );
  for (const segment of plan.segments.slice(1)) {
    const boundary = segment.outputStartFrame * SAMPLES_PER_FRAME;
    for (let i = 0; i < RAMP_SAMPLES; i++) {
      const out = (boundary - RAMP_SAMPLES + i) * 2;
      const into = (boundary + i) * 2;
      const fade = i / RAMP_SAMPLES;
      for (const channel of [0, 1]) {
        if (out + channel >= 0 && out + channel < samples.length)
          samples[out + channel] *= 1 - fade;
        if (into + channel < samples.length) samples[into + channel] *= fade;
      }
    }
  }
  await writeFile(
    raw,
    Buffer.from(samples.buffer, samples.byteOffset, bytes.byteLength),
  );
  await editFfmpeg([
    "-v",
    "error",
    "-y",
    "-f",
    "f32le",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-i",
    raw,
    "-c:a",
    "pcm_s24le",
    resolve(directory, "final-audio.wav"),
  ]);
  await rm(raw, { force: true });
}

const serveUrl = await bundle({
  entryPoint: resolve("src/composition/presenter-index.tsx"),
  outDir: resolve(work, "bundle"),
  publicDir: resolve(work, "public"),
});
const browserExecutable = await localBrowser();
await mkdir(resolve(work, "public"), { recursive: true });
await copyFile(
  resolve("public/ReelSans.woff2"),
  resolve(work, "public/ReelSans.woff2"),
);

const summary: Record<string, unknown>[] = [];
for (const [index, variant] of chosen.entries()) {
  const label = `[${index + 1}/${chosen.length}] ${variant.name}`;
  const plan = variant.startFrame
    ? trimMontageStart(base, variant.startFrame)
    : base;
  const directory = resolve(work, variant.name);
  await mkdir(resolve(directory, "visual-assets"), { recursive: true });
  console.log(`${label}: cortando ${plan.segments.length} tramos`);
  await cut(plan, directory);
  await declick(plan, directory);

  const editedVideo = resolve(directory, "edited-video.mp4");
  const hash = await fileHash(editedVideo);
  const alias = `visual-assets/${hash}.mp4`;
  await copyFile(editedVideo, resolve(directory, alias));
  const server = await privateAssetServer(directory, {
    presenter: { path: alias, contentHash: hash },
  });
  const silent = resolve(directory, "rendered-silent.mp4");
  try {
    const inputProps = { plan, videoUrl: `${server.baseUrl}/${alias}` };
    const composition = (
      await getCompositions(serveUrl, { inputProps, browserExecutable })
    ).find((c) => c.id === "PresenterReel");
    if (!composition) throw Error("Falta la composición PresenterReel");
    console.log(`${label}: renderizando ${plan.durationFrames} frames`);
    let step = -1;
    await renderMedia({
      serveUrl,
      composition,
      inputProps,
      browserExecutable,
      codec: "h264",
      muted: true,
      pixelFormat: "yuv420p",
      colorSpace: "bt709",
      crf: 18,
      concurrency: 2,
      outputLocation: silent,
      onProgress: ({ progress }) => {
        const next = Math.floor(progress * 4);
        if (next !== step) {
          step = next;
          console.log(`${label}: ${next * 25}%`);
        }
      },
    });
  } finally {
    await server.close();
  }

  const final = resolve(outDirectory, `${variant.name}.mp4`);
  await rm(final, { force: true });
  await editFfmpeg([
    "-v",
    "error",
    "-y",
    "-i",
    silent,
    "-i",
    resolve(directory, "final-audio.wav"),
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-map_metadata",
    "-1",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    final,
  ]);

  const fingerprint = fingerprintPresenterPlan(plan);
  await writeFile(
    resolve(outDirectory, `${variant.name}.fingerprint.json`),
    JSON.stringify(fingerprint, null, 2) + "\n",
  );
  await writeFile(
    resolve(directory, "edit-plan.json"),
    JSON.stringify(plan, null, 2) + "\n",
  );
  summary.push({
    name: variant.name,
    why: variant.why,
    opensWith: plan.captions[0]?.text ?? "",
    seconds: Number((plan.durationFrames / plan.fps).toFixed(2)),
    cuts: plan.segments.length,
    captions: plan.captions.length,
    outputHash: await fileHash(final),
    fingerprint,
  });
  console.log(`${label}: listo -> ${final}`);
}

await writeFile(
  resolve(outDirectory, "variants.json"),
  JSON.stringify(
    { generatedAt: new Date().toISOString(), source, variants: summary },
    null,
    2,
  ) + "\n",
);
console.log(`\n${summary.length} variantes en ${outDirectory}`);
for (const v of summary)
  console.log(
    `  ${String(v.name).padEnd(18)} ${v.seconds}s  abre: "${v.opensWith}"`,
  );
