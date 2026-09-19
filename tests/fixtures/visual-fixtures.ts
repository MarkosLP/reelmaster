import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { ffmpeg } from "../../src/infrastructure/audio/ffmpeg";
import { fileHash } from "../../src/infrastructure/audio/inspect";
import { compileReelDraft } from "../../src/application/generate-reel-content";
import { marcosIdeaDefaults } from "../../src/application/editorial-prompt";
import {
  createProductionPlan,
  transitionProduction,
  createNarrationManifest,
  narrationText,
} from "../../src/application/production-plan";
import {
  privateRoot,
  atomicJson,
} from "../../src/infrastructure/production/local-files";
import { importProduction } from "../../src/infrastructure/production/operations";
// Authorized technical fixtures only: no photographs, human voice or product content.
export async function createVisualFixtures(workspace: string) {
  const id = randomUUID(),
    mediaDirectory = resolve(workspace, ".local/visual-fixtures", id);
  await mkdir(mediaDirectory, { recursive: true });
  const image = resolve(mediaDirectory, "pattern.png"),
    screen = resolve(mediaDirectory, "screen.png"),
    video = resolve(mediaDirectory, "shapes.mp4");
  function png(width: number, height: number, rgb: Buffer) {
    const chunk = (type: string, data: Buffer) => {
      const payload = Buffer.concat([Buffer.from(type), data]);
      let crc = 0xffffffff;
      for (const byte of payload) {
        crc ^= byte;
        for (let b = 0; b < 8; b++)
          crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      const result = Buffer.alloc(data.length + 12);
      result.writeUInt32BE(data.length, 0);
      payload.copy(result, 4);
      result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
      return result;
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 2;
    const scanlines = Buffer.alloc(height * (width * 3 + 1));
    for (let y = 0; y < height; y++)
      rgb.copy(
        scanlines,
        y * (width * 3 + 1) + 1,
        y * width * 3,
        (y + 1) * width * 3,
      );
    return Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(scanlines)),
      chunk("IEND", Buffer.alloc(0)),
    ]);
  }
  function pixels(width: number, height: number, frame: number, ui = false) {
    const buffer = Buffer.alloc(width * height * 3);
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const rgb = ui
          ? y < 50
            ? [30, 45, 75]
            : x < 130
              ? [170, 185, 210]
              : y < 130
                ? [90, 150, 230]
                : x < width / 2
                  ? [150, 220, 180]
                  : [245, 205, 105]
          : x > (frame * 3) % (width - 100) &&
              x < ((frame * 3) % (width - 100)) + 100 &&
              y > height / 4 &&
              y < (height * 3) / 4
            ? [255, 210, 65]
            : [
                35,
                70 + Math.floor((y / height) * 70),
                120 + Math.floor((x / width) * 100),
              ];
        const offset = (y * width + x) * 3;
        buffer[offset] = rgb[0];
        buffer[offset + 1] = rgb[1];
        buffer[offset + 2] = rgb[2];
      }
    return buffer;
  }
  await writeFile(image, png(640, 480, pixels(640, 480, 45)));
  await writeFile(screen, png(640, 360, pixels(640, 360, 0, true)));
  for (let frame = 0; frame < 120; frame++)
    await writeFile(
      resolve(mediaDirectory, `frame-${String(frame).padStart(3, "0")}.png`),
      png(320, 180, pixels(320, 180, frame)),
    );
  const recordings = await privateRoot(workspace, "recordings"),
    audio = resolve(recordings, `visual-fixture-${id}.wav`);
  const count = 8 * 48000,
    bytes = Buffer.alloc(44 + count * 4);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(48000, 24);
  bytes.writeUInt32LE(192000, 28);
  bytes.writeUInt16LE(4, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(count * 4, 40);
  for (let i = 0; i < count; i++) {
    const t = i / 48000,
      phase = t % 2;
    const sample =
      phase > 0.3 && phase < 1.7
        ? Math.round(Math.sin(2 * Math.PI * 330 * t) * 5000)
        : 0;
    bytes.writeInt16LE(sample, 44 + i * 4);
    bytes.writeInt16LE(sample, 46 + i * 4);
  }
  await writeFile(audio, bytes);
  await ffmpeg([
    "-v",
    "error",
    "-f",
    "image2",
    "-framerate",
    "30",
    "-i",
    resolve(mediaDirectory, "frame-%03d.png"),
    "-i",
    audio,
    "-t",
    "4",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-movflags",
    "+faststart",
    video,
  ]);
  return { id, mediaDirectory, image, screen, video, audio };
}
export async function createTechnicalVisualProduction(
  workspace: string,
  prepareAudio = true,
) {
  const fixtures = await createVisualFixtures(workspace);
  const types = ["image", "broll", "screenDemo", "textOnly"] as const;
  const headings = [
    "PATRÓN TÉCNICO",
    "VÍDEO DE PRUEBA",
    "CAPTURA SIMULADA",
    "SOLO TEXTO",
  ];
  const draft = compileReelDraft(
    {
      ...marcosIdeaDefaults,
      topic: "Fixtures técnicos sin personas",
      targetDurationMs: 15000,
      voiceProfileId: "voice-technical",
    },
    {
      title: `Demo visual técnica ${fixtures.id}`,
      scenes: types.map((kind, order) => ({
        narration:
          order === 0
            ? "Prueba técnica sin voz humana."
            : "Estos recursos son fixtures de prueba.",
        purpose: order === 0 ? "hook" : "example",
        visualIntent: { kind, description: headings[order] },
        estimatedDurationMs: 3750,
        onScreenText: headings[order],
      })),
    },
  );
  const plan = transitionProduction(
    createProductionPlan(draft, {
      voiceProfile: {
        id: "voice-technical",
        displayName: "Tonos técnicos, sin voz humana",
        locale: "es-ES",
        source: "recorded-reference",
      },
      presenter: {
        id: "presenter-technical",
        displayName: "Fixture sin persona",
        defaultVoiceProfileId: "voice-technical",
      },
    }),
    { kind: "waitingForNarration" },
  );
  const directory = resolve(
    await privateRoot(workspace, "productions"),
    plan.id,
  );
  await mkdir(directory);
  const planPath = resolve(directory, "production-plan.json");
  await atomicJson(planPath, plan);
  await atomicJson(
    resolve(directory, "narration-manifest.json"),
    createNarrationManifest(plan),
  );
  await writeFile(resolve(directory, "narration.txt"), narrationText(plan));
  const reviewPath = resolve(fixtures.mediaDirectory, "technical-review.json");
  // Simulated review solely in this test harness; never a claimed human reading.
  await atomicJson(reviewPath, {
    productionId: plan.id,
    draftContentHash: plan.draftContentHash,
    narrationHash: plan.narrationHash,
    recordingHash: await fileHash(fixtures.audio),
    exactScriptRead: true,
    boundariesReviewed: true,
    sceneIds: plan.draft.scenes.map((s) => s.id),
    sceneBoundariesMs: [2000, 4000, 6000],
  });
  if (prepareAudio)
    await importProduction(workspace, planPath, fixtures.audio, reviewPath);
  return { fixtures, directory, planPath, plan, reviewPath };
}
