import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { reelApp } from "../src/infrastructure/review/app";

const { values } = parseArgs({
  options: { reviewer: { type: "string" } },
  strict: true,
});
const app = await reelApp({
  workspace: resolve("."),
  reviewer: values.reviewer?.trim() || "Marcos",
});
console.log(`\n  ReelMaster  ->  ${app.url}\n`);
console.log(
  `  ${app.reels.length} reels · ${app.reels.filter((r) => r.plan).length} revisables · ${app.productions.length} producciones`,
);
console.log("  Ctrl-C para cerrar.\n");
process.once("SIGINT", () => {
  void app.close().then(() => process.exit(0));
});
