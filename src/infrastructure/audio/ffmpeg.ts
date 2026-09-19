import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { glob } from "node:fs/promises";
const require = createRequire(import.meta.url);
const run = promisify(execFile);
export function mediaBinary(name: "ffmpeg" | "ffprobe") {
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error("Local media adapter currently supports Windows x64");
  return join(
    dirname(
      require.resolve("@remotion/compositor-win32-x64-msvc/package.json"),
    ),
    `${name}.exe`,
  );
}
// El ffmpeg que trae Remotion es una build recortada: sirve para inspeccionar
// y recodificar, pero no tiene setpts, fps ni tpad, que hacen falta para
// recortar y concatenar tramos. La fase 1K usó otro binario, escondido dentro
// de un script de Python; aquí la dependencia es explícita y se verifica.
const EDITING_FILTERS = ["setpts", "fps", "tpad"];
let editingBinary: string | null = null;
async function hasFilters(binary: string) {
  try {
    const { stdout } = await run(binary, ["-hide_banner", "-filters"], {
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true,
    });
    // Cada línea de -filters es "FLAGS nombre entrada->salida descripción".
    const names = new Set(
      stdout
        .split("\n")
        .map((line) => line.trim().split(/\s+/)[1])
        .filter(Boolean),
    );
    return EDITING_FILTERS.every((f) => names.has(f));
  } catch {
    return false;
  }
}
export async function editingFfmpeg(env: NodeJS.ProcessEnv = process.env) {
  if (editingBinary) return editingBinary;
  const local = env.LOCALAPPDATA?.split("\\").join("/");
  const discovered: string[] = [];
  if (local)
    for await (const found of glob(
      `${local}/Python/*/Lib/site-packages/imageio_ffmpeg/binaries/ffmpeg-win-*.exe`,
    ))
      discovered.push(found);
  const candidates = [env.REELMASTER_FFMPEG, ...discovered].filter(
    (c): c is string => Boolean(c),
  );
  for (const candidate of candidates)
    if (await hasFilters(candidate)) {
      editingBinary = candidate;
      return candidate;
    }
  throw new Error(
    `No hay un ffmpeg completo para editar. Hace falta uno con ${EDITING_FILTERS.join(", ")}; ` +
      "indícalo en REELMASTER_FFMPEG. El de Remotion no sirve para esto.",
  );
}
export async function editFfmpeg(args: string[]) {
  return run(
    await editingFfmpeg(),
    ["-hide_banner", "-nostdin", "-protocol_whitelist", "file,pipe", ...args],
    { maxBuffer: 4 * 1024 * 1024, windowsHide: true },
  );
}
export async function ffmpeg(args: string[]) {
  return run(
    mediaBinary("ffmpeg"),
    ["-hide_banner", "-nostdin", "-protocol_whitelist", "file,pipe", ...args],
    { maxBuffer: 4 * 1024 * 1024, windowsHide: true },
  );
}
export type Probe = {
  streams: Array<{
    codec_type: string;
    codec_name: string;
    sample_rate?: string;
    channels?: number;
    duration?: string;
    duration_ts?: number;
    time_base?: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    nb_frames?: string;
  }>;
  format: {
    duration: string;
    size: string;
    format_name: string;
    bit_rate?: string;
  };
};
export async function probe(path: string): Promise<Probe> {
  const { stdout } = await run(
    mediaBinary("ffprobe"),
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", path],
    { maxBuffer: 1024 * 1024, windowsHide: true },
  );
  return JSON.parse(stdout) as Probe;
}
