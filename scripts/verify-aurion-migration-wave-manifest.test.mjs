import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { verifyManifest } from "./verify-aurion-migration-wave-manifest.mjs";

const manifest = JSON.parse(
  await readFile(
    new URL(
      "../config/aurion-migration-wave-0028-manifest.json",
      import.meta.url
    ),
    "utf8"
  )
);

test("AIM-229 manifest is a valid planned 0028 wave", () => {
  const result = verifyManifest(manifest, {
    expectedSourceRevision: "e298fc085ded475dcc92e498f29a39e47370d142",
    expectedTargetRevision: "21b4c910349a1a8475015d649c5912e77efd08b7",
  });
  assert.deepEqual(result, {
    waveId: "aurion-next-0028",
    migrationCount: 1,
    firstSequence: 28,
    lastSequence: 28,
    manifestSha256: manifest.manifestSha256,
  });
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
    status: "planned",
    fileSha256: null,
  });
  assert.throws(
    () => verifyManifest(invalid),
    /WAVE_MANIFEST_SEQUENCE_INVALID/
  );
});

test("rejects a scheduled production write", () => {
  const invalid = structuredClone(manifest);
  invalid.policy.productionWritesScheduled = true;
  assert.throws(() => verifyManifest(invalid), /WAVE_MANIFEST_POLICY_INVALID/);
});
