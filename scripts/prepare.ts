import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { demo, assets } from "../src/fixtures/demo";
import { compileCompositionSnapshot } from "../src/snapshot/compile";
for (const asset of Object.values(assets)) {
  const bytes = await readFile(`public/${asset.path}`);
  if (createHash("sha256").update(bytes).digest("hex") !== asset.contentHash)
    throw new Error("Asset hash mismatch");
}
await writeFile(
  "src/fixtures/snapshot.json",
  JSON.stringify(compileCompositionSnapshot(demo, assets), null, 2) + "\n",
);
