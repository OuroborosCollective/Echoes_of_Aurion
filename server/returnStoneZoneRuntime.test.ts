import { describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import {
  AURION_RETURN_STONE_POSITION,
  AURION_RETURN_STONE_REVIVE_DELAY_TICKS,
} from "../shared/aurionReturnStoneContract";
import { hashCanonicalZoneState } from "./causality/zoneCanonicalState";
import { WASD_MAX_STAMINA } from "./wasdStaminaProtocol";
import { AuthoritativeMovementZone } from "./zoneRuntime";

function socket(): WebSocket {
  return {
    readyState: 1,
    OPEN: 1,
    send: vi.fn(),
    close: vi.fn(),
  } as unknown as WebSocket;
}

describe("return stone in the authoritative zone tick", () => {
  it("keeps defeat canonical until the delay expires, then revives and receipts the new state", () => {
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    zone.isReplay = true;
    zone.join({ userId: 41, socket: socket() });

    const joined = zone.getCanonicalZoneState();
    const player = joined.players[0]!;
    const deathTick = 70;
    zone.restoreFromCanonicalState({
      ...joined,
      tick: deathTick,
      players: [{
        ...player,
        x: 121_000,
        z: -91_000,
        health: 0,
        stamina: 0,
        lastCombatSequence: deathTick * 1000 + 4,
      }],
      mobs: joined.mobs.map(mob => ({ ...mob, health: 0 })),
    });

    for (let index = 0; index < AURION_RETURN_STONE_REVIVE_DELAY_TICKS - 1; index += 1) zone.tick();
    const defeated = zone.getCanonicalZoneState().players[0]!;
    expect(defeated.health).toBe(0);
    expect({ x: defeated.x, z: defeated.z }).toEqual({ x: 121_000, z: -91_000 });

    zone.tick();
    const revivedState = zone.getCanonicalZoneState();
    const revived = revivedState.players[0]!;
    expect(revived.health).toBe(revived.maxHealth);
    expect(revived.stamina).toBe(WASD_MAX_STAMINA);
    expect({ x: revived.x, z: revived.z }).toEqual(AURION_RETURN_STONE_POSITION);

    const receipt = zone.getLatestReceipt();
    expect(receipt).not.toBeNull();
    expect(receipt!.postStateHash).toBe(hashCanonicalZoneState(revivedState));
    expect(receipt!.tick).toBe(deathTick + AURION_RETURN_STONE_REVIVE_DELAY_TICKS);
  });
});
