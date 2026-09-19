import { bundle } from "@remotion/bundler";
import { resolve } from "node:path";
console.log(
  await bundle({
    entryPoint: resolve("src/composition/index.tsx"),
    outDir: resolve("build/renderer"),
  }),
);
