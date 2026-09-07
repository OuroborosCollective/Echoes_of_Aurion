import { describe, expect, it } from "vitest";
import type { GlbRuntimeCatalog } from "@shared/glbImportContract";
import { NPC_FALLBACK_DISPLAY_PREFIX } from "@shared/glbImportContract";
import { isNpcFallbackCatalogEntry, npcFallbackPool, npcFallbackVariants, npcVisualIdentityHash, selectNpcGlb } from "./NpcGlbFallback";

const entry = (assetId: string, sha: string, displayName: string, targetKey: string | null = null) => ({
  assetId,
  sha256: sha.repeat(64).slice(0, 64),
  displayName,
  assetType: "character" as const,
  storageUrl: `/api/assets/glb/${sha.repeat(64).slice(0, 64)}.glb`,
  targetKey,
});

const catalog = (entries: GlbRuntimeCatalog["entries"]): GlbRuntimeCatalog => ({
  version: "aurion.glb-import.v1",
  revision: "f".repeat(64),
  entries,
});

describe("deterministic NPC GLB fallback selection", () => {
  it("always prefers an exact server assignment over the fallback pool", () => {
    const assigned = entry("glb_assigned", "a", "Blacksmith", "npc_blacksmith");
    const fallback = entry("glb_fallback", "b", `${NPC_FALLBACK_DISPLAY_PREFIX}Universal Buns`);
    const selected = selectNpcGlb(catalog([fallback, assigned]), "observatory_blacksmith", "npc_blacksmith");
    expect(selected).toMatchObject({ entry: assigned, source: "assigned", fallbackIndex: null });
  });

  it("admits only explicitly marked, unassigned character assets into the fallback pool", () => {
    const fallback = entry("glb_fallback", "b", `${NPC_FALLBACK_DISPLAY_PREFIX}Universal Buns`);
    const plainCatalogCharacter = entry("glb_plain", "c", "Unmarked Character");
    const player = entry("glb_player", "d", `${NPC_FALLBACK_DISPLAY_PREFIX}Never Player`, "starter_player");
    const pool = npcFallbackPool(catalog([player, plainCatalogCharacter, fallback]));
    expect(pool.map(candidate => candidate.assetId)).toEqual([fallback.assetId]);
    expect(isNpcFallbackCatalogEntry(player)).toBe(false);
  });

  it("selects the same model for the same NPC even when catalog input order changes", () => {
    const candidates = [
      entry("glb_c", "c", `${NPC_FALLBACK_DISPLAY_PREFIX}C`),
      entry("glb_a", "a", `${NPC_FALLBACK_DISPLAY_PREFIX}A`),
      entry("glb_b", "b", `${NPC_FALLBACK_DISPLAY_PREFIX}B`),
    ];
    const first = selectNpcGlb(catalog(candidates), "questgiver:lyra");
    const second = selectNpcGlb(catalog([candidates[1]!, candidates[2]!, candidates[0]!]), "questgiver:lyra");
    expect(first?.entry.sha256).toBe(second?.entry.sha256);
    expect(first?.fallbackIndex).toBe(npcVisualIdentityHash("questgiver:lyra") % 3);
  });

  it("treats LOD0 and LOD1 as one character identity and honors an explicit presentation LOD", () => {
    const other = entry("glb_other", "c", `${NPC_FALLBACK_DISPLAY_PREFIX}Universal Male Beard LOD0`);
    const high = entry("glb_buns_lod0", "a", `${NPC_FALLBACK_DISPLAY_PREFIX}Universal Female Buns LOD0`);
    const low = entry("glb_buns_lod1", "b", `${NPC_FALLBACK_DISPLAY_PREFIX}Universal Female Buns LOD1`);
    const variants = npcFallbackVariants(catalog([low, other, high]));
    expect(variants).toHaveLength(2);
    const identity = Array.from({ length: 100 }, (_, index) => `npc:${index}`).find(candidate => selectNpcGlb(catalog([low, other, high]), candidate)?.variantKey === "universal female buns")!;
    expect(selectNpcGlb(catalog([low, other, high]), identity, null, 0)?.entry.assetId).toBe("glb_buns_lod0");
    expect(selectNpcGlb(catalog([low, other, high]), identity, null, 1)?.entry.assetId).toBe("glb_buns_lod1");
  });

  it("returns no visual claim when no approved fallback exists", () => {
    expect(selectNpcGlb(catalog([entry("glb_player", "a", "Player", "starter_player")]), "npc:none")).toBeNull();
    expect(selectNpcGlb(null, "npc:none")).toBeNull();
  });
});
