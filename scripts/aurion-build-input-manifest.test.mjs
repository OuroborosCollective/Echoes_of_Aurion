import assert from "node:assert/strict";
import test from "node:test";
import { buildAurionBuildInputManifest, canonicalSha256, AURION_BUILD_INPUT_MANIFEST_SCHEMA } from "./aurion-build-input-manifest.mjs";

const revision = "a".repeat(40);

test("BuildInputManifest is canonical, complete and digest-bound", async () => {
  const first = await buildAurionBuildInputManifest({ revision });
  const second = await buildAurionBuildInputManifest({ revision });
  assert.deepEqual(first, second);
  assert.equal(first.manifest.schemaVersion, AURION_BUILD_INPUT_MANIFEST_SCHEMA);
  assert.equal(first.manifest.sourceRevision, revision);
  assert.match(first.manifest.runtimeBaseImage, /^node:22[^@]*@sha256:[a-f0-9]{64}$/);
  assert.match(first.manifest.gameDevelopmentStudio.sourceRevision, /^[a-f0-9]{40}$/);
  assert.ok(Object.keys(first.manifest.files).includes("pnpm-lock.yaml"));
  assert.ok(Object.keys(first.manifest.files).includes("Dockerfile"));
  assert.ok(Object.keys(first.manifest.files).includes("drizzle/meta/_journal.json"));
  assert.ok(Object.keys(first.manifest.patches).length > 0);
  assert.match(first.digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(first.digest, canonicalSha256(first.manifest));
});

test("BuildInputManifest digest changes when a bound input identity changes", async () => {
  const original = await buildAurionBuildInputManifest({ revision });
  const changedRevision = { ...original.manifest, sourceRevision: "b".repeat(40) };
  const changedBase = { ...original.manifest, runtimeBaseImage: original.manifest.runtimeBaseImage.replace(/.$/, "0") };
  assert.notEqual(canonicalSha256(changedRevision), original.digest);
  assert.notEqual(canonicalSha256(changedBase), original.digest);
});

test("invalid source revision fails closed", async () => {
  await assert.rejects(buildAurionBuildInputManifest({ revision: "main" }), /BUILD_INPUT_REVISION_INVALID/);
});
