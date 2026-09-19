import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
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
