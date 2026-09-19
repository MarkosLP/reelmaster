import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
await mkdir("public/audio", { recursive: true });
const assets: Record<string, { path: string; contentHash: string }> = {};
for (let scene = 0; scene < 3; scene++) {
  const rate = 48000,
    samples = rate * 4,
    wav = Buffer.alloc(44 + samples * 2);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const local = t % 0.9;
    const envelope = local < 0.25 ? Math.sin((Math.PI * local) / 0.25) : 0;
    wav.writeInt16LE(
      Math.round(
        Math.sin(2 * Math.PI * [220, 277.18, 329.63][scene] * t) *
          envelope *
          6000,
      ),
      44 + i * 2,
    );
  }
  const path = `audio/scene-${scene}.wav`;
  await writeFile(`public/${path}`, wav);
  assets[`voice-${scene}`] = {
    path,
    contentHash: createHash("sha256").update(wav).digest("hex"),
  };
}
await writeFile(
  "src/fixtures/assets.json",
  JSON.stringify(assets, null, 2) + "\n",
);
