import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, access, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import {
  type VisualResolver,
  type VisualResolution,
} from "../../application/ports/visual-resolver";
import {
  VisualPlanSchema,
  VisualResolutionError,
  type VisualPlan,
} from "../../domain/visual-plan";
import { VisualAssetSchema } from "../../domain/visual-asset";
import { contentHash } from "../../snapshot/hash";
import { fileHash } from "../audio/inspect";
import { localBrowser } from "../audio/browser";
import { atomicJson, assertInside } from "../production/local-files";
import { importVisualAsset } from "./import-asset";
import { graphicCanvasProgram } from "./graphic-canvas";
const run = promisify(execFile),
  require = createRequire(import.meta.url);
export class LocalGraphicResolver implements VisualResolver {
  readonly id = "localGraphic-v1";
  constructor(
    private readonly workspace: string,
    private readonly directory: string,
    private readonly technical = false,
  ) {}
  async resolve(raw: VisualPlan): Promise<VisualResolution> {
    try {
      return await this.resolveLocal(raw);
    } catch (error) {
      if (error instanceof VisualResolutionError) throw error;
      throw new VisualResolutionError(
        "GENERATION_FAILED",
        "Local graphic could not be generated or validated",
      );
    }
  }
  private async resolveLocal(raw: VisualPlan): Promise<VisualResolution> {
    const started = performance.now();
    await assertInside(
      resolve(this.workspace, ".local/productions"),
      this.directory,
    );
    const checked = VisualPlanSchema.safeParse(raw);
    if (!checked.success)
      throw new VisualResolutionError(
        "INVALID_SPEC",
        "Invalid VisualPlan/GraphicSpec",
      );
    const plan = checked.data;
    if (plan.strategy === "manual")
      throw new VisualResolutionError("MANUAL_REQUIRED", plan.reason);
    if (!["localGraphic", "localTextVisual"].includes(plan.strategy))
      throw new VisualResolutionError(
        "UNSUPPORTED_STRATEGY",
        "Resolver implements local graphics only",
      );
    const browser = await localBrowser();
    const fontPath =
      require.resolve("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2");
    const fontHash = await fileHash(fontPath),
      browserHash = await fileHash(browser);
    const inputHash = contentHash({
      spec: plan.graphicSpec,
      brand: plan.brand,
      resolver: this.id,
      recipeVersion: 1,
      fontHash,
      browserHash,
      programHash: contentHash(graphicCanvasProgram),
    });
    const cache = resolve(this.directory, "visual-assets", "generated");
    await mkdir(cache, { recursive: true });
    await assertInside(this.directory, cache);
    const png = resolve(cache, `${inputHash}.png`),
      receipt = resolve(cache, `${inputHash}.json`);
    let hit = false;
    try {
      await access(receipt);
      hit = true;
    } catch {
      /* cache miss */
    }
    if (hit) {
      try {
        const saved = JSON.parse(
          await readFile(await assertInside(cache, receipt), "utf8"),
        ) as { inputHash: string; contentHash: string };
        if (
          saved.inputHash !== inputHash ||
          (await fileHash(await assertInside(cache, png))) !== saved.contentHash
        )
          throw Error("hash");
      } catch {
        throw new VisualResolutionError(
          "CACHE_CORRUPT",
          "Cached graphic hash mismatch; no unverified reuse",
        );
      }
    } else {
      const html = resolve(cache, `${inputHash}.html`);
      const payload = JSON.stringify({
        spec: plan.graphicSpec,
        brand: plan.brand,
        font: (await readFile(fontPath)).toString("base64"),
      }).replaceAll("<", "\\u003c");
      await writeFile(
        html,
        `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; font-src data:"><script id="payload" type="application/json">${payload}</script><pre id="result"></pre><script>${graphicCanvasProgram}</script>`,
        { flag: "wx" },
      );
      try {
        const { stdout } = await run(
          browser,
          [
            "--headless",
            "--no-sandbox",
            "--disable-gpu",
            "--disable-background-networking",
            "--disable-component-update",
            "--disable-sync",
            "--no-first-run",
            "--no-default-browser-check",
            "--host-resolver-rules=MAP * ~NOTFOUND",
            "--virtual-time-budget=5000",
            "--dump-dom",
            pathToFileURL(html).href,
          ],
          { timeout: 30000, maxBuffer: 8 * 1024 * 1024, windowsHide: true },
        );
        const match = stdout.match(/<pre id="result">(.*?)<\/pre>/s);
        if (!match)
          throw new VisualResolutionError(
            "GENERATION_FAILED",
            "Local canvas did not return a result",
          );
        const result = JSON.parse(match[1]) as {
          ok: boolean;
          code: string;
          png: string;
        };
        if (!result.ok)
          throw new VisualResolutionError(
            result.code === "OVERFLOW" ? "OVERFLOW" : "INVALID_SPEC",
            "Graphic cannot fit the fixed readable layout",
          );
        const bytes = Buffer.from(result.png, "base64");
        let orphan = false;
        try {
          await access(png);
          orphan = true;
        } catch {
          /* no partial cache entry */
        }
        if (orphan) {
          const existing = await readFile(await assertInside(cache, png));
          if (!existing.equals(bytes))
            throw new VisualResolutionError(
              "CACHE_CORRUPT",
              "Uncommitted cached graphic differs from regenerated bytes",
            );
        } else await writeFile(png, bytes, { flag: "wx" });
        await atomicJson(receipt, {
          inputHash,
          contentHash: await fileHash(png),
        });
      } catch (error) {
        if (error instanceof VisualResolutionError) throw error;
        throw new VisualResolutionError(
          "GENERATION_FAILED",
          "Local raster generation failed",
        );
      } finally {
        await unlink(html);
      }
    }
    const imported = await importVisualAsset(
      this.workspace,
      this.directory,
      png,
      "image",
      "unused",
      this.technical,
    );
    const generation = {
      resolver: "localGraphic-v1" as const,
      recipeVersion: 1 as const,
      inputHash,
      contentHash: imported.contentHash,
      fontHash,
      browserHash,
      semanticType: "illustrativeGraphic" as const,
    };
    const asset = VisualAssetSchema.parse({
      ...imported,
      id: `visual-${contentHash({ importedId: imported.id, generation })}`,
      type: "illustrativeGraphic",
      source: { ...imported.source, kind: "generatedLocal" },
      generation,
    });
    return {
      asset,
      metrics: {
        generationMs: performance.now() - started,
        cache: hit ? "hit" : "miss",
        bytes: asset.bytes,
        inputHash,
      },
    };
  }
}
