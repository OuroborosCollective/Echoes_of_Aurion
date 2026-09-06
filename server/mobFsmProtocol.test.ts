import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ConfirmedZonePresence } from "../shared/zonePresenceContract";
import { observatoryMobDefinitions } from "./ax1MobContent";
import { initialMobRuntimeState, nearestAggroTarget, publicMobSnapshot, resolveMobFsmTick, type MobRuntimeState } from "./wasdMobFsmProtocol";

const player=(userId:number,x:number,z:number):ConfirmedZonePresence=>({entityId:`player:${userId}`,userId,position:{x,z},lastAcceptedClientSeq:1});
const definition=(id:string)=>observatoryMobDefinitions.find(row=>row.entityId===id)!;

describe("AIM-263 WASD mob FSM over AX1 content",()=>{
  it("ports the sixteen AX1 visual mob identities into stable content definitions",()=>{
    expect(observatoryMobDefinitions).toHaveLength(16);
    expect(new Set(observatoryMobDefinitions.map(row=>row.entityId)).size).toBe(16);
    expect(observatoryMobDefinitions.find(row=>row.archetype==="titan_boss")).toMatchObject({isBoss:true,isElite:true,homePosition:{x:0,z:68_000}});
  });

  it("uses exact WASD proximity classes: normal 16m, elite 22m, boss 28m",()=>{
    const normal=definition("mob_1"),elite=definition("mob_3"),boss=definition("mob_6");
    expect(nearestAggroTarget(normal,normal.homePosition,[player(1,normal.homePosition.x+15_999,normal.homePosition.z)])?.entityId).toBe("player:1");
    expect(nearestAggroTarget(normal,normal.homePosition,[player(1,normal.homePosition.x+16_001,normal.homePosition.z)])).toBeNull();
    expect(nearestAggroTarget(elite,elite.homePosition,[player(2,elite.homePosition.x+21_999,elite.homePosition.z)])?.entityId).toBe("player:2");
    expect(nearestAggroTarget(elite,elite.homePosition,[player(2,elite.homePosition.x+22_001,elite.homePosition.z)])).toBeNull();
    expect(nearestAggroTarget(boss,boss.homePosition,[player(3,boss.homePosition.x+27_999,boss.homePosition.z)])?.entityId).toBe("player:3");
    expect(nearestAggroTarget(boss,boss.homePosition,[player(3,boss.homePosition.x+28_001,boss.homePosition.z)])).toBeNull();
  });

  it("selects nearest confirmed player and breaks exact distance ties by entity id",()=>{
    const def=definition("mob_1");
    const candidates=[player(12,def.homePosition.x+4_000,def.homePosition.z),player(2,def.homePosition.x-4_000,def.homePosition.z),player(9,def.homePosition.x+8_000,def.homePosition.z)];
    expect(nearestAggroTarget(def,def.homePosition,candidates)?.entityId).toBe("player:12");
    expect(nearestAggroTarget(def,def.homePosition,[candidates[1]!,candidates[0]!])?.entityId).toBe("player:12");
  });

  it("keeps the exact acquired actor sticky even when another player later becomes nearer",()=>{
    const def=definition("mob_1");
    const first=resolveMobFsmTick({current:initialMobRuntimeState(def,0),presences:[player(7,def.homePosition.x+8_000,def.homePosition.z)],tick:1});
    expect(first).toMatchObject({state:"combat",targetEntityId:"player:7"});
    const second=resolveMobFsmTick({current:first,presences:[player(7,def.homePosition.x+8_000,def.homePosition.z),player(3,def.homePosition.x+1_000,def.homePosition.z)],tick:2});
    expect(second.targetEntityId).toBe("player:7");
  });

  it("moves only toward the confirmed target and enters evade if the actor disappears",()=>{
    const def=definition("mob_1");
    const target=player(4,def.homePosition.x+10_000,def.homePosition.z);
    const combat=resolveMobFsmTick({current:initialMobRuntimeState(def,0),presences:[target],tick:1});
    const chased=resolveMobFsmTick({current:combat,presences:[target],tick:2});
    expect(chased.position.x).toBeGreaterThan(combat.position.x);
    expect(chased.position.z).toBe(combat.position.z);
    const lost=resolveMobFsmTick({current:chased,presences:[],tick:3});
    expect(lost).toMatchObject({state:"evading",targetEntityId:null});
  });

  it("evades when the 48m spawn leash or combat dropoff is broken and returns to idle near home",()=>{
    const def=definition("mob_1");
    const target=player(5,def.homePosition.x+10_000,def.homePosition.z);
    const combat=resolveMobFsmTick({current:initialMobRuntimeState(def,0),presences:[target],tick:1});
    const leashBroken:MobRuntimeState={...combat,position:{x:def.homePosition.x+48_001,z:def.homePosition.z}};
    expect(resolveMobFsmTick({current:leashBroken,presences:[target],tick:2}).state).toBe("evading");
    const farTarget=player(5,combat.position.x+30_401,combat.position.z);
    expect(resolveMobFsmTick({current:combat,presences:[farTarget],tick:2}).state).toBe("evading");
    const nearHome:MobRuntimeState={...combat,state:"evading",targetEntityId:null,position:{x:def.homePosition.x+2_999,z:def.homePosition.z}};
    const returned=resolveMobFsmTick({current:nearHome,presences:[],tick:30});
    expect(returned).toMatchObject({state:"idle",position:def.homePosition,targetEntityId:null});
  });

  it("uses deterministic tick-derived idle/patrol behavior without ambient clocks or randomness",()=>{
    const def=definition("mob_2");
    const a=initialMobRuntimeState(def,100),b=initialMobRuntimeState(def,100);
    expect(a).toEqual(b);
    let left=a,right=b;
    for(let tick=101;tick<180;tick++){
      left=resolveMobFsmTick({current:left,presences:[],tick});
      right=resolveMobFsmTick({current:right,presences:[],tick});
      expect(left).toEqual(right);
    }
    expect(["idle","patrolling"]).toContain(left.state);
    const source=readFileSync("server/wasdMobFsmProtocol.ts","utf8");
    expect(source).not.toContain("Date.now");
    expect(source).not.toContain("performance.now");
    expect(source).not.toContain("Math.random");
    expect(readFileSync("server/ax1MobContent.ts","utf8")).not.toContain("resolveMobFsmTick");
  });

  it("publishes only bounded authoritative projection state and never runtime internals",()=>{
    const def=definition("mob_6");
    const state=initialMobRuntimeState(def,0);
    const snapshot=publicMobSnapshot(state);
    expect(snapshot).toEqual({entityId:"mob_6",archetype:"titan_boss",level:def.level,state:"idle",position:{x:0,z:68_000},targetEntityId:null,isBoss:true,isElite:true,health:def.maxHealth,maxHealth:def.maxHealth});
    expect(Object.keys(snapshot).sort()).toEqual(["archetype","entityId","health","isBoss","isElite","level","maxHealth","position","state","targetEntityId"]);
    expect(snapshot).not.toHaveProperty("stamina");
    expect(snapshot).not.toHaveProperty("nextAttackTick");
    expect(snapshot).not.toHaveProperty("idleUntilTick");
    expect(snapshot).not.toHaveProperty("definition");
    expect(Object.isFrozen(snapshot)).toBe(true);
  });
});