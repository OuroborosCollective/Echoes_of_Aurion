import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { verifyStarterVillageEvidence } from "../scripts/verify-starter-village-evidence";

const revision = "a".repeat(40);
const sha = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");

async function fixture(options: { omit?: string; empty?: string; wrongRevision?: string; badHash?: boolean; sensitiveKey?: boolean } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "starter-evidence-"));
  const files: Record<string, string> = {
    REVISION: `${revision}  revision\n`,
    "manifest.json": JSON.stringify({
      schema: "aurion.starter-village-evidence-manifest.v1",
      revision,
      status: "PASS",
      phases: { journey: "success", restart: "success", diagnostic: "success", publicCharacter: "success", fountain: "success", browser: "success" },
      failureArtifacts: [],
    }),
    "network-isolation.json": JSON.stringify({ scope: "runtime-uid", uid: 123, loopbackAllowed: true, externalEgressAllowed: false }),
    "runtime-entry-before.json": JSON.stringify({ readable: true, bytes: 10 }),
    "server-before.log": "server-before-ok\n",
    "server-after.log": "server-after-ok\n",
    "health-before.json": JSON.stringify({ ok: true }),
    [`journey-${revision}.json`]: JSON.stringify({ schema: "aurion.starter-village-pilot.journey.v2", sourceRevision: revision, ok: true }),
    [`restart-readback-${revision}.json`]: JSON.stringify({ schema: "aurion.starter-village-pilot.restart-readback.v2", sourceRevision: revision, ok: true }),
    "empty-catalog-diagnostic.json": JSON.stringify({ schema: "aurion.starter-village-browser-diagnostic.v1", revision, ok: true }),
    "empty-catalog-diagnostic.png": "png",
    "public-character-seed.json": JSON.stringify({ schema: "aurion.starter-village-public-character-seed.v1", sourceRevision: revision, purpose: "player-public" }),
    "fountain-seed.json": JSON.stringify({ schema: "aurion.starter-village-fountain-seed.v1", sourceRevision: revision, purpose: "world-environment" }),
    "browser-trace-phone.json": JSON.stringify({ schema: "aurion.starter-village-browser-trace.v1", revision }),
    "phone-starter-pilot.png": "png",
    "browser-trace-tablet.json": JSON.stringify({ schema: "aurion.starter-village-browser-trace.v1", revision }),
    "tablet-starter-pilot.png": "png",
    "browser-trace-desktop.json": JSON.stringify({ schema: "aurion.starter-village-browser-trace.v1", revision }),
    "desktop-starter-pilot.png": "png",
    "browser-trace-landscape.json": JSON.stringify({ schema: "aurion.starter-village-browser-trace.v1", revision }),
    "landscape-starter-pilot.png": "png",
  };
  if (options.sensitiveKey) files["browser-trace-phone.json"] = JSON.stringify({ schema: "aurion.starter-village-browser-trace.v1", revision, sessionCookie: "fixture-value" });
  if (options.omit) delete files[options.omit];
  if (options.empty) files[options.empty] = "";
  if (options.wrongRevision) files[options.wrongRevision] = JSON.stringify({ schema: "aurion.test.v1", revision: "b".repeat(40) });
  for (const [name, content] of Object.entries(files)) await writeFile(path.join(root, name), content);
  const sums = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([name, content]) => `${sha(content)}  ${name}`);
  await writeFile(path.join(root, "SHA256SUMS"), sums.join("\n") + "\n");
  if (options.badHash) await writeFile(path.join(root, "SHA256SUMS"), (sums.join("\n") + "\n").replace(/^[a-f0-9]{64}/, "0".repeat(64)));
  return root;
}

describe("starter village evidence verifier", () => {
  it("rejects the historical REVISION plus SHA256SUMS-only bundle", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "starter-evidence-minimal-"));
    const revisionFile = `${revision}  revision\n`;
    await writeFile(path.join(root, "REVISION"), revisionFile);
    await writeFile(path.join(root, "SHA256SUMS"), `${sha(revisionFile)}  REVISION\n`);
    await expect(verifyStarterVillageEvidence(root, revision)).rejects.toThrow();
  });

  it("rejects missing, empty, wrong-revision, tampered and sensitive-key evidence", async () => {
    await expect(verifyStarterVillageEvidence(await fixture({ omit: "phone-starter-pilot.png" }), revision)).rejects.toThrow("EVIDENCE_REQUIRED_FILE_MISSING");
    await expect(verifyStarterVillageEvidence(await fixture({ empty: "phone-starter-pilot.png" }), revision)).rejects.toThrow("EVIDENCE_REQUIRED_FILE_EMPTY");
    await expect(verifyStarterVillageEvidence(await fixture({ wrongRevision: "browser-trace-phone.json" }), revision)).rejects.toThrow("EVIDENCE_REVISION_MISMATCH");
    await expect(verifyStarterVillageEvidence(await fixture({ badHash: true }), revision)).rejects.toThrow("EVIDENCE_HASH_MISMATCH");
    await expect(verifyStarterVillageEvidence(await fixture({ sensitiveKey: true }), revision)).rejects.toThrow("EVIDENCE_SENSITIVE_KEY");
  });

  it("accepts a complete exact-revision PASS bundle", async () => {
    const result = await verifyStarterVillageEvidence(await fixture(), revision);
    expect(result.manifest.status).toBe("PASS");
    expect(result.required).toContain("landscape-starter-pilot.png");
  });
});
