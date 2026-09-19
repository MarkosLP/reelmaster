import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  stat,
  readFile,
  mkdir,
  copyFile,
  rename,
  unlink,
  access,
  realpath,
} from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { randomUUID } from "node:crypto";
import { mediaBinary } from "../audio/ffmpeg";
import { fileHash } from "../audio/inspect";
import { privateRoot, assertInside } from "../production/local-files";
import { ProductionError } from "../../application/production-plan";
import {
  MediaMetadataSchema,
  VisualAssetSchema,
  type VisualAsset,
} from "../../domain/visual-asset";
import { contentHash } from "../../snapshot/hash";
const run = promisify(execFile);
async function media(binary: "ffmpeg" | "ffprobe", args: string[]) {
  try {
    return await run(
      mediaBinary(binary),
      ["-protocol_whitelist", "file,pipe", ...args],
      { windowsHide: true, timeout: 180000, maxBuffer: 3 * 1024 * 1024 },
    );
  } catch {
    throw new ProductionError(
      "INVALID_PLAN",
      "Visual media decoding/normalization failed or exceeded 180 seconds",
    );
  }
}
function magic(bytes: Buffer): VisualAsset["source"]["mime"] {
  if (
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    return "image/png";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    return "image/jpeg";
  if (
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (["ftyp", "wide", "mdat", "moov"].includes(bytes.toString("ascii", 4, 8)))
    return bytes.toString("ascii", 8, 12) === "qt  "
      ? "video/quicktime"
      : "video/mp4";
  throw new ProductionError(
    "INVALID_PLAN",
    "Only decoded PNG/JPEG/WebP and MP4/MOV are supported; extension is not trusted",
  );
}
// Read only the TIFF Orientation tag; unusual EXIF orientation is rejected explicitly.
function exifOrientation(bytes: Buffer) {
  const marker = bytes.indexOf(Buffer.from("Exif\0\0"));
  if (marker < 0) return 1;
  const start = marker + 6;
  try {
    const little = bytes.toString("ascii", start, start + 2) === "II";
    if (!little && bytes.toString("ascii", start, start + 2) !== "MM") return 0;
    const u16 = (p: number) =>
      little ? bytes.readUInt16LE(p) : bytes.readUInt16BE(p);
    const u32 = (p: number) =>
      little ? bytes.readUInt32LE(p) : bytes.readUInt32BE(p);
    const ifd = start + u32(start + 4),
      count = u16(ifd);
    if (count > 1000) return 0;
    for (let i = 0; i < count; i++) {
      const p = ifd + 2 + i * 12;
      if (u16(p) === 0x0112) return u16(p + 8);
    }
    return 1;
  } catch {
    return 0;
  }
}
type Stream = {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  duration?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  sample_aspect_ratio?: string;
  tags?: { rotate?: string };
  side_data_list?: { rotation?: number }[];
};
async function inspect(path: string, mime: VisualAsset["source"]["mime"]) {
  const info = JSON.parse(
    (
      await media("ffprobe", [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        path,
      ])
    ).stdout,
  ) as { streams: Stream[]; format: { duration?: string } };
  const visuals = info.streams.filter((s) => s.codec_type === "video"),
    stream = visuals[0],
    image = mime.startsWith("image/");
  if (
    visuals.length !== 1 ||
    !stream ||
    info.streams.some((s) => !["video", "audio"].includes(s.codec_type))
  )
    throw new ProductionError(
      "INVALID_PLAN",
      "Expected one visual stream and optional audio only",
    );
  if (
    image
      ? !["png", "mjpeg", "webp"].includes(stream.codec_name) ||
        info.streams.length !== 1
      : !["h264", "hevc", "mpeg4", "prores"].includes(stream.codec_name)
  )
    throw new ProductionError("INVALID_PLAN", "Unsupported visual codec");
  const parts = (stream.avg_frame_rate ?? stream.r_frame_rate ?? "0/1")
    .split("/")
    .map(Number);
  const fps = image ? 0 : parts[0] / parts[1];
  if (
    !image &&
    stream.sample_aspect_ratio &&
    !["1:1", "0:1", "N/A"].includes(stream.sample_aspect_ratio)
  )
    throw new ProductionError(
      "UNSUPPORTED",
      "Only square-pixel video is supported",
    );
  const rotation =
    stream.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ??
    Number(stream.tags?.rotate ?? 0);
  const width = stream.width!,
    height = stream.height!;
  const metadata = MediaMetadataSchema.parse({
    kind: image ? "image" : "video",
    width,
    height,
    orientation:
      width === height ? "square" : width > height ? "landscape" : "portrait",
    codec: stream.codec_name,
    durationMs: image
      ? 0
      : Number(stream.duration ?? info.format.duration) * 1000,
    fps,
    hasAudio: info.streams.some((s) => s.codec_type === "audio"),
    rotation,
  });
  if (
    !image &&
    (metadata.durationMs < 100 ||
      ![0, 90, -90, 180, -180, 270, -270].includes(rotation))
  )
    throw new ProductionError(
      "INVALID_PLAN",
      "Unsupported clip duration/rotation",
    );
  return metadata;
}
async function keepCopy(source: string, target: string, expected: string) {
  let exists = false;
  try {
    await access(target);
    exists = true;
  } catch {
    /* New artifact. */
  }
  if (exists) {
    if ((await fileHash(target)) !== expected)
      throw new ProductionError(
        "STALE_ARTIFACT",
        "Existing visual artifact changed",
      );
  } else await copyFile(source, target, 1);
}
export async function importVisualAsset(
  workspace: string,
  productionDirectory: string,
  input: string,
  requiredType: "presenter" | "screenCapture" | "broll" | "image",
  presenterId: string,
  technicalFixture = false,
): Promise<VisualAsset> {
  if (input.startsWith("\\\\") || input.startsWith("//"))
    throw new ProductionError(
      "UNSAFE_PATH",
      "Network asset paths are forbidden",
    );
  const source = await realpath(resolve(input)),
    workspaceRoot = await realpath(workspace),
    part = relative(workspaceRoot, source);
  if (!part.startsWith("..") && !isAbsolute(part))
    await assertInside(resolve(workspaceRoot, ".local"), source);
  const info = await stat(source);
  if (!info.isFile() || info.size < 12 || info.size > 200 * 1024 * 1024)
    throw new ProductionError(
      "INVALID_PLAN",
      "Visual files must be regular files up to 200 MiB",
    );
  const bytes = await readFile(source),
    mime = magic(bytes),
    image = mime.startsWith("image/");
  if (image && info.size > 20 * 1024 * 1024)
    throw new ProductionError("INVALID_PLAN", "Images are limited to 20 MiB");
  if (image && exifOrientation(bytes) !== 1)
    throw new ProductionError(
      "UNSUPPORTED",
      "Non-default or malformed EXIF orientation must be normalized manually before import",
    );
  if (mime === "image/webp" && bytes.includes(Buffer.from("ANIM")))
    throw new ProductionError("UNSUPPORTED", "Animated WebP is not supported");
  const sourceHash = await fileHash(source);
  if (requiredType === "image" && !image)
    throw new ProductionError(
      "INVALID_PLAN",
      "Image requirement cannot accept video",
    );
  const root = await privateRoot(workspace, "productions");
  await assertInside(root, productionDirectory);
  const directory = resolve(productionDirectory, "visual-assets"),
    originals = resolve(directory, "originals");
  await mkdir(originals, { recursive: true });
  await assertInside(productionDirectory, directory);
  await assertInside(directory, originals);
  const sourceExtension = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
  }[mime];
  const originalCopy = resolve(originals, `${sourceHash}.${sourceExtension}`);
  await keepCopy(source, originalCopy, sourceHash);
  if ((await fileHash(originalCopy)) !== sourceHash)
    throw new ProductionError("STALE_ARTIFACT", "Source changed while copying");
  // Probe the byte-identical private copy with a magic-derived extension, never a user's extension.
  const sourceMetadata = await inspect(originalCopy, mime);
  await media("ffmpeg", [
    "-v",
    "error",
    "-nostdin",
    "-xerror",
    "-i",
    originalCopy,
    "-c:v",
    "rawvideo",
    "-c:a",
    "pcm_s16le",
    "-f",
    "null",
    "-",
  ]);
  const temporary = resolve(
    directory,
    `preparing-${randomUUID()}.${image ? "png" : "mp4"}`,
  );
  const ffmpegVersion = (await media("ffmpeg", ["-version"])).stdout.split(
    /\r?\n/,
  )[0];
  const copyPng =
    mime === "image/png" &&
    Math.max(sourceMetadata.width, sourceMetadata.height) <= 1920 &&
    sourceMetadata.rotation === 0;
  const recipe = {
    version: "local-visual-v1" as const,
    ffmpegVersion,
    inputHash: contentHash({
      sourceHash,
      version: "local-visual-v1",
      ffmpegVersion,
      copyPng,
      maxDimension: 1920,
      videoFps: 30,
      muted: true,
    }),
  };
  if (copyPng) await copyFile(originalCopy, temporary, 1);
  else {
    const filters =
      "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease" +
      (image ? "" : ":force_divisible_by=2");
    await media("ffmpeg", [
      "-v",
      "error",
      "-nostdin",
      "-xerror",
      "-n",
      "-i",
      originalCopy,
      "-map",
      "0:v:0",
      "-map_metadata",
      "-1",
      "-an",
      "-vf",
      filters,
      ...(image
        ? ["-frames:v", "1", "-c:v", "png"]
        : [
            "-c:v",
            "libx264",
            "-r",
            "30",
            "-fps_mode",
            "cfr",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "18",
            "-preset",
            "fast",
            "-g",
            "30",
            "-movflags",
            "+faststart",
            "-metadata:s:v:0",
            "rotate=0",
          ]),
      "-fflags",
      "+bitexact",
      "-flags:v",
      "+bitexact",
      temporary,
    ]);
  }
  const normalizedMime = image
    ? ("image/png" as const)
    : ("video/mp4" as const);
  const metadata = await inspect(temporary, normalizedMime),
    normalizedHash = await fileHash(temporary);
  if (metadata.rotation !== 0)
    throw new ProductionError(
      "UNSUPPORTED",
      "Visual orientation was not normalized",
    );
  const path = `visual-assets/${normalizedHash}.${image ? "png" : "mp4"}`,
    finalPath = resolve(productionDirectory, path);
  let exists = false;
  try {
    await access(finalPath);
    exists = true;
  } catch {
    /* New content hash. */
  }
  if (exists) {
    await assertInside(directory, finalPath);
    if ((await fileHash(finalPath)) !== normalizedHash)
      throw new ProductionError(
        "STALE_ARTIFACT",
        "Prepared asset hash mismatch",
      );
    await unlink(temporary);
  } else await rename(temporary, finalPath);
  if ((await fileHash(source)) !== sourceHash)
    throw new ProductionError(
      "STALE_ARTIFACT",
      "Original visual asset changed during preparation",
    );
  const type =
    requiredType === "screenCapture"
      ? "screenCapture"
      : requiredType === "presenter"
        ? image
          ? "presenterImage"
          : "presenterVideo"
        : image
          ? "image"
          : "video";
  return VisualAssetSchema.parse({
    id: `visual-${contentHash({ contentHash: normalizedHash, type, presenterId: type.startsWith("presenter") ? presenterId : null, recipe })}`,
    type,
    source: {
      kind: "localFile",
      contentHash: sourceHash,
      mime,
      bytes: info.size,
      metadata: sourceMetadata,
    },
    mime: normalizedMime,
    contentHash: normalizedHash,
    path,
    bytes: (await stat(finalPath)).size,
    metadata,
    privacy: {
      classification: technicalFixture ? "technicalFixture" : "private",
      publicable: false,
    },
    ...(type.startsWith("presenter") ? { presenterId } : {}),
    recipe,
  });
}
