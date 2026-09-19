import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import { parseArgs } from "node:util";
import { PresenterEditPlanSchema } from "../src/domain/presenter-edit";
import { contentHash } from "../src/snapshot/hash";
import { fileHash } from "../src/infrastructure/audio/inspect";
import { presenterReviewServer } from "../src/infrastructure/review/server";

const { values } = parseArgs({
  options: {
    plan: { type: "string" },
    video: { type: "string" },
    reviewer: { type: "string" },
  },
  strict: true,
});
if (!values.plan || !values.video)
  throw Error("--plan y --video son obligatorios");

const workspace = resolve(".");
// El plan y sus recetas viven en .local/; el montaje que se revisa es una
// entrega y vive en out/. Ambos están fuera de Git, ninguno es público.
async function assertInside(path: string, areas: string[]) {
  if (path.startsWith("\\\\") || path.startsWith("//"))
    throw Error("Network paths are forbidden");
  let canonical: string;
  try {
    canonical = await realpath(path);
  } catch {
    throw Error(`No se puede resolver la ruta: ${path}`);
  }
  for (const area of areas) {
    const part = relative(await realpath(resolve(area)), canonical);
    if (part && !part.startsWith("..") && !isAbsolute(part)) return canonical;
  }
  throw Error(`La ruta debe estar dentro de ${areas.join(" o ")}: ${path}`);
}

const planPath = await assertInside(resolve(values.plan), [".local"]);
const videoPath = await assertInside(resolve(values.video), [".local", "out"]);
const plan = PresenterEditPlanSchema.parse(
  JSON.parse(await readFile(planPath, "utf8")),
);
const server = await presenterReviewServer({
  workspace,
  plan,
  planHash: contentHash(plan),
  videoPath,
  videoHash: await fileHash(videoPath),
  reviewer: values.reviewer?.trim() || "Marcos",
});
console.log(`Revisión abierta en ${server.url}`);
console.log(`El veredicto se guardará en ${server.reviewPath}`);
console.log("Ctrl-C para cerrar sin decidir.");

const stop = async (code: number) => {
  await server.close();
  process.exit(code);
};
process.once("SIGINT", () => void stop(1));
const review = await server.done;
console.log(
  `Guardado: ${review.decision}${review.timingApproval ? " · tiempos aprobados" : ""}`,
);
await stop(0);
