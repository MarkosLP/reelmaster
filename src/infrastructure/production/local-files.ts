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
import { hostname } from "node:os";
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
const LOCK_TTL_MS = 12 * 60 * 60 * 1000;
type LockHolder = { pid: number; host: string; since: string };
type LockState =
  { held: false; text: string } | { held: true; text: string; by: string };
function parseLockHolder(text: string): LockHolder | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const { pid, host, since } = value as Record<string, unknown>;
  return typeof pid === "number" &&
    Number.isInteger(pid) &&
    pid > 0 &&
    typeof host === "string" &&
    typeof since === "string" &&
    Number.isFinite(Date.parse(since))
    ? { pid, host, since }
    : null;
}
function processAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
async function removeLock(lockPath: string, expected?: string) {
  try {
    if (
      expected !== undefined &&
      (await readFile(lockPath, "utf8")) !== expected
    )
      return;
    await unlink(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
async function claimLock(lockPath: string) {
  let lock;
  try {
    lock = await open(lockPath, "wx");
  } catch {
    return null;
  }
  try {
    await lock.writeFile(
      JSON.stringify({
        pid: process.pid,
        host: hostname(),
        since: new Date().toISOString(),
      }) + "\n",
    );
  } catch (error) {
    await lock.close();
    await removeLock(lockPath);
    throw error;
  }
  return lock;
}
async function inspectLock(lockPath: string): Promise<LockState> {
  let text: string, writtenMs: number;
  try {
    text = await readFile(lockPath, "utf8");
    writtenMs = (await stat(lockPath)).mtimeMs;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { held: false, text: "" };
    throw error;
  }
  const holder = parseLockHolder(text);
  const since = holder ? Date.parse(holder.since) : writtenMs;
  const minutes = Math.round((Date.now() - since) / 60000);
  if (since + LOCK_TTL_MS < Date.now()) return { held: false, text };
  if (!holder)
    return {
      held: true,
      text,
      by: `an unreadable lock written ${minutes} min ago`,
    };
  if (holder.host === hostname() && !processAlive(holder.pid))
    return { held: false, text };
  return {
    held: true,
    text,
    by: `pid ${holder.pid} on ${holder.host}, held for ${minutes} min`,
  };
}
export async function withProductionLock<T>(
  directory: string,
  task: () => Promise<T>,
): Promise<T> {
  const lockPath = resolve(directory, ".operation.lock");
  let lock = await claimLock(lockPath);
  if (!lock) {
    const previous = await inspectLock(lockPath);
    if (previous.held)
      throw new ProductionError(
        "BUSY",
        `Production is locked by ${previous.by}; no concurrent import/render is allowed. If no operation is running, delete ${lockPath}`,
      );
    await removeLock(lockPath, previous.text);
    lock = await claimLock(lockPath);
    if (!lock)
      throw new ProductionError(
        "BUSY",
        `Production was locked again while reclaiming a stale lock; retry, or delete ${lockPath} if no operation is running`,
      );
  }
  try {
    return await task();
  } finally {
    await lock.close();
    await removeLock(lockPath);
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
