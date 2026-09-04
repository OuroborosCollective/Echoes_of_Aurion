import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type SourceBaseline = {
  authorityHierarchy: string[];
  sources: {
    normativeRules: { repository: string; revision: string; role: string };
    gameplayEngine: { repository: string; revision: string; role: string };
    aurionBaseline: { repository: string; revision: string; role: string };
    historicalOwnerZip: { sha256: string; role: string };
  };
  bannedStandaloneAuthority: string[];
};

const baseline = JSON.parse(readFileSync("docs/migrations/aim239-source-baseline.json", "utf8")) as SourceBaseline;
const app = readFileSync("client/src/App.tsx", "utf8");
const atlas = readFileSync("client/src/xaurion/components/WorldMapModal.tsx", "utf8");

describe("AIM-241 source and main reconciliation", () => {
  it("pins Arelorian/WASD as normative rules and -ax1 as the canonical gameplay-engine source", () => {
    expect(baseline.sources.normativeRules).toEqual({
      repository: "OuroborosCollective/Wasd",
      revision: "7bd039bb79681d2df342abe160579f89ca3ff8ed",
      role: "normative_rules",
    });
    expect(baseline.sources.gameplayEngine).toEqual({
      repository: "OuroborosCollective/-ax1",
      revision: "b9a0c19cb3d2d34212075983e64891274489e32a",
      role: "canonical_gameplay_engine_source",
    });
  });

  it("binds the reconcile to the exact Aurion main authority baseline and preserves old ZIP provenance only as history", () => {
    expect(baseline.sources.aurionBaseline).toEqual({
      repository: "OuroborosCollective/Echoes_of_Aurion",
      revision: "8115ac594f2f3df91d04499fc4f4515b00427d2e",
      role: "production_authority_host",
    });
    expect(baseline.sources.historicalOwnerZip).toEqual({
      sha256: "739650d16dee85bb073e2c5af3c737f32573f328673c56edfe91d250719a030f",
      role: "superseded_historical_provenance",
    });
  });

  it("preserves current main GLB operations while mounting the Aurion-governed open-world runtime", () => {
    expect(app).toContain('path="/ops/glb-upload"');
    expect(app).toContain("GlbUpload");
    expect(app).toContain("LocalAuthPanel");
    expect(app).toContain("AurionOpenWorldRuntime");
  });

  it("keeps the realm atlas read-only without changing the hash-bound world manager contract", () => {
    expect(atlas).toContain("Array.from(p.chunkManager.chunks.values())");
    expect(atlas).not.toContain("getAllChunks()");
  });

  it("records the standalone authority surfaces that remain forbidden for future -ax1 adaptation", () => {
    expect(baseline.bannedStandaloneAuthority).toContain("/api/player/save");
    expect(baseline.bannedStandaloneAuthority).toContain("/api/database/configure");
    expect(baseline.bannedStandaloneAuthority).toContain("/api/world/chunks");
    expect(baseline.bannedStandaloneAuthority).toContain("new AudioContext in xaurion");
  });
});
