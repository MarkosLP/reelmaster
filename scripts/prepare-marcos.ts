import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { prepareRecording } from "../src/infrastructure/audio/prepare";
import { createMarcosReel } from "../src/application/prepare-marcos";
import { LocalEstimatedAlignment } from "../src/infrastructure/alignment/local-estimator";
import { compileCompositionSnapshot } from "../src/snapshot/compile";
import { contentHash } from "../src/snapshot/hash";
const destination = resolve(".local/marcos");
const preparation = await prepareRecording(resolve("."), destination);
const prepared = createMarcosReel(preparation, new LocalEstimatedAlignment());
const snapshot = compileCompositionSnapshot(prepared.reel, prepared.assets);
await writeFile(
  resolve(destination, "prepared.json"),
  JSON.stringify(prepared, null, 2) + "\n",
);
await writeFile(
  resolve(destination, "snapshot.json"),
  JSON.stringify(snapshot, null, 2) + "\n",
);
console.log({
  original: preparation.original.name,
  durationMs: preparation.normalized.measuredDurationMs,
  scenes: prepared.reel.scenes.length,
  timingSource: "ESTIMATED",
  snapshotHash: contentHash(snapshot),
  preparationSeconds: preparation.preparationSeconds,
  apiCost: 0,
});
