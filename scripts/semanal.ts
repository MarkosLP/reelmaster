import { resolve } from "node:path";
import { discoverReels } from "../src/infrastructure/review/library";
import type { ReelExperiment } from "../src/domain/reel-experiment";

// Repaso semanal del registro. No concluye nada por su cuenta: cuenta lo que
// hay, señala lo que falta medir y solo compara cuando hay con qué comparar.
const MINIMO_PARA_COMPARAR = 6;

const reels = await discoverReels(resolve("."));
const conHuella = reels.filter((r) => r.fingerprint);
const publicados = conHuella.filter((r) => r.experiment?.publishedAt);
const medidos = publicados.filter((r) => r.experiment?.metrics);
const sinMedir = publicados.filter((r) => !r.experiment?.metrics);
const sinPublicar = conHuella.filter((r) => !r.experiment?.publishedAt);

const linea = (n = 62) => "─".repeat(n);
console.log(`\n${linea()}`);
console.log("  REPASO SEMANAL");
console.log(linea());
console.log(
  `  ${conHuella.length} reels con huella · ${publicados.length} publicados · ${medidos.length} medidos\n`,
);

if (sinMedir.length) {
  console.log(
    "  PENDIENTE DE MEDIR — entra en Instagram y apunta los números:",
  );
  for (const r of sinMedir)
    console.log(
      `    ${r.id}  (publicado ${r.experiment!.publishedAt!.slice(0, 10)})`,
    );
  console.log();
}

if (sinPublicar.length) {
  console.log("  LISTOS PARA PUBLICAR:");
  for (const r of sinPublicar) {
    const f = r.fingerprint!;
    console.log(
      `    ${r.id.padEnd(34)} gancho ${String(f.firstCutSeconds).padStart(4)}s · ${f.cuts} cortes · texto ${Math.round(f.textOnScreenRatio * 100)}%`,
    );
  }
  console.log();
}

if (medidos.length < MINIMO_PARA_COMPARAR) {
  console.log(
    `  Con ${medidos.length} reels medidos todavía no hay nada que concluir.`,
  );
  console.log(
    `  Hacen falta al menos ${MINIMO_PARA_COMPARAR} para que una diferencia`,
  );
  console.log("  signifique algo y no sea el azar de una semana.\n");
} else {
  const puntua = (e: ReelExperiment) =>
    (e.metrics?.saves ?? 0) * 3 +
    (e.metrics?.shares ?? 0) * 3 +
    (e.metrics?.likes ?? 0);
  const orden = [...medidos].sort(
    (a, b) => puntua(b.experiment!) - puntua(a.experiment!),
  );
  console.log(
    "  MEDIDOS, de mejor a peor (guardados y compartidos pesan más):",
  );
  console.log(
    `    ${"reel".padEnd(30)} ${"gancho".padStart(7)} ${"cortes".padStart(7)} ${"texto".padStart(6)} ${"likes".padStart(7)}`,
  );
  for (const r of orden) {
    const f = r.fingerprint!,
      m = r.experiment!.metrics!;
    console.log(
      `    ${r.id.slice(0, 30).padEnd(30)} ${String(f.firstCutSeconds).padStart(6)}s ${String(f.cuts).padStart(7)} ${String(Math.round(f.textOnScreenRatio * 100) + "%").padStart(6)} ${String(m.likes ?? "—").padStart(7)}`,
    );
  }
  const mitad = Math.floor(orden.length / 2);
  const media = (lista: typeof orden) =>
    lista.reduce((t, r) => t + r.fingerprint!.firstCutSeconds, 0) /
    (lista.length || 1);
  console.log(
    `\n  Gancho medio · mejores ${media(orden.slice(0, mitad)).toFixed(1)}s · peores ${media(orden.slice(-mitad)).toFixed(1)}s`,
  );
  console.log(
    "  Es una señal, no una conclusión: hay una variable por reel y muchas\n  cosas cambian a la vez. Sirve para elegir qué probar, no para cerrar.\n",
  );
}

console.log("  Esta semana:");
if (sinMedir.length) console.log("    1. Mide lo publicado (arriba).");
if (sinPublicar.length) console.log("    2. Publica uno de los listos.");
console.log("    3. npm run app  para apuntar los números.\n");
