import { readFileSync } from "node:fs";
import { ZONE_POSITION_LIMIT, ZONE_POSITION_MIN } from "../shared/zonePresenceContract";
import { AX1_BLADE_SKILL_SOURCE_REVISION } from "../shared/ax1BladeSkillProtocol";
import { ZONE_COMBAT_CONTRACT_VERSION } from "../shared/zoneCombatContract";
import { describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import { WASD_MOB_COLLISION_SUBSTEP_MAX_MM, mobCollisionSubsteps } from "./wasdMobCollisionProtocol";
import { WASD_ZONE_CARDINAL_STEP_FIXED, WASD_ZONE_DIAGONAL_STEP_FIXED } from "./wasdZoneMovementProtocol";
import { AuthoritativeMovementZone, integrateZoneMovement } from "./zoneRuntime";

describe("WASD authoritative zone movement", () => {
  it("keeps every balanced mob collision sweep within the WASD 340 mm per-axis contract", () => {
    expect(WASD_MOB_COLLISION_SUBSTEP_MAX_MM).toBe(340);
    for(const distance of [425,450,550,750]){
      const from={x:12_345,z:-9_876},desired={x:12_345+distance,z:-9_876-distance};
      const targets=mobCollisionSubsteps(from,desired);
      expect(targets.at(-1)).toEqual(desired);
      let previous=from;
      for(const target of targets){
        expect(Math.abs(target.x-previous.x)).toBeLessThanOrEqual(WASD_MOB_COLLISION_SUBSTEP_MAX_MM);
        expect(Math.abs(target.z-previous.z)).toBeLessThanOrEqual(WASD_MOB_COLLISION_SUBSTEP_MAX_MM);
        previous=target;
      }
    }
  });

  it("integrates cardinal and diagonal intents with WASD-owned fixed-point steps", () => {
    expect(WASD_ZONE_CARDINAL_STEP_FIXED).toBe(340);
    expect(WASD_ZONE_DIAGONAL_STEP_FIXED).toBe(240);
    expect(integrateZoneMovement({ x: 0, z: 0 }, { x: 1, z: 0 })).toEqual({ x: 340, z: 0 });
    expect(integrateZoneMovement({ x: 0, z: 0 }, { x: 1, z: -1 })).toEqual({ x: 240, z: -240 });
    expect(integrateZoneMovement({ x: 340, z: -340 }, { x: 0, z: 0 })).toEqual({ x: 340, z: -340 });
    const zoneSource = readFileSync("server/zoneRuntime.ts", "utf8");
    expect(zoneSource).not.toContain("CARDINAL_STEP_FIXED=340");
    expect(zoneSource).not.toContain("DIAGONAL_STEP_FIXED=240");
    expect(zoneSource).toContain("integrateWasdZoneMovement");
  });

  it("clamps the authoritative position at the confirmed zone boundary", () => {
    expect(integrateZoneMovement({ x: ZONE_POSITION_LIMIT, z: ZONE_POSITION_MIN }, { x: 1, z: -1 })).toEqual({ x: ZONE_POSITION_LIMIT, z: ZONE_POSITION_MIN });
  });

  it("confirms a stationary player and accepted stop sequence while autonomous mobs may advance the world tick", () => {
    const socket = { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() };
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const { connectionId } = zone.join({ userId: 1, socket: socket as unknown as WebSocket });
    const latest = () => JSON.parse(socket.send.mock.calls.at(-1)![0]);
    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 1, z: 0 } });
    expect(zone.tick()).toBe(true);
    const moving = latest();
    zone.submitMovement(connectionId, { type: "move", clientSeq: 2, input: { x: 0, z: 0 } });
    zone.tick();
    const stopped = latest();
    expect(stopped.tick).toBe(moving.tick + 1);
    expect(stopped.presences[0]).toMatchObject({ position: moving.presences[0].position, lastAcceptedClientSeq: 2 });
    expect(stopped.snapshotSeq).toBeGreaterThan(moving.snapshotSeq);
    const stoppedPosition = { ...moving.presences[0].position };
    for (let tick = 0; tick < 4; tick += 1) {
      zone.tick();
      expect(zone.positionForConnection(connectionId)).toEqual(stoppedPosition);
    }
    expect(zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: -1, z: 0 } })).toBe("stale");
    zone.tick();
    expect(zone.positionForConnection(connectionId)).toEqual(stoppedPosition);
  });

  it("keeps the player pinned at a real nature collider while autonomous world state may continue changing", () => {
    const socket = { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() };
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const { connectionId } = zone.join({ userId: 2, socket: socket as unknown as WebSocket });
    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 0, z: -1 } });
    for (let tick = 0; tick < 165; tick += 1) zone.tick();
    zone.submitMovement(connectionId, { type: "move", clientSeq: 2, input: { x: -1, z: 0 } });
    for (let tick = 0; tick < 64; tick += 1) zone.tick();
    const boundary = JSON.parse(socket.send.mock.calls.at(-1)![0]);
    const boundaryPosition = {x:-21_760,z:-56_100};
    expect(boundary.presences[0].position).toEqual(boundaryPosition);
    for (let tick = 0; tick < 4; tick += 1) {
      zone.tick();
      expect(zone.positionForConnection(connectionId)).toEqual(boundaryPosition);
    }
  });

  it("replaces an authenticated user's old connection and invalidates the cached deterministic peer order", () => {
    const socket = () => ({ readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() });
    const first = socket(), second = socket(); const zone = new AuthoritativeMovementZone("observatory_threshold");
    const old = zone.join({ userId: 1, socket: first as unknown as WebSocket });
    expect(zone.submitMovement(old.connectionId, { type: "move", clientSeq: 1, input: { x: 1, z: 0 } })).toBe("accepted");
    expect(zone.tick()).toBe(true);
    expect(zone.positionForConnection(old.connectionId)).toEqual({ x: 340, z: 0 });

    const current = zone.join({ userId: 1, socket: second as unknown as WebSocket });
    expect(first.close).toHaveBeenCalledTimes(1);
    expect(current.presences).toHaveLength(1);
    expect(zone.positionForConnection(old.connectionId)).toBeUndefined();
    expect(zone.submitMovement(old.connectionId, { type: "move", clientSeq: 2, input: { x: 1, z: 0 } })).toBe("missing");
    expect(zone.submitMovement(current.connectionId, { type: "move", clientSeq: 1, input: { x: -1, z: 0 } })).toBe("accepted");
    expect(zone.tick()).toBe(true);
    expect(zone.positionForConnection(current.connectionId)).toEqual({ x: -340, z: 0 });

    zone.leave(old.connectionId);
    expect(zone.positionForConnection(current.connectionId)).toEqual({ x: -340, z: 0 });
    zone.leave(current.connectionId);
    expect(zone.positionForConnection(current.connectionId)).toBeUndefined();
  });

  it("binds k_strike to the confirmed blade track, AX1 range and server cooldown", () => {
    const socket = { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() };
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const { connectionId } = zone.join({ userId: 7, socket: socket as unknown as WebSocket, combatProfile: { combatLevel: 7, maxHealth: 540, weaponBonus: 15, weaponTrack: "blade" } });

    expect(zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 0, z: -1 } })).toBe("accepted");
    for (let tick = 0; tick < 5; tick += 1) zone.tick();
    expect(zone.submitMovement(connectionId, { type: "move", clientSeq: 2, input: { x: 0, z: 0 } })).toBe("accepted");

    const before = zone.mobSnapshot().find(mob => mob.entityId === "mob_12")!.health;
    expect(zone.submitSkill(connectionId, { type: "skill", clientSeq: 3, skillId: "k_strike", targetEntityId: "mob_12" })).toBe("accepted");
    const combatEvents = socket.send.mock.calls.map(([payload]) => JSON.parse(payload)).filter(message => message.type === "combat" && message.attackerEntityId === "player:7");
    expect(combatEvents.at(-1)).toMatchObject({
      contractVersion: ZONE_COMBAT_CONTRACT_VERSION,
      action: "melee",
      skillId: "k_strike",
      skillSourceRevision: AX1_BLADE_SKILL_SOURCE_REVISION,
      defenderEntityId: "mob_12",
    });
    expect(zone.mobSnapshot().find(mob => mob.entityId === "mob_12")!.health).toBeLessThanOrEqual(before);
    expect(zone.submitSkill(connectionId, { type: "skill", clientSeq: 4, skillId: "k_strike", targetEntityId: "mob_12" })).toBe("cooldown");
    for (let tick = 0; tick < 8; tick += 1) zone.tick();
    expect(zone.submitSkill(connectionId, { type: "skill", clientSeq: 5, skillId: "k_strike", targetEntityId: "mob_12" })).toBe("accepted");
  });

  it("rejects AX1 blade skills on the wrong weapon track before any combat mutation", () => {
    const socket = { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() };
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const { connectionId } = zone.join({ userId: 8, socket: socket as unknown as WebSocket, combatProfile: { combatLevel: 7, maxHealth: 540, weaponBonus: 0, weaponTrack: "staff" } });
    const before = zone.mobSnapshot().find(mob => mob.entityId === "mob_12")!.health;
    expect(zone.submitSkill(connectionId, { type: "skill", clientSeq: 1, skillId: "k_strike", targetEntityId: "mob_12" })).toBe("invalid_skill");
    expect(zone.mobSnapshot().find(mob => mob.entityId === "mob_12")!.health).toBe(before);
    expect(socket.send.mock.calls.map(([payload]) => JSON.parse(payload)).some(message => message.type === "combat" && message.skillId === "k_strike")).toBe(false);
  });

  it("rejects an out-of-range k_strike without mutating the target", () => {
    const socket = { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() };
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const { connectionId } = zone.join({ userId: 9, socket: socket as unknown as WebSocket, combatProfile: { combatLevel: 7, maxHealth: 540, weaponBonus: 15, weaponTrack: "blade" } });
    const before = zone.mobSnapshot().find(mob => mob.entityId === "mob_1")!.health;
    expect(zone.submitSkill(connectionId, { type: "skill", clientSeq: 1, skillId: "k_strike", targetEntityId: "mob_1" })).toBe("out_of_range");
    expect(zone.mobSnapshot().find(mob => mob.entityId === "mob_1")!.health).toBe(before);
  });
});
