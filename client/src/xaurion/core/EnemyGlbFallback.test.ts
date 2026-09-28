import { describe, expect, it } from "vitest";
import type { GlbRuntimeCatalog } from "@shared/glbImportContract";
import { assetBudgets } from "@shared/glbPresentationBudget";
import { enemyFallbackPool, enemyFallbackVariants, isEnemyFallbackCatalogEntry, selectEnemyGlb } from "./EnemyGlbFallback";

const sha = (char: string) => char.repeat(64);
const enemy = (
  assetId: string,
  digest: string,
  displayName: string,
  bytes: number | null = 1_000_000,
) => ({
  assetId,
  sha256: sha(digest),
  displayName,
  assetType: "enemy" as const,
  storageUrl: `/api/assets/glb/${sha(digest)}.glb`,
  targetKey: null,
  purpose: "enemy-fallback" as const,
  subcategory: null,
  equipmentSlot: null,
  lods: undefined,
  bytes,
});

const catalog = (entries: GlbRuntimeCatalog["entries"]): GlbRuntimeCatalog => ({
  version: "aurion.glb-import.v1",
  revision: sha("f"),
  entries,
});

describe("deterministic generic enemy GLB fallback selection", () => {
  it("only admits explicitly marked unassigned enemy fallback entries", () => {
    const fallback = enemy("glb_golem", "a", "Enemy Fallback · Corrupted Golem LOD0");
    const plain = { ...fallback, purpose: "auto" as const };
    const assigned = { ...fallback, assetId: "glb_assigned", targetKey: "starter_spider" as const };
    expect(enemyFallbackPool(catalog([plain, assigned, fallback]))).toHaveLength(1);
    expect(isEnemyFallbackCatalogEntry(fallback)).toBe(true);
    expect(isEnemyFallbackCatalogEntry(plain)).toBe(false);
    expect(isEnemyFallbackCatalogEntry(assigned)).toBe(false);
  });

  it("prefers an archetype-matching family and preserves the requested physical LOD", () => {
    const golem = {
      ...enemy("glb_golem", "a", "Enemy Fallback · Corrupted Golem"),
      lods: [
        { level: 0 as const, assetId: "glb_golem0", sha256: sha("a"), bytes: 2_000_000, storageUrl: `/api/assets/glb/${sha("a")}.glb`, targetKey: null },
        { level: 1 as const, assetId: "glb_golem1", sha256: sha("b"), bytes: 1_000_000, storageUrl: `/api/assets/glb/${sha("b")}.glb`, targetKey: null },
        { level: 2 as const, assetId: "glb_golem2", sha256: sha("c"), bytes: 600_000, storageUrl: `/api/assets/glb/${sha("c")}.glb`, targetKey: null },
      ],
    };
    const generic = enemy("glb_generic", "d", "Enemy Fallback · Generic Beast");
    const selected = selectEnemyGlb(catalog([generic, golem]), "corrupted_golem", 2, "phone", "mob:1");
    expect(selected).toMatchObject({ variantKey: "corrupted golem", lod: 2, tier: "phone", entry: { assetId: "glb_golem2", sha256: sha("c") } });
  });

  it("uses a generic approved enemy fallback when no archetype-specific family exists", () => {
    const generic = enemy("glb_generic", "a", "Enemy Fallback · Generic Beast");
    const selected = selectEnemyGlb(catalog([generic]), "aether_wisp", 1, "desktop", "aether_wisp:1");
    expect(selected?.entry.assetId).toBe("glb_generic");
    expect(selected?.lod).toBe(0);
  });

  it("skips an over-budget preferred LOD and fails closed when no physical LOD fits", () => {
    const family = {
      ...enemy("glb_family", "a", "Enemy Fallback · Universal Creature"),
      lods: [
        { level: 0 as const, assetId: "glb0", sha256: sha("a"), bytes: assetBudgets.phone.assetBytes + 1, storageUrl: `/api/assets/glb/${sha("a")}.glb`, targetKey: null },
        { level: 1 as const, assetId: "glb1", sha256: sha("b"), bytes: assetBudgets.phone.assetBytes + 2, storageUrl: `/api/assets/glb/${sha("b")}.glb`, targetKey: null },
      ],
    };
    expect(selectEnemyGlb(catalog([family]), "clockwork_stalker", 0, "phone")).toBeNull();
    expect(enemyFallbackVariants(catalog([family]))).toHaveLength(1);
  });
});
