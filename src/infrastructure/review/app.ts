import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { atomicJson, privateRoot } from "../production/local-files";
import { PresenterEditReviewSchema } from "../../domain/presenter-edit-review";
import {
  discoverReels,
  discoverProductions,
  type Reel,
  type Production,
} from "./library";
import { saveExperiment } from "./experiments";
import { indexPage } from "./index-page";
import { reviewPage } from "./page";
import {
  LOOPBACK_ORIGIN,
  baseHeaders,
  readBody,
  sameToken,
  sendJson,
  sendMedia,
  sendPage,
} from "./http";

const MAX_BODY_BYTES = 64 * 1024;

export async function reelApp(options: {
  workspace: string;
  reviewer: string;
}) {
  const reviewsRoot = await privateRoot(options.workspace, "reviews");
  const loaded = new Map<string, Buffer>();
  const token = randomBytes(24).toString("hex");
  const prefix = `/${token}/`;

  // La biblioteca se reescanea sola: un render nuevo aparece sin reiniciar.
  // El sondeo de cada MP4 cuesta, así que se sostiene unos segundos.
  const CACHE_MS = 4000;
  let reels: Reel[] = [];
  let productions: Production[] = [];
  let byId = new Map<string, Reel>();
  let scannedAt = 0;
  async function library() {
    if (Date.now() - scannedAt < CACHE_MS) return { reels, productions };
    reels = await discoverReels(options.workspace);
    productions = await discoverProductions(options.workspace);
    byId = new Map(reels.map((r) => [r.id, r]));
    scannedAt = Date.now();
    return { reels, productions };
  }
  await library();

  async function videoOf(reel: Reel) {
    let bytes = loaded.get(reel.id);
    if (!bytes) {
      bytes = await readFile(reel.videoPath);
      loaded.set(reel.id, bytes);
    }
    return bytes;
  }

  const server = createServer((req, res) => {
    const url = req.url ?? "";
    if (
      !url.startsWith(prefix) ||
      !sameToken(url.slice(1, 1 + token.length), token)
    ) {
      res.writeHead(404).end();
      return;
    }
    const origin = req.headers.origin;
    if (origin && !LOOPBACK_ORIGIN.test(origin)) {
      res.writeHead(403).end();
      return;
    }
    baseHeaders(res);
    const route = decodeURIComponent(url.slice(prefix.length).split("?")[0]);

    void (async () => {
      try {
        if (route === "" || route === "index.html")
          return sendPage(req, res, indexPage());

        const current = await library();
        if (route === "api/library.json")
          return sendJson(req, res, {
            reviewer: options.reviewer,
            productions: current.productions,
            reels: current.reels.map((r) => ({
              id: r.id,
              phase: r.phase,
              name: r.id.split("/")[1],
              bytes: r.bytes,
              durationSeconds: r.durationSeconds,
              width: r.width,
              height: r.height,
              plan: Boolean(r.plan),
              review: r.review,
              fingerprint: r.fingerprint,
              experiment: r.experiment,
            })),
          });

        const match =
          /^r\/(.+?)\/(video\.mp4|review|plan\.json|verdict|experiment)$/.exec(
            route,
          );
        if (!match) return void res.writeHead(404).end();
        const reel = byId.get(match[1]);
        if (!reel) return void res.writeHead(404).end();

        if (match[2] === "video.mp4")
          return sendMedia(req, res, await videoOf(reel), "video/mp4");

        if (match[2] === "experiment") {
          if (req.method !== "POST") return void res.writeHead(405).end();
          if (!reel.fingerprint)
            return sendJson(
              req,
              res,
              { error: "Este reel no tiene huella estructural que registrar" },
              400,
            );
          const input = JSON.parse(
            await readBody(req, MAX_BODY_BYTES),
          ) as Record<string, unknown>;
          const saved = await saveExperiment(options.workspace, {
            reelId: reel.id,
            videoHash: reel.videoHash,
            fingerprint: reel.fingerprint,
            publishedAt: (input.publishedAt as string | null) ?? null,
            metrics: input.metrics ?? null,
            notes: (input.notes as string) ?? "",
          });
          reel.experiment = saved.experiment;
          return sendJson(req, res, { path: saved.path });
        }

        if (!reel.plan || !reel.planHash) return void res.writeHead(404).end();

        if (match[2] === "review") return sendPage(req, res, reviewPage());

        if (match[2] === "plan.json")
          return sendJson(req, res, {
            plan: reel.plan,
            planHash: reel.planHash,
            videoHash: reel.videoHash,
            reviewer: options.reviewer,
            review: reel.review,
          });

        if (req.method !== "POST") return void res.writeHead(405).end();
        const body: unknown = JSON.parse(await readBody(req, MAX_BODY_BYTES));
        const review = PresenterEditReviewSchema.parse({
          ...(body as Record<string, unknown>),
          version: 1,
          planHash: reel.planHash,
          videoHash: reel.videoHash,
          sourceHash: reel.plan.sourceHash,
          durationFrames: reel.plan.durationFrames,
          watched: true,
          reviewer: { kind: "human", name: options.reviewer },
          reviewedAt: new Date().toISOString(),
        });
        const path = resolve(reviewsRoot, `${reel.planHash}.json`);
        await atomicJson(path, review);
        reel.review = review;
        return sendJson(req, res, { path, decision: review.decision });
      } catch (error) {
        if (res.headersSent) return;
        sendJson(
          req,
          res,
          {
            error: error instanceof Error ? error.message : "Petición inválida",
          },
          400,
        );
      }
    })();
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
    get reels() {
      return reels;
    },
    get productions() {
      return productions;
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((ok, fail) =>
        server.close((e) => (e ? fail(e) : ok())),
      );
      loaded.clear();
    },
  };
}
