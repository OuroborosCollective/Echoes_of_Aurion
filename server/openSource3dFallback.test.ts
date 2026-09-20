import { describe, expect, it } from "vitest";
import {
  OS3A_FALLBACK_CONFIRMATION,
  openSource3dFallbackSource,
  os3aApplyInputSchema,
  searchOpenSource3dFallback,
} from "./openSource3dFallback";

describe("pinned OS3A fallback catalog", () => {
  it("binds the curated source to exact immutable revisions and no runtime authority", () => {
    const source = openSource3dFallbackSource();
    expect(source).toMatchObject({
      schemaVersion: "aurion.os3a-fallback-catalog.v1",
      registryRevision: "c0496c867dfa232ee5dc7ee631133d2753cf6285",
      modelRevision: "56db2d4088512531a070d0bf3eb9d284d077528d",
      license: "CC0-1.0",
      sourceAssetCount: 425,
      admissionCandidateCount: 365,
      discoveryOnlyCount: 60,
      runtimeDependency: false,
      gameplayAuthority: "none",
      worldPlacementAuthority: "none",
    });
    expect(source.collections).toEqual([
      "pm-medieval-fair",
      "pm-momuspark",
      "pm-avatar-garden",
      "pm-ca-world",
      "pm-crystal-crossroads",
      "pm-xyz",
    ]);
  });

  it("searches deterministically and exposes budget/discovery evidence instead of pretending approval", () => {
    const first = searchOpenSource3dFallback({ query: "medieval barrel", tier: "phone", limit: 8 });
    const second = searchOpenSource3dFallback({ query: "medieval barrel", tier: "phone", limit: 8 });
    expect(first).toEqual(second);
    expect(first.matches.length).toBeGreaterThan(0);
    expect(first.matches[0]).toMatchObject({
      projectId: "pm-medieval-fair",
      transferBudgetFit: true,
      discoveryOnly: false,
      classificationStatus: "requires-pinned-byte-plan",
    });
    expect(first.matches.some(match => match.name.toLowerCase().includes("barrel"))).toBe(true);
    expect(first.matches.every(match => match.transferBudgetBytes === 8 * 1024 * 1024)).toBe(true);
  });

  it("keeps rigged XYZ creatures discovery-only until Aurion owns a dedicated enemy fallback lane", () => {
    const result = searchOpenSource3dFallback({ query: "creature animal", tier: "desktop", limit: 24 });
    const xyz = result.matches.filter(match => match.projectId === "pm-xyz");
    expect(xyz.length).toBeGreaterThan(0);
    expect(xyz.every(match => match.discoveryOnly && match.discoveryNote === "RIGGED_CREATURE_REQUIRES_DEDICATED_ENEMY_FALLBACK_LANE")).toBe(true);
  });

  it("requires the exact named confirmation on admission", () => {
    expect(() => os3aApplyInputSchema.parse({
      sourceAssetId: "medieval-fair-003",
      purpose: "world-environment",
      tier: "phone",
      expectedPlanSha256: "a".repeat(64),
      confirmation: "APPLY_TO_LIVE_AURION",
    })).toThrow();
    expect(os3aApplyInputSchema.parse({
      sourceAssetId: "medieval-fair-003",
      purpose: "world-environment",
      tier: "phone",
      expectedPlanSha256: "a".repeat(64),
      confirmation: OS3A_FALLBACK_CONFIRMATION,
    }).confirmation).toBe(OS3A_FALLBACK_CONFIRMATION);
  });
});
