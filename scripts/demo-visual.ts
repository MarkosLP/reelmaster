import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import { createTechnicalVisualProduction } from "../tests/fixtures/visual-fixtures";
import {
  listProductionAssets,
  assignProductionAsset,
} from "../src/infrastructure/visual/operations";
import { atomicJson } from "../src/infrastructure/production/local-files";
if (process.env.CI || !process.argv.includes("--technical"))
  throw new Error("Technical demo requires --technical and must not run in CI");
const workspace = resolve("."),
  demo = await createTechnicalVisualProduction(workspace);
await listProductionAssets(workspace, demo.planPath);
await assignProductionAsset(
  workspace,
  demo.planPath,
  "visual-scene-1",
  demo.fixtures.image,
  { fit: "contain" },
  true,
);
await assignProductionAsset(
  workspace,
  demo.planPath,
  "visual-scene-2",
  demo.fixtures.video,
  { fit: "cover", startOffsetMs: 500 },
  true,
);
const result = await assignProductionAsset(
  workspace,
  demo.planPath,
  "visual-scene-3",
  demo.fixtures.screen,
  undefined,
  true,
);
await mkdir(resolve(".local/phase-1d"), { recursive: true });
await atomicJson(resolve(".local/phase-1d/technical-demo.json"), {
  technicalFixture: true,
  planPath: demo.planPath,
  directory: demo.directory,
  productionId: demo.plan.id,
  fixtureDirectory: demo.fixtures.mediaDirectory,
  state: result.plan.state.kind,
});
console.log({
  technicalFixture: true,
  productionId: demo.plan.id,
  planPath: demo.planPath,
  state: result.plan.state.kind,
  message:
    "Patrones, captura simulada, vídeo de test y tonos. No es contenido de Marcos.",
});
