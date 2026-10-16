import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const script = path.resolve("scripts/collect-starter-village-diagnostics.mjs");
const revision = "d".repeat(40);

test("redacts runtime logs and sanitizes Playwright failure traces before publication", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "starter-diagnostics-"));
  const evidence = path.join(root, "evidence");
  const playwright = path.join(root, "playwright");
  const results = path.join(root, "results");
  fs.mkdirSync(playwright, { recursive: true });
  fs.mkdirSync(results, { recursive: true });

  fs.writeFileSync(path.join(results, "starter-pilot-server-before.log"), "cookie: private-value\nDATABASE_URL=mysql://example\n");
  fs.writeFileSync(path.join(results, "starter-pilot-server-after.log"), "authorization: bearer-value\n");
  fs.writeFileSync(path.join(results, "starter-pilot-health-before.json"), JSON.stringify({ ok: true }));
  fs.writeFileSync(path.join(playwright, "failure.png"), "png");

  const traceSource = path.join(root, "trace-source");
  fs.mkdirSync(path.join(traceSource, "resources"), { recursive: true });
  fs.writeFileSync(path.join(traceSource, "trace.trace"), '{"authorization":"private-header","password":"private-password"}\n');
  fs.writeFileSync(path.join(traceSource, "trace.network"), '{"cookie":"private-cookie"}\n');
  fs.writeFileSync(path.join(traceSource, "resources", "body.txt"), "private body");
  const traceZip = path.join(playwright, "trace.zip");
  const zipped = spawnSync("zip", ["-qr", traceZip, "."], { cwd: traceSource, encoding: "utf8" });
  assert.equal(zipped.status, 0, zipped.stderr);

  const result = spawnSync(process.execPath, [script, evidence, playwright, results, revision], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);

  const before = fs.readFileSync(path.join(evidence, "server-before.log"), "utf8");
  const after = fs.readFileSync(path.join(evidence, "server-after.log"), "utf8");
  assert.match(before, /\[redacted\]/);
  assert.doesNotMatch(before, /private-value|mysql:\/\/example/);
  assert.match(after, /\[redacted\]/);
  assert.doesNotMatch(after, /bearer-value/);

  const health = JSON.parse(fs.readFileSync(path.join(evidence, "health-before.json"), "utf8"));
  assert.equal(health.schema, "aurion.starter-village-health.v1");
  assert.equal(health.revision, revision);

  assert.equal(fs.existsSync(path.join(evidence, "failure-artifacts", "playwright-failure-1.png")), true);
  const sanitizedTrace = fs.readFileSync(path.join(evidence, "failure-artifacts", "trace-1", "trace.trace"), "utf8");
  assert.match(sanitizedTrace, /\[redacted\]/);
  assert.doesNotMatch(sanitizedTrace, /private-header|private-password/);
  assert.equal(fs.existsSync(path.join(evidence, "failure-artifacts", "trace-1", "trace.network")), false);
  assert.equal(fs.existsSync(path.join(evidence, "failure-artifacts", "trace-1", "resources")), false);
});
