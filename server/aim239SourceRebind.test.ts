import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type SourceBaseline = {
  schemaVersion: number;
  reconcileTask: string;
  authorityHierarchy: string[];
  sources: {
    normativeRules: { repository: string; ref: string; revision: string; role: string };
    gameplayEngine: { repository: string; ref: string; revision: string; previousRevision: string; role: string };
    aurionBaseline: { repository: string; ref: string; revision: string; role: string };
    historicalOwnerZip: { sha256: string; role: string };
  };
  finalDelta: { manifestPath: string; manifestSha256: string; commitCount: number; changedFiles: number; addedFiles: number; modifiedFiles: number; sourceCommitVerified: boolean; sourceCheckRuns: number };
  bannedStandaloneAuthority: string[];
};

type DeltaManifest = {
  schemaVersion: number;
  task: string;
  source: { repository: string; baseRevision: string; revision: string; commitCount: number; sourceCommitVerified: boolean; sourceCheckRuns: number };
  targetBaseline: { repository: string; revision: string };
  normativeRules: { repository: string; revision: string };
  summary: { changedFiles: number; added: number; modified: number; additions: number; deletions: number };
  decisions: readonly { path: string; status: string; additions: number; deletions: number; decision: string; surface: string; risk: string; instruction: string }[];
  manifestSha256: string;
};

const baseline = JSON.parse(readFileSync("docs/migrations/aim239-source-baseline.json", "utf8")) as SourceBaseline;
const manifest = JSON.parse(readFileSync(baseline.finalDelta.manifestPath, "utf8")) as DeltaManifest;
const matrix = readFileSync("docs/migrations/AIM239_AX1_RECONCILIATION_MATRIX_2026-09-05.md", "utf8");
const app = readFileSync("client/src/App.tsx", "utf8");
const atlas = readFileSync("client/src/xaurion/components/WorldMapModal.tsx", "utf8");

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function manifestDigest(value: DeltaManifest): string {
  const { manifestSha256: _ignored, ...unsigned } = value;
  return createHash("sha256").update(stableStringify(unsigned), "utf8").digest("hex");
}

describe("AIM-266 final -ax1 source and ownership reconciliation", () => {
  it("pins unchanged normative WASD rules and the final -ax1 content/engine source", () => {
    expect(baseline.sources.normativeRules).toEqual({
      repository: "OuroborosCollective/Wasd",
      ref: "main",
      revision: "7bd039bb79681d2df342abe160579f89ca3ff8ed",
      role: "normative_rules",
    });
    expect(baseline.sources.gameplayEngine).toEqual({
      repository: "OuroborosCollective/-ax1",
      ref: "main",
      revision: "d356881538dae23c3aa97364a5596d48b6ac3079",
      previousRevision: "b9a0c19cb3d2d34212075983e64891274489e32a",
      role: "canonical_gameplay_content_engine_source",
    });
  });

  it("binds the rebase lane to the exact Aurion authority baseline", () => {
    expect(baseline.sources.aurionBaseline).toEqual({
      repository: "OuroborosCollective/Echoes_of_Aurion",
      ref: "main",
      revision: "d6549a2319ffc5de0e364bd54eeca8a1e4a3ed4a",
      role: "production_authority_host",
    });
    expect(baseline.reconcileTask).toBe("AIM-266");
  });

  it("classifies every file in the one-commit 38-file source delta exactly once", () => {
    expect(manifest.task).toBe("AIM-266");
    expect(manifest.source).toMatchObject({
      repository: "OuroborosCollective/-ax1",
      baseRevision: "b9a0c19cb3d2d34212075983e64891274489e32a",
      revision: "d356881538dae23c3aa97364a5596d48b6ac3079",
      commitCount: 1,
      sourceCommitVerified: false,
      sourceCheckRuns: 0,
    });
    expect(manifest.summary).toMatchObject({ changedFiles: 38, added: 10, modified: 28, additions: 8855, deletions: 716 });
    expect(manifest.decisions).toHaveLength(38);
    expect(new Set(manifest.decisions.map(entry => entry.path)).size).toBe(38);
    expect(manifest.decisions.every(entry => ["direct", "adapt", "reject-raw", "content-only", "dev-only"].includes(entry.decision))).toBe(true);
    expect(baseline.finalDelta.manifestSha256).toBe(manifest.manifestSha256);
    expect(manifest.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(manifestDigest(manifest)).toBe(manifest.manifestSha256);
  });

  it("keeps all critical source authority surfaces non-direct", () => {
    const byPath = new Map(manifest.decisions.map(entry => [entry.path, entry]));
    for (const path of [
      "server.ts",
      "server/mariadb.ts",
      "src/components/DeterminismDebugOverlay.tsx",
      "src/components/GuildManagementModal.tsx",
      "src/entities/LootDropManager.ts",
      "src/world/WorldChunkManager.ts",
    ]) {
      expect(byPath.get(path)?.decision).not.toBe("direct");
    }
    expect(byPath.get("server.ts")?.decision).toBe("reject-raw");
    expect(byPath.get("server/mariadb.ts")?.decision).toBe("reject-raw");
    expect(byPath.get("src/entities/SimulatedRealmPlayers.ts")?.decision).toBe("dev-only");
  });

  it("records every delta path in the human-readable ownership matrix", () => {
    for (const entry of manifest.decisions) expect(matrix).toContain(`\`${entry.path}\``);
    expect(matrix).toContain("Arelorian/WASD");
    expect(matrix).toContain("Echoes_of_Aurion");
    expect(matrix).toContain("38 files");
  });

  it("preserves current Aurion host and read-only atlas integration", () => {
    expect(app).toContain('path="/ops/glb-upload"');
    expect(app).toContain("AurionOpenWorldRuntime");
    expect(atlas).toContain("Array.from(p.chunkManager.chunks.values())");
    expect(atlas).not.toContain("getAllChunks()");
  });

  it("expands the forbidden standalone-authority contract for the final update", () => {
    for (const forbidden of [
      "/api/player/save",
      "/api/database/configure",
      "client-selected guild owner, ruler, territory or capital",
      "client-provided guild bank item object or balance",
      "synthetic server hash presented as production evidence",
      "in-memory fallback presented as persisted success",
    ]) expect(baseline.bannedStandaloneAuthority).toContain(forbidden);
  });
});
