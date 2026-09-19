import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { resolveProductionVisuals } from "../src/infrastructure/visual/resolve-production";
const { values } = parseArgs({
  options: {
    production: { type: "string" },
    execute: { type: "boolean", default: false },
  },
});
if (!values.production || !/^production-[a-f0-9]{64}$/.test(values.production))
  throw Error("--production requires a production ID");
const result = await resolveProductionVisuals(
  resolve("."),
  resolve(".local/productions", values.production, "production-plan.json"),
  values.execute,
);
console.log(JSON.stringify(result, null, 2));
if (result.errors.length) process.exitCode = 1;
