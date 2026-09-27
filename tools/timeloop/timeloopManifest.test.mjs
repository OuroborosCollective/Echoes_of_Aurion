import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { normalizeTimeloopManifest } from "./timeloopManifest.mjs";

const fixturePath = new URL("./fixtures/render-ecs-distance-proxy.v1.json", import.meta.url);
async function fixture() { return JSON.parse(await readFile(fixturePath, "utf8")); }

describe("Aurion Timeloop offline manifest bridge (#616)", () => {
  it("normalizes to a stable hash without creating a runtime authority", async () => {
    const input = await fixture();
    const first = normalizeTimeloopManifest(input);
    const second = normalizeTimeloopManifest({ ...input, notes: input.notes });
    expect(first.manifestHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(second.manifestHash).toBe(first.manifestHash);
    expect(first.authority).toBe("NON_AUTHORITATIVE_OFFLINE_ANALYSIS");
    expect(first.analysisStatus).toBe("PROSPECTIVE_PROXY");
    expect(first.kernel.authoritativeEquivalent).toBe(false);
  });

  it("is invariant to object-key order", async () => {
    const input = await fixture();
    const reordered = { timeloop: input.timeloop, kernel: input.kernel, sourceEvidence: input.sourceEvidence, sourceRevision: input.sourceRevision, analysisStatus: input.analysisStatus, authority: input.authority, scenarioId: input.scenarioId, workloadId: input.workloadId, schemaVersion: input.schemaVersion, notes: input.notes };
    expect(normalizeTimeloopManifest(reordered).manifestHash).toBe(normalizeTimeloopManifest(input).manifestHash);
  });

  it("fails closed on wall-clock/randomness fields", async () => {
    const input = await fixture();
    expect(() => normalizeTimeloopManifest({ ...input, runtime: { randomSeed: 7 } })).toThrow("TIMELOOP_MANIFEST_NON_DETERMINISTIC_FIELD");
  });

  it("fails closed on a non-pinned Timeloop revision", async () => {
    const input = await fixture();
    expect(() => normalizeTimeloopManifest({ ...input, timeloop: { ...input.timeloop, commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } })).toThrow("TIMELOOP_MANIFEST_UPSTREAM_COMMIT_NOT_PINNED");
  });

  it("fails closed when the source is presented as authoritative", async () => {
    const input = await fixture();
    expect(() => normalizeTimeloopManifest({ ...input, analysisStatus: "VERIFIED" })).toThrow("TIMELOOP_MANIFEST_ANALYSIS_STATUS_INVALID");
  });
});
