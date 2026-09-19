import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { preparePresenter } from "../src/infrastructure/presenter/prepare";
const { values } = parseArgs({
  options: {
    source: { type: "string" },
    presenter: { type: "string" },
    "target-lufs": { type: "string", default: "-18" },
  },
  strict: true,
});
if (!values.source || !values.presenter)
  throw Error("--source and --presenter are required");
const result = await preparePresenter(
  resolve("."),
  resolve(values.source),
  values.presenter,
  Number(values["target-lufs"]),
);
console.log(
  JSON.stringify(
    {
      directory: result.directory,
      assetId: result.asset.assetId,
      prepared: result.asset.preparedPath,
      audio: result.asset.audio,
      temporalModifications: result.asset.temporalModifications,
      apiCostEur: 0,
    },
    null,
    2,
  ),
);
