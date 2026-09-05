import { describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import { AuthoritativeMovementZone, integrateZoneMovement } from "./zoneRuntime";

describe("authoritative zone movement", () => {
  it("integrates cardinal and diagonal intents with fixed-point integer steps", () => {
    expect(integrateZoneMovement({ x: 0, z: 0 }, { x: 1, z: 0 })).toEqual({ x: 340, z: 0 });
    expect(integrateZoneMovement({ x: 0, z: 0 }, { x: 1, z: -1 })).toEqual({ x: 240, z: -240 });
    expect(integrateZoneMovement({ x: 340, z: -340 }, { x: 0, z: 0 })).toEqual({ x: 340, z: -340 });
  });

  it("clamps the authoritative position at the confirmed zone boundary", () => {
    expect(integrateZoneMovement({ x: 14_500, z: -14_500 }, { x: 1, z: -1 })).toEqual({ x: 14_500, z: -14_500 });
  });
  it("replaces an authenticated user's old connection without duplicating their entity", () => {
    const socket = () => ({ readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() });
    const first = socket(), second = socket(); const zone = new AuthoritativeMovementZone("observatory_threshold");
    const old = zone.join({ userId: 1, socket: first as unknown as WebSocket });
    const current = zone.join({ userId: 1, socket: second as unknown as WebSocket });
    expect(first.close).toHaveBeenCalledTimes(1); expect(current.presences).toHaveLength(1); expect(zone.positionForConnection(old.connectionId)).toBeUndefined();
    zone.leave(old.connectionId); expect(zone.positionForConnection(current.connectionId)).toEqual({ x: 0, z: 0 });
  });
});
