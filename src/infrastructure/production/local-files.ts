import {
  mkdir,
  realpath,
  readFile,
  writeFile,
  rename,
  open,
  unlink,
  stat,
} from "node:fs/promises";
import { resolve, relative, isAbsolute, dirname } from "node:path";
import { randomUUID } from "node:crypto";
import { ProductionError } from "../../application/production-plan";
export async function privateRoot(
  workspace: string,
  area: "productions" | "recordings",
) {
  const workspacePath = await realpath(workspace);
  const root = resolve(workspacePath, ".local", area);
  await mkdir(root, { recursive: true });
  if ((await realpath(root)).toLowerCase() !== root.toLowerCase())
    throw new ProductionError(
      "UNSAFE_PATH",
      "Private storage cannot use linked directories",
    );
  return root;
}
export async function assertInside(root: string, path: string) {
  if (path.startsWith("\\\\") || path.startsWith("//"))
    throw new ProductionError("UNSAFE_PATH", "Network paths are forbidden");
  const canonical = await realpath(path);
  const part = relative(await realpath(root), canonical);
  if (!part || part.startsWith("..") || isAbsolute(part))
    throw new ProductionError(
      "UNSAFE_PATH",
      "File must remain inside the private storage area",
    );
  return canonical;
}
export async function readLocalJson(path: string) {
  if (path.startsWith("\\\\") || path.startsWith("//"))
    throw new ProductionError(
      "UNSAFE_PATH",
      "Network JSON paths are forbidden",
    );
  const info = await stat(path);
  if (!info.isFile() || info.size > 2 * 1024 * 1024)
    throw new ProductionError(
      "INVALID_PLAN",
      "Expected a JSON file up to 2 MiB",
    );
  const data = await readFile(path);
  if (data.length > 2 * 1024 * 1024)
    throw new ProductionError("INVALID_PLAN", "JSON file exceeds 2 MiB");
  return JSON.parse(data.toString("utf8").replace(/^\uFEFF/, "")) as unknown;
}
export async function atomicJson(path: string, data: unknown) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(data, null, 2) + "\n", {
    flag: "wx",
  });
  await rename(temporary, path);
}
export async function withProductionLock<T>(
  directory: string,
  task: () => Promise<T>,
): Promise<T> {
  const lockPath = resolve(directory, ".operation.lock");
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch {
    throw new ProductionError(
      "BUSY",
      "Production is locked; no concurrent import/render is allowed",
    );
  }
  try {
    return await task();
  } finally {
    await lock.close();
    await unlink(lockPath);
  }
}
export async function productionDirectory(workspace: string, planPath: string) {
  const root = await privateRoot(workspace, "productions");
  const safe = await assertInside(root, resolve(planPath));
  if (
    !/^production-[a-f0-9]{64}$/.test(relative(root, dirname(safe))) ||
    !safe.endsWith("production-plan.json")
  )
    throw new ProductionError(
      "UNSAFE_PATH",
      "Expected a production-plan.json in its private production directory",
    );
  return dirname(safe);
}
