import { describe, expect, it } from "vitest";
import {
  STARTER_CHARACTER_ASSETS,
  selectStarterMonsterLod,
  starterCreatureKindForArena,
} from "./starterCharacterAssets";

describe("starter character asset contract", () => {
  it("binds the supplied humanoid and verified animation/socket contract", () => {
    expect(STARTER_CHARACTER_ASSETS.player.url).toBe("/game-assets/characters/aurion_humanoid_v1.glb");
    expect(STARTER_CHARACTER_ASSETS.player.animations).toEqual(["AttackCombo", "Death", "Fight", "Idle", "Jump", "Run", "Walk"]);
    expect(STARTER_CHARACTER_ASSETS.player.equipmentSockets).toHaveLength(14);
  });

  it("does not claim the unexported spider Aggro clip", () => {
    expect(STARTER_CHARACTER_ASSETS.spider.animations).toEqual(["Idle", "Walk", "Attack", "Death"]);
    expect(STARTER_CHARACTER_ASSETS.spider.animations).not.toContain("Aggro");
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
