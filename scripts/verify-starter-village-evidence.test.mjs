import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const script = path.resolve("scripts/verify-starter-village-evidence.mjs");
const revision = "a".repeat(40);
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "starter-evidence-"));
const json = (dir, name, value) => fs.writeFileSync(path.join(dir, name), JSON.stringify(value) + "\n");

test("rejects a bundle containing only REVISION and SHA256SUMS", () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "REVISION"), `${revision}  revision\n`);
  fs.writeFileSync(path.join(dir, "SHA256SUMS"), "");
  const result = run("verify", dir, revision);
  assert.notEqual(result.status, 0);
});

test("PARTIAL seal preserves diagnostics without inventing success files", () => {
  const dir = tmp();
  json(dir, "network-isolation.json", { loopbackAllowed: true, externalEgressAllowed: false });
  const sealed = run("seal", dir, revision, "PARTIAL");
  assert.equal(sealed.status, 0, sealed.stderr);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, "EVIDENCE_MANIFEST.json"), "utf8"));
  assert.equal(manifest.status, "PARTIAL");
  assert.ok(manifest.missingRequired.length > 0);
  assert.equal(fs.existsSync(path.join(dir, `journey-${revision}.json`)), false);
  assert.notEqual(run("verify", dir, revision).status, 0);
});

test("rejects revision drift, empty json, checksum drift and secret material", () => {
  for (const kind of ["revision","empty","checksum","secret"]) {
    const dir = tmp();
    json(dir, "network-isolation.json", { loopbackAllowed: true, externalEgressAllowed: false });
    if (kind === "secret") fs.writeFileSync(path.join(dir, "cookie.txt"), "session=secret");
    const result = run("seal", dir, revision, "PARTIAL");
    if (kind === "secret") { assert.notEqual(result.status, 0); continue; }
    assert.equal(result.status, 0, result.stderr);
    if (kind === "revision") fs.writeFileSync(path.join(dir, "REVISION"), `${"b".repeat(40)}  revision\n`);
    if (kind === "empty") fs.writeFileSync(path.join(dir, "EVIDENCE_MANIFEST.json"), "");
    if (kind === "checksum") fs.appendFileSync(path.join(dir, "network-isolation.json"), " ");
    assert.notEqual(run("verify", dir, revision).status, 0);
  }
});
