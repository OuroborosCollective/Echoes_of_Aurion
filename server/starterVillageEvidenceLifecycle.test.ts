import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { sealStarterVillageEvidence } from "../scripts/seal-starter-village-evidence";
import { verifyStarterVillageEvidence } from "../scripts/verify-starter-village-evidence";

const revision = "c".repeat(40);

async function backendFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "starter-evidence-lifecycle-"));
  await mkdir(path.join(root, "failure-artifacts"), { recursive: true });
  await writeFile(path.join(root, "session.json"), JSON.stringify({ transient: true }));
  await writeFile(path.join(root, "network-isolation.json"), JSON.stringify({ scope: "runtime-uid" }));
  await writeFile(path.join(root, "runtime-entry-before.json"), JSON.stringify({ readable: true }));
  await writeFile(path.join(root, "server-before.log"), "server before\n");
  await writeFile(path.join(root, "server-after.log"), "server after\n");
  await writeFile(path.join(root, "health-before.json"), JSON.stringify({
    schema: "aurion.starter-village-health.v1",
    revision,
    health: { ok: true },
  }));
  await writeFile(path.join(root, `journey-${revision}.json`), JSON.stringify({
    schema: "aurion.starter-village-pilot.journey.v2",
    sourceRevision: revision,
  }));
  await writeFile(path.join(root, `restart-readback-${revision}.json`), JSON.stringify({
    schema: "aurion.starter-village-pilot.restart-readback.v2",
    sourceRevision: revision,
  }));
  return root;
}

describe("starter village evidence failure lifecycle", () => {
  it("preserves completed backend evidence while browser failure remains FAIL", async () => {
    const root = await backendFixture();
    await writeFile(path.join(root, "failure-artifacts", "browser-failure.png"), "png");

    const sealed = await sealStarterVillageEvidence({
      evidenceDir: root,
      revision,
      phases: {
        journey: "success",
        restart: "success",
        diagnostic: "skipped",
        publicCharacter: "skipped",
        fountain: "skipped",
        browser: "failure",
      },
    });

    expect(sealed.status).toBe("FAIL");
    expect(sealed.failureArtifacts).toEqual(["failure-artifacts/browser-failure.png"]);
    await expect(readFile(path.join(root, "session.json"))).rejects.toThrow();

    const verified = await verifyStarterVillageEvidence(root, revision);
    expect(verified.manifest.status).toBe("FAIL");
    expect(verified.files).toContain(`journey-${revision}.json`);
    expect(verified.files).toContain(`restart-readback-${revision}.json`);
  });

  it("rejects a browser failure that lost all diagnostic artifacts", async () => {
    const root = await backendFixture();
    await sealStarterVillageEvidence({
      evidenceDir: root,
      revision,
      phases: {
        journey: "success",
        restart: "success",
        diagnostic: "skipped",
        publicCharacter: "skipped",
        fountain: "skipped",
        browser: "failure",
      },
    });
    await expect(verifyStarterVillageEvidence(root, revision))
      .rejects.toThrow("EVIDENCE_BROWSER_FAILURE_ARTIFACT_REQUIRED");
  });
});
