import { describe, expect, it } from "vitest";
import {
  STARTER_CHARACTER_ASSETS,
  normalizeStarterRuntimeAssetSources,
  selectStarterMonsterLod,
  starterCreatureKindForArena,
} from "./starterCharacterAssets";

describe("starter character asset contract", () => {
  it("keeps the verified player animation/socket contract without embedding build payloads", () => {
    expect(STARTER_CHARACTER_ASSETS.player.animations).toEqual(["AttackCombo", "Death", "Fight", "Idle", "Jump", "Run", "Walk"]);
    expect(STARTER_CHARACTER_ASSETS.player.equipmentSockets).toHaveLength(14);
  });

  it("does not claim the unexported spider Aggro clip", () => {
    expect(STARTER_CHARACTER_ASSETS.spider.animations).toEqual(["Idle", "Walk", "Attack", "Death"]);
    expect(STARTER_CHARACTER_ASSETS.spider.animations).not.toContain("Aggro");
  });

  it("preserves the supplied four-level monster LOD contract", () => {
    expect(STARTER_CHARACTER_ASSETS.beast.lods.map(lod => lod.triangleCount)).toEqual([1149, 694, 345, 145]);
  });

  it("normalizes only bounded runtime assignment sources", () => {
    const normalized = normalizeStarterRuntimeAssetSources({
      player: { assetId: "glb_player_123", storageUrl: "https://assets.example/player.glb" },
      spider: { assetId: "glb_spider_123", storageUrl: "https://assets.example/spider.glb" },
      beastLods: [
        { assetId: "glb_beast0_123", storageUrl: "https://assets.example/beast0.glb" },
        { assetId: "glb_beast1_123", storageUrl: "https://assets.example/beast1.glb" },
        { assetId: "glb_beast2_123", storageUrl: "javascript:alert(1)" },
        null,
      ],
    });
    expect(normalized.player?.assetId).toBe("glb_player_123");
    expect(normalized.spider?.storageUrl).toBe("https://assets.example/spider.glb");
    expect(normalized.beastLods[0]?.assetId).toBe("glb_beast0_123");
    expect(normalized.beastLods[1]?.assetId).toBe("glb_beast1_123");
    expect(normalized.beastLods[2]).toBeNull();
    expect(normalized.beastLods[3]).toBeNull();
  });

  it("maps the first two encounter arenas to the supplied starter creatures", () => {
    expect(starterCreatureKindForArena(0)).toBe("spider");
    expect(starterCreatureKindForArena(1)).toBe("beast");
    expect(starterCreatureKindForArena(2)).toBe("procedural");
  });

  it("uses distance thresholds with ten-percent hysteresis", () => {
    expect(selectStarterMonsterLod(0, 0)).toBe(0);
    expect(selectStarterMonsterLod(10.5, 0)).toBe(0);
    expect(selectStarterMonsterLod(11, 0)).toBe(1);
    expect(selectStarterMonsterLod(24, 1)).toBe(1);
    expect(selectStarterMonsterLod(27.5, 1)).toBe(2);
    expect(selectStarterMonsterLod(55, 2)).toBe(3);
    expect(selectStarterMonsterLod(49, 3)).toBe(3);
    expect(selectStarterMonsterLod(44.9, 3)).toBe(2);
    expect(selectStarterMonsterLod(22.4, 2)).toBe(1);
    expect(selectStarterMonsterLod(8.9, 1)).toBe(0);
  });
});
