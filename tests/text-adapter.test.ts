import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import {
  OllamaTextAdapter,
  validateOllamaConfig,
  ollamaConfigFromEnvironment,
} from "../src/infrastructure/text/ollama";
const request = {
  system: "Return JSON",
  user: "Example",
  schema: { type: "object" },
  parameters: { temperature: 0.2, maxOutputTokens: 500, seed: 42 },
};
async function serverFor(
  chat: (req: http.IncomingMessage, res: http.ServerResponse) => void,
  options: { remote?: boolean; absent?: boolean } = {},
) {
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/version")
      res.end(JSON.stringify({ version: "test" }));
    else if (req.url === "/api/tags")
      res.end(
        JSON.stringify({
          models: options.absent ? [] : [{ name: "test:local", digest: "abc" }],
        }),
      );
    else if (req.url === "/api/show")
      res.end(
        JSON.stringify(
          options.remote
            ? { remote_host: "https://remote" }
            : { capabilities: ["completion"] },
        ),
      );
    else if (req.url === "/api/chat") chat(req, res);
    else {
      res.statusCode = 404;
      res.end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  return {
    config: {
      endpoint: `http://127.0.0.1:${address.port}`,
      model: "test:local",
      timeoutMs: 2000,
    },
    close: async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
test("Endpoint configuration blocks remote origins, credentials, paths and unknown keys", () => {
  const base = { model: "local", timeoutMs: 1000 };
  for (const endpoint of [
    "https://127.0.0.1",
    "http://example.com",
    "http://127.0.0.1.evil.com",
    "http://0.0.0.0",
    "http://192.168.1.1",
    "http://user:pass@localhost",
    "http://localhost/api",
    "http://localhost?x=1",
    "http://localhost/#x",
    "file:///x",
  ])
    assert.throws(() => validateOllamaConfig({ ...base, endpoint }), {
      code: "CONFIGURATION",
    });
  assert.equal(
    validateOllamaConfig({ ...base, endpoint: "http://localhost:11434" })
      .endpoint,
    "http://127.0.0.1:11434",
  );
  assert.equal(
    validateOllamaConfig({ ...base, endpoint: "http://[::1]:11434" }).endpoint,
    "http://[::1]:11434",
  );
  assert.throws(
    () =>
      validateOllamaConfig({
        ...base,
        endpoint: "http://localhost",
        extra: true,
      }),
    { code: "CONFIGURATION" },
  );
});
test("Environment chooses installed model without accepting IdeaRequest settings", () => {
  assert.equal(
    ollamaConfigFromEnvironment({ REELMASTER_TEXT_MODEL: "test:local" }).model,
    "test:local",
  );
  assert.throws(
    () =>
      ollamaConfigFromEnvironment({
        REELMASTER_TEXT_ENDPOINT: "https://remote",
      }),
    { code: "CONFIGURATION" },
  );
});
test("Adapter sends JSON schema and local options and returns usage/identity", async () => {
  let body: Record<string, unknown> = {};
  const local = await serverFor((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      body = JSON.parse(Buffer.concat(chunks).toString());
      res.end(
        JSON.stringify({
          model: "test:local",
          done: true,
          message: { content: '{"ok":true}' },
          prompt_eval_count: 10,
          eval_count: 5,
        }),
      );
    });
  });
  try {
    const adapter = await OllamaTextAdapter.connect(local.config);
    const result = await adapter.generateStructured(request);
    assert.deepEqual(body.format, request.schema);
    assert.equal(body.stream, false);
    assert.deepEqual(body.options, {
      temperature: 0.2,
      num_predict: 500,
      seed: 42,
    });
    assert.deepEqual(result.usage, { inputTokens: 10, outputTokens: 5 });
    assert.equal(result.info.modelDigest, "abc");
    assert.ok(result.elapsedMs > 0);
  } finally {
    await local.close();
  }
});
test("Missing and remote models fail before chat and never pull", async () => {
  for (const options of [{ absent: true }, { remote: true }]) {
    const local = await serverFor(
      () => assert.fail("No chat allowed"),
      options,
    );
    try {
      await assert.rejects(OllamaTextAdapter.connect(local.config), {
        code: "CONFIGURATION",
      });
    } finally {
      await local.close();
    }
  }
});
test("Redirect is rejected without following location", async () => {
  const local = await serverFor((_req, res) => {
    res.writeHead(302, { Location: "http://192.0.2.1" });
    res.end();
  });
  try {
    const adapter = await OllamaTextAdapter.connect(local.config);
    await assert.rejects(adapter.generateStructured(request), {
      code: "PROVIDER_ERROR",
    });
  } finally {
    await local.close();
  }
});
test("Total request timeout is typed", async () => {
  const local = await serverFor(() => {});
  try {
    const adapter = await OllamaTextAdapter.connect({
      ...local.config,
      timeoutMs: 100,
    });
    await assert.rejects(adapter.generateStructured(request), {
      code: "TIMEOUT",
    });
  } finally {
    await local.close();
  }
});
test("Cancellation aborts in-flight HTTP", async () => {
  const controller = new AbortController();
  const local = await serverFor(() => controller.abort());
  try {
    const adapter = await OllamaTextAdapter.connect(local.config);
    await assert.rejects(
      adapter.generateStructured({ ...request, signal: controller.signal }),
      { code: "ABORTED" },
    );
  } finally {
    await local.close();
  }
});
test("Malformed envelope, HTTP failure, oversized response and truncation are typed", async () => {
  for (const handler of [
    (_req: http.IncomingMessage, res: http.ServerResponse) =>
      res.end("not-json"),
    (_req: http.IncomingMessage, res: http.ServerResponse) => {
      res.statusCode = 500;
      res.end("private-details");
    },
    (_req: http.IncomingMessage, res: http.ServerResponse) =>
      res.end("x".repeat(300000)),
    (_req: http.IncomingMessage, res: http.ServerResponse) =>
      res.end(
        JSON.stringify({
          model: "test:local",
          done: true,
          done_reason: "length",
          message: { content: "{}" },
        }),
      ),
    (_req: http.IncomingMessage, res: http.ServerResponse) =>
      res.end(
        JSON.stringify({
          model: "other",
          done: true,
          message: { content: "{}" },
        }),
      ),
  ]) {
    const local = await serverFor(handler);
    try {
      const adapter = await OllamaTextAdapter.connect(local.config);
      await assert.rejects(adapter.generateStructured(request), {
        code: "PROVIDER_ERROR",
      });
    } finally {
      await local.close();
    }
  }
});
