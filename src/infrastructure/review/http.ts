import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";

// Primitivas compartidas por las superficies locales. Mismo trato que
// private-server.ts: loopback, token en la ruta y nada cacheado.
export const LOOPBACK_ORIGIN = /^http:\/\/127\.0\.0\.1:\d+$/;

export function sameToken(candidate: string, token: string) {
  const a = Buffer.from(candidate),
    b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function baseHeaders(res: ServerResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

export function sendPage(
  req: IncomingMessage,
  res: ServerResponse,
  html: string,
) {
  const bytes = Buffer.from(html, "utf8");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'none'; media-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'",
  );
  res.setHeader("Content-Length", bytes.length);
  res.writeHead(200);
  res.end(req.method === "HEAD" ? undefined : bytes);
}

export function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  value: unknown,
  status = 200,
) {
  const bytes = Buffer.from(JSON.stringify(value), "utf8");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", bytes.length);
  res.writeHead(status);
  res.end(req.method === "HEAD" ? undefined : bytes);
}

// Sirve con Accept-Ranges para que el navegador pueda arrastrar por la barra
// sin descargar el archivo entero.
export function sendMedia(
  req: IncomingMessage,
  res: ServerResponse,
  bytes: Buffer,
  contentType: string,
) {
  res.setHeader("Content-Type", contentType);
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
}

export async function readBody(req: IncomingMessage, limit: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > limit) throw new Error("Cuerpo demasiado grande");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
