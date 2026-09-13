import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const workflows = [
  ".github/workflows/deploy-aurion-zone-runtime.yml",
  ".github/workflows/aurion-wasd-migration-ledger.yml",
  ".github/workflows/aurion-root-reconciliation-artifact-proof.yml",
  ".github/workflows/aurion-root-schema-apply-artifact-proof.yml",
];

const pins = {
  checkout: "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
  setupNode: "actions/setup-node@820762786026740c76f36085b0efc47a31fe5020",
  uploadArtifact: "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a",
  downloadArtifact: "actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c",
};

describe("Aurion release workflow action provenance", () => {
  it("uses exact reviewed commits for GitHub-owned release actions", () => {
    const joined = workflows.map(read).join("\n");
    expect(joined).toContain(pins.checkout);
    expect(joined).toContain(pins.setupNode);
    expect(joined).toContain(pins.uploadArtifact);
    expect(joined).toContain(pins.downloadArtifact);
  });

  it("does not reintroduce moving GitHub action major tags in release-critical workflows", () => {
    for (const workflow of workflows) {
      const source = read(workflow);
      expect(source).not.toMatch(/actions\/(?:checkout|setup-node|upload-artifact|download-artifact)@v\d+/);
    }
  });
});
