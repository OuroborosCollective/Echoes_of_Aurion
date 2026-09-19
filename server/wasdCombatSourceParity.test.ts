import { describe, expect, it } from "vitest";
import { AX1_GAME_SOURCE_REVISION, AX1_MOB_SOURCE_GIT_BLOB_SHA, AX1_STARTER_BLADE_ATTACK_BONUS, AX1_STARTER_BLADE_MAX_HP_BONUS, AX1_STARTER_SOURCE_GIT_BLOB_SHA, ax1MobCombatProjection, ax1PlayerBaseMaxHealth } from "./ax1CombatProjection";
import { WASD_ARE_DETERMINISM_SOURCE_GIT_BLOB_SHA, WASD_GAMEPLAY_SOURCE_REVISION } from "./wasdAREDeterminism";
import { WASD_COMBAT_DELTA_SOURCE_GIT_BLOB_SHA, resolveCombatDelta, reduceCombatDelta } from "./wasdCombatDeltaProtocol";
import { regenerateWasdStamina, WASD_STAMINA_SOURCE_GIT_BLOB_SHA } from "./wasdStaminaProtocol";

describe("pinned AX1/WASD live combat contract",()=>{
  it("binds the exact source revisions and blobs used by the migration",()=>{
    expect(WASD_GAMEPLAY_SOURCE_REVISION).toBe("328240450d33490637f8cc4ae87d3fbeecca27c9");
    expect(WASD_ARE_DETERMINISM_SOURCE_GIT_BLOB_SHA).toBe("52841e5c901604b32cbd56dcb2ce62bc43218895");
    expect(WASD_COMBAT_DELTA_SOURCE_GIT_BLOB_SHA).toBe("ee3985d61b7e021683ec80b61463691a4c3f5fa9");
    expect(WASD_STAMINA_SOURCE_GIT_BLOB_SHA).toBe("079e410f2a287070055ce173e27c6a1442abacd4");
    expect(AX1_GAME_SOURCE_REVISION).toBe("d356881538dae23c3aa97364a5596d48b6ac3079");
    expect(AX1_MOB_SOURCE_GIT_BLOB_SHA).toBe("774b42d03ad0e3c0a1b41ebce4ad352d6170cfc5");
    expect(AX1_STARTER_SOURCE_GIT_BLOB_SHA).toBe("2e44ad352041c33a5a9e441c3d28ca1392dd1efe");
  });

  it("matches the canonical WASD delta-resolver test vector",()=>{
    const attacker={id:"p1",stamina:50,skills:{combat:{level:50}}};
    const defender={id:"m1",health:100,skills:{combat:{level:1}}};
    const delta=resolveCombatDelta("melee",attacker,defender,{tick:10,sequence:1,weaponBonus:5});
    expect(delta.result).toEqual({success:true,hit:true,damage:62,crit:false,killed:false,defenderHealth:38});
    expect(delta.staminaDelta).toBe(-8);
    expect(reduceCombatDelta(attacker,defender,delta)).toEqual({attacker:{id:"p1",stamina:42},defender:{id:"m1",health:38}});
  });

  it("makes a starter attack independent from quest state",()=>{
    const delta=resolveCombatDelta("melee",{id:"player:1",stamina:100,skills:{combat:{level:1}}},{id:"mob_1",health:225,skills:{combat:{level:1}}},{tick:7,sequence:1,weaponBonus:AX1_STARTER_BLADE_ATTACK_BONUS});
    expect(delta.result).toEqual({success:true,hit:true,damage:23,crit:false,killed:false,defenderHealth:202});
    expect(Object.keys(delta)).not.toContain("quest");
  });

  it("projects classless AX1 starter health and mob values without letting AX1 resolve hits",()=>{
    expect(AX1_STARTER_BLADE_ATTACK_BONUS).toBe(15);
    expect(AX1_STARTER_BLADE_MAX_HP_BONUS).toBe(20);
    for (const playerClass of ["unbound", "vanguard", "seer", "warden"] as const) {
      expect(ax1PlayerBaseMaxHealth(playerClass,false)).toBe(520);
      expect(ax1PlayerBaseMaxHealth(playerClass,true)).toBe(540);
    }
    expect(ax1MobCombatProjection("aether_wisp",2)).toEqual({maxHealth:210,attackRangeFixed:14_000,attackCooldownTicks:25});
    expect(ax1MobCombatProjection("steam_drake",4)).toEqual({maxHealth:740,attackRangeFixed:12_000,attackCooldownTicks:18});
    expect(ax1MobCombatProjection("titan_boss",15)).toEqual({maxHealth:5_200,attackRangeFixed:5_000,attackCooldownTicks:25});
  });

  it("ports WASD stamina regeneration exactly",()=>{
    expect(regenerateWasdStamina(0)).toBe(1);
    expect(regenerateWasdStamina(92)).toBe(93);
    expect(regenerateWasdStamina(100)).toBe(100);
  });
});
