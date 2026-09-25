import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { buildDeterministicAtlasPlan } from "./deterministicAtlasPack.mjs";
import { buildDeterministicAtlasArtifact } from "./buildDeterministicAtlasArtifact.mjs";

const PNG_2X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAADklEQVR42mP4z8DwHwQBEPgD/VP9jxkAAAAASUVORK5CYII=",
  "base64",
);

test("#505 composites a real raster source at the planned binary coordinates", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aurion-atlas-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const sourcePath = path.join(root, "source.png");
  const outA = path.join(root, "a");
  const outB = path.join(root, "b");
  await writeFile(sourcePath, PNG_2X1);

  const sourceSha = createHash("sha256").update(PNG_2X1).digest("hex");
  const plan = buildDeterministicAtlasPlan({
    schemaVersion: "aurion.deterministic-atlas-plan.v1",
    atlasId: "binary-test",
    family: "basecolor-srgb",
    pageWidth: 8,
    pageHeight: 8,
    padding: 1,
    gutter: 1,
    rotationAllowed: false,
    sourceManifestHash: "sha256:" + "f".repeat(64),
    sourceInputs: [{
      assetId: "test-source",
      path: sourcePath,
      contentSha256: sourceSha,
      width: 2,
      height: 1,
      compatibilityClass: "basecolor-srgb",
      localityBucket: "test",
    }],
  });

  const first = await buildDeterministicAtlasArtifact(plan, outA);
  const second = await buildDeterministicAtlasArtifact(plan, outB);

  assert.deepEqual(second, first);
  assert.equal(first.pages.length, 1);
  assert.equal(first.pages[0].placementCount, 1);
  assert.match(first.pages[0].sha256, /^sha256:[a-f0-9]{64}$/);

  const firstBytes = await readFile(path.join(outA, first.pages[0].file));
  const secondBytes = await readFile(path.join(outB, second.pages[0].file));
  assert.deepEqual(secondBytes, firstBytes);
  assert.ok(firstBytes.length > 0);
});

test("#505 fails closed when actual source bytes no longer match the planned hash", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aurion-atlas-tamper-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const sourcePath = path.join(root, "source.png");
  await writeFile(sourcePath, PNG_2X1);

  const sourceSha = createHash("sha256").update(PNG_2X1).digest("hex");
  const plan = buildDeterministicAtlasPlan({
    schemaVersion: "aurion.deterministic-atlas-plan.v1",
    atlasId: "binary-tamper-test",
    family: "basecolor-srgb",
    pageWidth: 8,
    pageHeight: 8,
    padding: 1,
    gutter: 1,
    rotationAllowed: false,
    sourceInputs: [{
      assetId: "test-source",
      path: sourcePath,
      contentSha256: sourceSha,
      width: 2,
      height: 1,
      compatibilityClass: "basecolor-srgb",
      localityBucket: "test",
    }],
  });

  await writeFile(sourcePath, Buffer.from([...PNG_2X1, 0]));
  await assert.rejects(
    buildDeterministicAtlasArtifact(plan, path.join(root, "out")),
    /ATLAS_SOURCE_CONTENT_SHA256_MISMATCH/,
  );
});
