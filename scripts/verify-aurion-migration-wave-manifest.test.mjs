import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  verifyManifest,
  verifyManifestFile,
} from "./verify-aurion-migration-wave-manifest.mjs";

const manifestUrl = new URL(
  "../config/aurion-migration-wave-0028-manifest.json",
  import.meta.url
);
const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));

test("AIM-230 manifest binds implemented 0028 to its exact SQL bytes", async () => {
  const result = await verifyManifestFile(manifestUrl.pathname, {
    expectedSourceRevision: "e298fc085ded475dcc92e498f29a39e47370d142",
    expectedTargetRevision: "872d786d506eb4792898a81dbd234e16c681039d",
  });
  assert.deepEqual(result, {
    waveId: "aurion-next-0028",
    status: "implemented",
    migrationCount: 1,
    firstSequence: 28,
    lastSequence: 28,
    manifestSha256: manifest.manifestSha256,
  });
  assert.equal(
    manifest.migrations[0].fileSha256,
    "a52b2efdbd972c96f7ba4918a48cca1c7c37ded4cc63d6bc1859cf26f3fd9da4"
  );
});

test("rejects a mismatched target revision", () => {
  assert.throws(
    () =>
      verifyManifest(manifest, {
        expectedTargetRevision: "02c79dd12767db2f4dd87b6b72894cf1c236c9ab",
      }),
    /WAVE_MANIFEST_TARGET_REVISION_MISMATCH/
  );
});

test("rejects a sequence gap", () => {
  const invalid = structuredClone(manifest);
  invalid.migrations.push({
    sequence: 30,
    tag: "0030_invalid_gap",
    path: "drizzle/0030_invalid_gap.sql",
    source: "aurion",
    status: "implemented",
    fileSha256: "0".repeat(64),
  });
  assert.throws(
    () => verifyManifest(invalid),
    /WAVE_MANIFEST_SEQUENCE_INVALID/
  );
});

test("rejects an implemented migration without a real file hash", () => {
  const invalid = structuredClone(manifest);
  invalid.migrations[0].fileSha256 = null;
  assert.throws(
    () => verifyManifest(invalid),
    /WAVE_MANIFEST_IMPLEMENTED_ENTRY_INVALID/
  );
});

test("rejects a scheduled production write", () => {
  const invalid = structuredClone(manifest);
  invalid.policy.productionWritesScheduled = true;
  assert.throws(() => verifyManifest(invalid), /WAVE_MANIFEST_POLICY_INVALID/);
});
