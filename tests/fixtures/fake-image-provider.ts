// Test double only. Produces a flat synthetic PNG, not an AI image or a demo.
import { deflateSync } from "node:zlib";
import type { ImageGenerationProvider } from "../../src/application/ports/image-generation-provider";
import type { ImageGenerationRequest } from "../../src/domain/image-generation";
export function fakePng(width: number, height: number, seed: number) {
  const chunk = (name: string, data: Buffer) => {
    const payload = Buffer.concat([Buffer.from(name), data]);
    let crc = 0xffffffff;
    for (const byte of payload) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    const result = Buffer.alloc(data.length + 12);
    result.writeUInt32BE(data.length);
    payload.copy(result, 4);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
    return result;
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const pixels = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      pixels[offset] = (seed + x) % 256;
      pixels[offset + 1] = 40;
      pixels[offset + 2] = 80;
    }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(pixels)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
export class FakeImageProvider implements ImageGenerationProvider {
  calls = 0;
  capability() {
    return {
      status: "available" as const,
      execution: "local" as const,
      maxPixels: 393216,
    };
  }
  identity() {
    return {
      runtimeId: "fake-test-only",
      runtimeVersion: "1",
      modelId: "no-real-model",
      modelHash: "1".repeat(64),
      testOnly: true,
    };
  }
  async generate(request: ImageGenerationRequest, signal: AbortSignal) {
    this.calls++;
    signal.throwIfAborted();
    return fakePng(request.width, request.height, request.seed);
  }
}
