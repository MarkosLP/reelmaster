import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { resolve } from "node:path";
import { fileHash } from "../audio/inspect";
import { privateRoot, atomicJson } from "../production/local-files";
import {
  PresenterEditReviewSchema,
  type PresenterEditReview,
} from "../../domain/presenter-edit-review";
import type { PresenterEditPlan } from "../../domain/presenter-edit";
import { reviewPage } from "./page";

const MAX_BODY_BYTES = 64 * 1024;

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function presenterReviewServer(options: {
  workspace: string;
  plan: PresenterEditPlan;
  planHash: string;
  videoPath: string;
  videoHash: string;
  reviewer: string;
}) {
  const { plan, planHash, videoHash, reviewer } = options;
  // El vídeo se comprueba antes de servirlo: se revisa el que se dice revisar.
  if ((await fileHash(options.videoPath)) !== videoHash)
    throw new Error("El vídeo no coincide con el hash declarado");
  const video = await readFile(options.videoPath);
  const reviewsRoot = await privateRoot(options.workspace, "reviews");
  const reviewPath = resolve(reviewsRoot, `${planHash}.json`);
  const token = randomBytes(24).toString("hex");
  const prefix = `/${token}/`;
  let saved: PresenterEditReview | null = null;
  let settle: (review: PresenterEditReview) => void = () => {};
  const done = new Promise<PresenterEditReview>((ok) => (settle = ok));

  const server = createServer((req, res) => {
    const url = req.url ?? "";
    if (
      !url.startsWith(prefix) ||
      !safeEqual(url.slice(1, 1 + token.length), token)
    ) {
      res.writeHead(404).end();
      return;
    }
    const route = url.slice(prefix.length).split("?")[0];
    const origin = req.headers.origin;
    if (origin && !/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) {
      res.writeHead(403).end();
      return;
    }
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    if (req.method === "POST" && route === "verdict") {
      const chunks: Buffer[] = [];
      let total = 0;
      req.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BODY_BYTES) {
          res.writeHead(413).end();
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => {
        void (async () => {
          try {
            const body: unknown = JSON.parse(
              Buffer.concat(chunks).toString("utf8"),
            );
            const review = PresenterEditReviewSchema.parse({
              ...(body as Record<string, unknown>),
              version: 1,
              planHash,
              videoHash,
              sourceHash: plan.sourceHash,
              durationFrames: plan.durationFrames,
              watched: true,
              reviewer: { kind: "human", name: reviewer },
              reviewedAt: new Date().toISOString(),
            });
            await atomicJson(reviewPath, review);
            saved = review;
            settle(review);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({ path: reviewPath, decision: review.decision }),
            );
          } catch (error) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error:
                  error instanceof Error ? error.message : "Revisión inválida",
              }),
            );
          }
        })();
      });
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405).end();
      return;
    }

    if (route === "" || route === "index.html") {
      const html = Buffer.from(reviewPage(), "utf8");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'none'; media-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
      );
      res.setHeader("Content-Length", html.length);
      res.writeHead(200);
      res.end(req.method === "HEAD" ? undefined : html);
      return;
    }

    if (route === "plan.json") {
      const payload = Buffer.from(
        JSON.stringify({ plan, planHash, videoHash, reviewer }),
        "utf8",
      );
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Length", payload.length);
      res.writeHead(200);
      res.end(req.method === "HEAD" ? undefined : payload);
      return;
    }

    if (route === "video.mp4") {
      res.setHeader("Content-Type", "video/mp4");
      res.setHeader("Accept-Ranges", "bytes");
      let start = 0,
        end = video.length - 1,
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
        res.setHeader("Content-Range", `bytes ${start}-${end}/${video.length}`);
      }
      res.setHeader("Content-Length", end - start + 1);
      res.writeHead(status);
      res.end(
        req.method === "HEAD" ? undefined : video.subarray(start, end + 1),
      );
      return;
    }
    res.writeHead(404).end();
  });

  await new Promise<void>((ok, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", ok);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing loopback address");
  return {
    url: `http://127.0.0.1:${address.port}${prefix}`,
    reviewPath,
    done,
    get review() {
      return saved;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((ok, fail) =>
        server.close((e) => (e ? fail(e) : ok())),
      );
    },
  };
}
