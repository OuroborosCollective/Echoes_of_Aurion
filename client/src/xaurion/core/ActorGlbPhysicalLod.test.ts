import { describe, expect, it } from "vitest";
import { assetBudgets } from "@shared/glbPresentationBudget";
import { glbCatalogEntrySchema, type GlbRuntimeCatalog } from "@shared/glbImportContract";
import { glbNormalizationTestFixture } from "./GlbNormalizationTestFixture.test";
import { selectEnemyGlb } from "./EnemyGlbFallback";
import { selectNpcGlb } from "./NpcGlbFallback";

function catalog(kind: "enemy" | "character", assigned = false): GlbRuntimeCatalog {
  const lods = ([0, 1, 2] as const).map(level => {
    const sha256 = String(level + 1).repeat(64);
    return {
      level, assetId: `glb_fixture_lod${level}`, sha256,
      bytes: level === 2 ? 400_000 : assetBudgets.phone.assetBytes + 1,
      storageUrl: `/api/assets/glb/${sha256}.glb`,
      targetKey: assigned ? "npc_lyra" : null,
      normalization: glbNormalizationTestFixture(sha256, level),
    };
  });
  const primary = lods[0]!;
  return { version: "aurion.glb-import.v1", revision: "f".repeat(64), entries: [glbCatalogEntrySchema.parse({
    assetId: primary.assetId, sha256: primary.sha256, storageUrl: primary.storageUrl,
    targetKey: primary.targetKey, normalization: primary.normalization,
    assetType: kind, purpose: kind === "enemy" ? "enemy-fallback" : "npc-fallback",
    displayName: kind === "enemy" ? "Enemy Fallback · Generic Creature" : "NPC Fallback · Universal Human",
    lods,
  })] };
}

describe("physical actor LOD source identity", () => {
  it.each(["enemy", "npc-fallback", "npc-assigned"] as const)("keeps the selected %s bytes and normalization together", kind => {
    const source = catalog(kind === "enemy" ? "enemy" : "character", kind === "npc-assigned");
    const selected = kind === "enemy"
      ? selectEnemyGlb(source, "aether_wisp", 0, "phone", "aether_wisp:mob_1")
      : selectNpcGlb(source, "lyra", null, 0, "phone");
    const physical = source.entries[0]!.lods![2]!;
    expect(selected?.entry.sha256).toBe(physical.sha256);
    expect(selected?.entry.normalization).toEqual(physical.normalization);
    expect(glbCatalogEntrySchema.parse(selected?.entry).normalization.sourceSha256).toBe(physical.sha256);
    expect(source.entries[0]!.normalization.lod.level).toBe(0);
  });

  it("admits a 15 MB high-detail physical model within the doubled phone limit", () => {
    const source = catalog("character", false);
    const entry = source.entries[0]!;
    const lods = entry.lods!.map((lod, index) => index < 2 ? { ...lod, bytes: 15_000_000 } : lod);
    const permitted = { ...source, entries: [{ ...entry, lods }] } as GlbRuntimeCatalog;
    expect(selectNpcGlb(permitted, "lyra", null, 0, "phone")?.entry.sha256).toBe(entry.sha256);
  });
});
