import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const imageTag = "node:22.23.4-bookworm-slim";
const indexDigest = "sha256:de170b39439eb0e5a3444ad7d60b015614a381e10fecae2e30ec9e735122f38d";
const amd64ManifestDigest = "sha256:ea11b74b986d520137cdef9a5346e447a00f275ecc4abc0055b7151226231e09";
const canonical = imageTag + "@" + indexDigest;
const bootstrap = imageTag + "@" + amd64ManifestDigest;

const ownedPaths = [
  "Dockerfile",
  "deploy/aurion-reconcile-runtime-image.conf",
  "deploy/promote-aurion-zone-runtime.sh",
  "scripts/build-aurion-promoter-bootstrap-artifact.mjs",
  "server/aurionTraefikRuntimeDeployment.test.ts",
  "server/aurionProductionSchemaReconcileDockerRunner.test.ts",
  ".github/workflows/aurion-pr-runtime-container-proof.yml",
  ".github/workflows/aurion-root-schema-apply-artifact-proof.yml",
  ".github/workflows/aurion-root-reconciliation-artifact-proof.yml",
  ".github/workflows/deploy-aurion-zone-runtime.yml",
];

describe("Aurion Node 22 security image provenance", () => {
  it("pins the canonical multiarch index and the distinct amd64 bootstrap manifest", () => {
    const contract = JSON.parse(read("deploy/aurion-reconcile-runtime-image.conf"));
    expect(contract).toEqual({
      schemaVersion: 1,
      recordType: "aurion_reconcile_runtime_image_contract",
      imageTag,
      imageDigest: indexDigest,
      nodeMajorVersion: 22,
    });
    expect(indexDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(amd64ManifestDigest).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(indexDigest).not.toBe(amd64ManifestDigest);
    expect(read("Dockerfile")).toContain("FROM " + canonical + " AS runtime");
    expect(read("deploy/promote-aurion-zone-runtime.sh")).toContain(canonical);
    const bootstrapBuilder = read("scripts/build-aurion-promoter-bootstrap-artifact.mjs");
    expect(bootstrapBuilder).toContain(indexDigest);
    expect(bootstrapBuilder).toContain(amd64ManifestDigest);
    expect(bootstrapBuilder).toContain('sourceImageContract.imageTag !== "' + imageTag + '"');
    const release = read(".github/workflows/deploy-aurion-zone-runtime.yml");
    expect(release).toContain('bootstrap_image="' + bootstrap + '"');
    expect(release).toContain(indexDigest);
    expect(release).toContain(amd64ManifestDigest);
  });

  it("rejects an older or mismatched Node image reference in any image-bound source or proof", () => {
    const matches = ownedPaths.flatMap(file =>
      [...read(file).matchAll(/node:22\.[0-9]+\.[0-9]+-bookworm-slim(?:@sha256:[a-f0-9]{64})?/g)]
        .map(match => match[0]),
    );
    expect(matches.length).toBeGreaterThan(12);
    expect(new Set(matches)).toEqual(new Set([imageTag, canonical, bootstrap]));
  });

  it("requires both candidate and release CI to execute the built Node version without network", () => {
    const candidate = read(".github/workflows/aurion-pr-runtime-container-proof.yml");
    const release = read(".github/workflows/deploy-aurion-zone-runtime.yml");
    expect(candidate).toContain('docker run --rm --network none "${image}" node -p \'process.version\'');
    expect(candidate).toContain('test "$node_version" = "v22.23.4"');
    expect(release).toContain('docker run --rm --network none "${runtime_verify_image}" node -p \'process.version\'');
    expect(release).toContain('test "$node_version" = "v22.23.4"');
    expect(release).toContain('docker run --rm --network none "$bootstrap_image" node -p \'process.version\'');
    expect(release).toContain('test "$bootstrap_node_version" = "v22.23.4"');
  });
});
