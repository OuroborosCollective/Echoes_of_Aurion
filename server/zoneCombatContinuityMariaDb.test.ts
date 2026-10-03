import { createPool } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import type WebSocket from "ws";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import { globalTickRecorder } from "./causality/tickRecorder";
import { MariaDBCausalPersistenceAdapter } from "./causality/persistence";
import { hashCanonicalZoneState } from "./causality/zoneCanonicalState";
import { computeReceiptHash } from "../shared/aurionCausalTickContract";
import type { ZoneId } from "./zoneProtocol";

const suite = process.env.DATABASE_URL?.endsWith("/aurion_combat_classless_test") ? describe : describe.skip;
suite("combat state durable readback on isolated MariaDB", () => {
  it("persists both damage directions and restores confirmed unarmed equipment with the canonical checkpoint", async () => {
    const zoneId = "observatory_threshold:combat-continuity" as ZoneId;
    const pool = createPool(process.env.DATABASE_URL!);
    try {
      await pool.query("DELETE FROM aurionCausalTickReceipts WHERE zoneId=?", [zoneId]);
      await pool.query("DELETE FROM aurionCausalCheckpoints WHERE zoneId=?", [zoneId]);
    } finally { await pool.end(); }
    const zone = new AuthoritativeMovementZone(zoneId);
    const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as unknown as WebSocket;
    const { connectionId } = zone.join({ userId: 737001, socket,
      combatProfile: { combatLevel: 1, maxHealth: 10_000, weaponBonus: 0, weaponTrack: "staff", weaponEquipped: false } });
    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 0, z: -1 } });
    for (let i = 0; i < 5; i++) zone.tick();
    let seq = 2;
    for (let i = 0; i < 30; i++) {
      expect(zone.submitAttack(connectionId, { type: "attack", clientSeq: seq++, targetEntityId: "mob_12" })).toBe("accepted");
      zone.submitMovement(connectionId, { type: "move", clientSeq: seq++, input: { x: 0, z: 0 } });
      zone.tick();
    }
    const state = zone.getCanonicalZoneState();
    expect(state.players[0]!.health).toBeLessThan(10_000);
    const target = state.mobs.find(mob => mob.entityId === "mob_12")!;
    expect(target.health).toBeLessThan(target.maxHealth);
    await globalTickRecorder.flushPersistence();
    const adapter = new MariaDBCausalPersistenceAdapter();
    const receipt = await adapter.getLatestReceipt(zoneId);
    expect(receipt!.receiptHash).toBe(computeReceiptHash(receipt!));
    expect(receipt!.postStateHash).toBe(hashCanonicalZoneState(state));
    await adapter.saveCheckpoint(zoneId, state.tick, hashCanonicalZoneState(state), state);
    const saved = await adapter.getCheckpoint(zoneId, state.tick);
    expect(saved!.state).toEqual(state);
    const restored = new AuthoritativeMovementZone(zoneId);
    restored.restoreFromCanonicalState(saved!.state);
    expect(restored.getCanonicalZoneState().players).toEqual(state.players);
    expect(restored.getCanonicalZoneState().mobs).toEqual(state.mobs);
  });
});
