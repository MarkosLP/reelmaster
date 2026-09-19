import { access, cp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
const directory = "chrome-headless-shell-win64";
export async function localBrowser() {
  const cached = resolve(
    ".local/tools",
    directory,
    "chrome-headless-shell.exe",
  );
  try {
    await access(cached);
    return cached;
  } catch {
    /* Try only the previously downloaded local browser. */
  }
  const installed = resolve(
    "node_modules/.remotion/chrome-headless-shell/win64",
    directory,
  );
  try {
    await access(resolve(installed, "chrome-headless-shell.exe"));
  } catch {
    throw new Error(
      "Local browser missing. Automatic downloads disabled for FASE 1A.",
    );
  }
  await mkdir(resolve(".local/tools"), { recursive: true });
  await cp(installed, resolve(".local/tools", directory), { recursive: true });
  return cached;
}
