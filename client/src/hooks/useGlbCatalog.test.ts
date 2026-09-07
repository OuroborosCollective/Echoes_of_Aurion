import { describe, expect, it } from "vitest";
import { NPC_FALLBACK_DISPLAY_PREFIX, type GlbRuntimeCatalog } from "@shared/glbImportContract";
import { worldServiceNpcs } from "@shared/worldServiceNpcs";
import { projectServiceNpcFallbackTargets } from "./useGlbCatalog";

const base = (entries: GlbRuntimeCatalog["entries"]): GlbRuntimeCatalog => ({ version: "aurion.glb-import.v1", revision: "f".repeat(64), entries });
const character = (id: string, sha: string, name: string, targetKey: string | null) => ({
  assetId: id,
  sha256: sha.repeat(64).slice(0, 64),
  displayName: name,
  assetType: "character" as const,
  storageUrl: `/api/assets/glb/${sha.repeat(64).slice(0, 64)}.glb`,
  targetKey,
});

describe("service NPC GLB fallback catalog projection", () => {
  it("keeps the exact assigned service model when one exists", () => {
    const definition = worldServiceNpcs[0]!;
    const exact = character("glb_exact", "a", "Smith", definition.targetKey);
    const fallback = character("glb_fallback", "b", `${NPC_FALLBACK_DISPLAY_PREFIX}Fallback`, null);
    const catalog = base([fallback, exact]);
    const projected = projectServiceNpcFallbackTargets(catalog);
    expect(projected).toBe(catalog);
    expect(projected.entries.filter(entry => entry.targetKey === definition.targetKey)).toEqual([exact]);
  });

  it("adds a deterministic runtime-only target for every model-less published service NPC", () => {
    const fallbacks = [
      character("glb_b", "b", `${NPC_FALLBACK_DISPLAY_PREFIX}B`, null),
      character("glb_a", "a", `${NPC_FALLBACK_DISPLAY_PREFIX}A`, null),
    ];
    const authoritative = base(fallbacks);
    const projected = projectServiceNpcFallbackTargets(authoritative);
    for (const definition of worldServiceNpcs) {
      const selected = projected.entries.find(entry => entry.targetKey === definition.targetKey);
      expect(selected?.assetType).toBe("character");
      expect(selected?.displayName.startsWith(NPC_FALLBACK_DISPLAY_PREFIX)).toBe(true);
    }
    expect(authoritative.entries.every(entry => entry.targetKey === null)).toBe(true);
    expect(authoritative.entries).toHaveLength(fallbacks.length);
  });

  it("does not invent a service model when the approved fallback pool is empty", () => {
    const catalog = base([character("glb_player", "a", "Player", "starter_player")]);
    expect(projectServiceNpcFallbackTargets(catalog)).toBe(catalog);
  });
});
