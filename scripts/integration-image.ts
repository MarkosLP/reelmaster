import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { technicalImageProduction } from "./phase-1g-fixture";
import { planVisuals } from "../src/application/visual-planning";
import { createVisualManifest } from "../src/application/visual-manifest";
import { GeneratedImageResolver } from "../src/infrastructure/visual/generated-image-resolver";
import { ComfyUIImageProvider } from "../src/infrastructure/visual/comfy-image-provider";
import { readComfyConfig } from "../src/infrastructure/visual/comfy-config";
import {
  atomicJson,
  privateRoot,
} from "../src/infrastructure/production/local-files";
import { fileHash } from "../src/infrastructure/audio/inspect";

if (process.env.CI || !process.argv.includes("--real-local"))
  throw Error(
    "Requires --real-local outside CI and REELMASTER_COMFY_CONFIG; generates one real image",
  );
const config = readComfyConfig();
if (!config) throw Error("Explicit local configuration is required");
const workspace = resolve("."),
  plan = technicalImageProduction(true);
const directory = resolve(await privateRoot(workspace, "productions"), plan.id);
await mkdir(directory, { recursive: true });
const provider = new ComfyUIImageProvider(config);
const entry = planVisuals(
  plan,
  createVisualManifest(plan),
  provider.capability(),
)[0];
const resolver = new GeneratedImageResolver(workspace, directory, provider);
try {
  const result = await resolver.resolve(entry);
  assert.equal(result.asset.source.kind, "generatedLocalAI");
  assert.equal(result.asset.metadata.width, 512);
  assert.equal(result.asset.metadata.height, 768);
  assert.equal(
    await fileHash(resolve(directory, result.asset.path)),
    result.asset.contentHash,
  );
  await provider.close();
  // A closed provider refuses generate(): this proves that a valid cache hit needs no backend.
  const cache = await resolver.resolve(entry);
  assert.equal(cache.metrics.cacheHit, true);
  assert.deepEqual(cache.asset, result.asset);
  await mkdir(resolve(".local/phase-1g"), { recursive: true });
  await atomicJson(resolve(".local/phase-1g/integration.json"), {
    status: "PASS",
    productionId: plan.id,
    directory,
    entry,
    result,
    cache: cache.metrics,
    backend: provider.metrics,
    apiCostEur: 0,
  });
  console.log({
    status: "PASS",
    image: resolve(directory, result.asset.path),
    cache: cache.metrics.cache,
    backend: provider.metrics,
  });
} finally {
  await provider.close();
}
