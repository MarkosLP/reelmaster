import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { z } from "zod";
import {
  prepareProduction,
  importProduction,
} from "../src/infrastructure/production/operations";
import { inspectRecording } from "../src/infrastructure/audio/import-recording";
import { ProductionError } from "../src/application/production-plan";
try {
  const mode = process.argv[2];
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      draft: { type: "string" },
      plan: { type: "string" },
      audio: { type: "string" },
      review: { type: "string" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (mode === "prepare" && values.draft) {
    const result = await prepareProduction(resolve("."), resolve(values.draft));
    console.log({
      productionId: result.plan.id,
      state: result.plan.state.kind,
      directory: result.directory,
      pendingVisuals: result.plan.assetRequirements.filter(
        (a) => a.status === "pending",
      ).length,
      apiCostEur: 0,
    });
  } else if (mode === "inspect" && values.audio) {
    console.log(
      (await inspectRecording(resolve("."), resolve(values.audio))).info,
    );
  } else if (
    mode === "import" &&
    values.plan &&
    values.audio &&
    values.review
  ) {
    const result = await importProduction(
      resolve("."),
      resolve(values.plan),
      resolve(values.audio),
      resolve(values.review),
    );
    console.log({
      state: result.plan.state.kind,
      importedRoot: result.importedRoot,
      delta: result.delta,
      elapsedMs: result.elapsedMs,
      apiCostEur: 0,
    });
  } else
    throw new ProductionError(
      "INVALID_PLAN",
      "Use prepare --draft, inspect --audio, or import --plan --audio --review",
    );
} catch (error) {
  console.error(
    error instanceof ProductionError
      ? { code: error.code, message: error.message }
      : error instanceof z.ZodError
        ? {
            code: "INVALID_DATA",
            fields: error.issues.map((i) => ({
              path: i.path.join("."),
              code: i.code,
            })),
          }
        : {
            code: "LOCAL_OPERATION_FAILED",
            message:
              "Check local files and CLI arguments; no production state was intentionally advanced on failure",
          },
  );
  process.exitCode = 1;
}
