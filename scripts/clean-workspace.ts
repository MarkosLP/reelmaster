import { readdir, readFile, rm, stat } from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";
import { parseArgs } from "node:util";

// Limpia residuo de ejecuciones de tests bajo .local/ y los artefactos
// regenerables de out/. En seco por defecto: sin --apply no borra nada.
//
// Nunca toca una producción en estado rendered o prepared, ni nada cuyo título
// no coincida con los que generan los tests. Ante la duda, conserva.
const { values } = parseArgs({
  options: { apply: { type: "boolean", default: false } },
  strict: true,
});

const workspace = resolve(".");
const TEST_TITLE =
  /^(Prueba (técnica|resolver|visual)|Demo visual (técnica|mixta)|Demo técnica|Failed import|Test provider|Draft|Sin narración|Concurrent|Stale)\b/i;

function inside(root: string, path: string) {
  const part = relative(root, path);
  return Boolean(part) && !part.startsWith("..") && !isAbsolute(part);
}

async function bytesOf(path: string): Promise<number> {
  const info = await stat(path).catch(() => null);
  if (!info) return 0;
  if (info.isFile()) return info.size;
  let total = 0;
  for (const entry of await readdir(path).catch(() => []))
    total += await bytesOf(join(path, entry));
  return total;
}

const doomed: { path: string; why: string }[] = [];
const kept: string[] = [];

const productions = resolve(workspace, ".local/productions");
for (const name of await readdir(productions).catch(() => [])) {
  const directory = join(productions, name);
  if (!inside(productions, directory)) continue;
  let plan: { state: { kind: string }; draft: { title: string } } | null = null;
  try {
    plan = JSON.parse(
      await readFile(join(directory, "production-plan.json"), "utf8"),
    ) as typeof plan;
  } catch {
    doomed.push({ path: directory, why: "producción sin plan legible" });
    continue;
  }
  const { kind } = plan!.state;
  const title = plan!.draft.title;
  if (kind === "rendered" || kind === "prepared")
    kept.push(`${kind}: ${title}`);
  else if (TEST_TITLE.test(title))
    doomed.push({ path: directory, why: `${kind} de test` });
  else kept.push(`${kind}: ${title}`);
}

const local = resolve(workspace, ".local");
for (const name of await readdir(local).catch(() => []))
  if (
    /^(presenter-test-|recording-path-test-|render-tests$|review-tests$)/.test(
      name,
    )
  )
    doomed.push({ path: join(local, name), why: "directorio de test" });

// Regenerables con npm run build:renderer && npm run render:baseline.
for (const name of [
  "reel-demo.mp4",
  "preview.png",
  "spanish.png",
  "validation.json",
  "ffprobe.json",
])
  doomed.push({
    path: resolve(workspace, "out", name),
    why: "baseline fase 0",
  });
for (const name of await readdir(resolve(workspace, "out")).catch(() => []))
  if (/^frame-\d+\.png$/.test(name))
    doomed.push({
      path: resolve(workspace, "out", name),
      why: "still de baseline",
    });

doomed.push({
  path: resolve(workspace, "scripts/__pycache__"),
  why: "caché de Python",
});

let total = 0;
const real: typeof doomed = [];
for (const item of doomed) {
  const size = await bytesOf(item.path);
  if (!(await stat(item.path).catch(() => null))) continue;
  total += size;
  real.push(item);
}

const grouped = new Map<string, number>();
for (const item of real)
  grouped.set(item.why, (grouped.get(item.why) ?? 0) + 1);

console.log(values.apply ? "BORRANDO" : "EN SECO (usa --apply para borrar)");
for (const [why, count] of [...grouped].sort((a, b) => b[1] - a[1]))
  console.log(`  ${String(count).padStart(4)} · ${why}`);
console.log(
  `\n${real.length} elementos · ${(total / 1e6).toFixed(0)} MB · se conservan ${kept.length} producciones`,
);
for (const entry of [...new Set(kept)].sort())
  console.log(`  conserva ${entry}`);

if (values.apply) {
  for (const item of real)
    await rm(item.path, { recursive: true, force: true });
  console.log(`\nBorrados ${real.length} elementos.`);
} else {
  console.log("\nNada borrado.");
}
