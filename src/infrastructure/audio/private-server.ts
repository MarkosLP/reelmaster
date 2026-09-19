import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve, relative, isAbsolute, extname } from "node:path";
import type { AssetManifest } from "../../snapshot/compile";
import { fileHash } from "./inspect";
export async function privateAssetServer(
  root: string,
  assets: AssetManifest,
  additional: { root: string; assets: AssetManifest }[] = [],
) {
  const files = new Map<string, Buffer>();
  const hashes = new Map<string, string>();
  let totalBytes = 0;
  for (const group of [{ root, assets }, ...additional])
    for (const a of Object.values(group.assets)) {
      if (
        !/^(audio\/[a-zA-Z0-9_-]+\.wav|visual-assets\/[a-f0-9]{64}\.(png|mp4))$/.test(
          a.path,
        )
      )
        throw new Error("Unsafe local media path");
      const path = await realpath(resolve(group.root, a.path));
      const part = relative(await realpath(group.root), path);
      if (!part || part.startsWith("..") || isAbsolute(part))
        throw new Error("Unsafe private asset path");
      if (files.has(a.path)) {
        if (
          hashes.get(a.path) !== a.contentHash ||
          (await fileHash(path)) !== a.contentHash
        )
          throw new Error("Conflicting private asset alias");
        continue;
      }
      totalBytes += (await stat(path)).size;
      if (totalBytes > 256 * 1024 * 1024)
        throw new Error("Private media allowlist exceeds 256 MiB");
      if ((await fileHash(path)) !== a.contentHash)
        throw new Error("Private audio hash mismatch");
      files.set(a.path, await readFile(path));
      hashes.set(a.path, a.contentHash);
    }
  const token = randomBytes(24).toString("hex");
  const server = createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }
    if (!req.url?.startsWith(`/${token}/`)) {
      res.writeHead(404).end();
      return;
    }
    const assetPath = req.url.slice(token.length + 2);
    const bytes = files.get(assetPath);
    if (!bytes) {
      res.writeHead(404).end();
      return;
    }
    const origin = req.headers.origin;
    if (origin && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
      res.writeHead(403).end();
      return;
    }
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Type",
      extname(assetPath) === ".png"
        ? "image/png"
        : extname(assetPath) === ".mp4"
          ? "video/mp4"
          : "audio/wav",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Accept-Ranges", "bytes");
    let start = 0,
      end = bytes.length - 1,
      status = 200;
    if (req.headers.range) {
      const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (!range) {
        res.writeHead(416).end();
        return;
      }
      start = Number(range[1]);
      end = range[2] ? Math.min(Number(range[2]), end) : end;
      if (start > end) {
        res.writeHead(416).end();
        return;
      }
      status = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${bytes.length}`);
    }
    res.setHeader("Content-Length", end - start + 1);
    res.writeHead(status);
    res.end(req.method === "HEAD" ? undefined : bytes.subarray(start, end + 1));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing loopback address");
  return {
    baseUrl: `http://127.0.0.1:${address.port}/${token}`,
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
      files.clear();
    },
  };
}
