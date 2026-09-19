import { test } from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";
test("composition lint rejects nondeterministic calls and infrastructure imports", async () => {
  const eslint = new ESLint();
  for (const source of [
    "Date.now();",
    "Math.random();",
    'fetch("https://example.com");',
    'import "../infrastructure/provider";',
    'import "../domain/reel";',
  ]) {
    const [result] = await eslint.lintText(source, {
      filePath: "src/composition/probe.ts",
    });
    assert.ok(
      result.messages.some((m) => m.ruleId?.startsWith("no-restricted-")),
      source,
    );
  }
});
