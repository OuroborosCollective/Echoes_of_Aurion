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

  it("confirms the stationary tick and accepted stop sequence without idle broadcasts", () => {
    const socket = { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() };
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const { connectionId } = zone.join({ userId: 1, socket: socket as unknown as WebSocket });
    const latest = () => JSON.parse(socket.send.mock.calls.at(-1)![0]);
    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 1, z: 0 } });
    expect(zone.tick()).toBe(true);
    const moving = latest();
    zone.submitMovement(connectionId, { type: "move", clientSeq: 2, input: { x: 0, z: 0 } });
    expect(zone.tick()).toBe(false);
    const stopped = latest();
    expect(stopped.tick).toBe(moving.tick + 1);
    expect(stopped.presences[0]).toMatchObject({ position: moving.presences[0].position, lastAcceptedClientSeq: 2 });
    expect(stopped.snapshotSeq).toBeGreaterThan(moving.snapshotSeq);
    const count = socket.send.mock.calls.length;
    zone.tick();
    expect(zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: -1, z: 0 } })).toBe("stale");
    zone.tick();
    expect(socket.send).toHaveBeenCalledTimes(count);
  });

  it("publishes zero velocity at the boundary even without another client intent", () => {
    const socket = { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() };
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const { connectionId } = zone.join({ userId: 2, socket: socket as unknown as WebSocket });
    zone.submitMovement(connectionId, { type: "move", clientSeq: 1, input: { x: 1, z: 0 } });
    for (let tick = 0; tick < 43; tick += 1) expect(zone.tick()).toBe(true);
    const boundary = JSON.parse(socket.send.mock.calls.at(-1)![0]);
    expect(boundary.presences[0].position.x).toBe(14_500);
    expect(zone.tick()).toBe(false);
    const stationary = JSON.parse(socket.send.mock.calls.at(-1)![0]);
    expect(stationary.tick).toBe(boundary.tick + 1);
    expect(stationary.presences).toEqual(boundary.presences);
    const count = socket.send.mock.calls.length;
    zone.tick();
    expect(socket.send).toHaveBeenCalledTimes(count);
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
