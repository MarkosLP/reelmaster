import { parseArgs } from "node:util";
import { resolve } from "node:path";
import {
  listProductionAssets,
  assignProductionAsset,
  productionAssetStatus,
} from "../src/infrastructure/visual/operations";
import { ProductionError } from "../src/application/production-plan";
import { BindingPresentationSchema } from "../src/domain/visual-asset";
try {
  const mode = process.argv[2];
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      production: { type: "string" },
      requirement: { type: "string" },
      file: { type: "string" },
      fit: { type: "string" },
      "focal-x": { type: "string" },
      "focal-y": { type: "string" },
      "start-ms": { type: "string" },
      technical: { type: "boolean", default: false },
    },
    strict: true,
  });
  if (
    !values.production ||
    !/^production-[a-f0-9]{64}$/.test(values.production)
  )
    throw new ProductionError(
      "INVALID_PLAN",
      "--production requires the production ID",
    );
  const workspace = resolve("."),
    planPath = resolve(
      ".local/productions",
      values.production,
      "production-plan.json",
    );
  if (mode === "assign") {
    if (!values.requirement || !values.file)
      throw new ProductionError(
        "INVALID_PLAN",
        "--requirement and --file are required",
      );
    const options = BindingPresentationSchema.partial().parse({
      ...(values.fit ? { fit: values.fit } : {}),
      ...(values["focal-x"] ? { focalPointX: Number(values["focal-x"]) } : {}),
      ...(values["focal-y"] ? { focalPointY: Number(values["focal-y"]) } : {}),
      ...(values["start-ms"]
        ? { startOffsetMs: Number(values["start-ms"]) }
        : {}),
    });
    const result = await assignProductionAsset(
      workspace,
      planPath,
      values.requirement,
      values.file,
      options,
      values.technical,
    );
    console.log({
      requirement: values.requirement,
      status: "validated",
      assetType: result.asset.type,
      physicalType: result.asset.metadata.kind,
      unresolved: result.manifest.unresolvedCount,
      productionStatus: result.plan.state.kind,
      apiCostEur: 0,
    });
  } else if (mode === "status")
    console.log(
      JSON.stringify(await productionAssetStatus(workspace, planPath), null, 2),
    );
  else if (mode === "list") {
    const { plan, manifest } = await listProductionAssets(workspace, planPath);
    console.log(
      `${plan.draft.title}\nProducción: ${plan.state.kind}\nRecursos pendientes: ${manifest.unresolvedCount}`,
    );
    for (const requirement of manifest.requirements)
      console.log(
        `${requirement.requirementId} | ${requirement.requiredType} | ${requirement.status}\n  ${requirement.description}`,
      );
    if (!manifest.requirements.length)
      console.log(
        "Todas las escenas son textOnly: no requieren archivos visuales.",
      );
  } else throw new ProductionError("INVALID_PLAN", "Unknown asset command");
} catch (error) {
  console.error(
    error instanceof ProductionError
      ? { code: error.code, message: error.message }
      : {
          code: "INVALID_VISUAL",
          message: "Check local media and binding parameters",
        },
  );
  process.exitCode = 1;
}
