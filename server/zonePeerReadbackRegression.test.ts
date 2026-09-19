import { describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import type { ZoneServerMessage, ZoneSnapshot } from "./zoneProtocol";
import { AuthoritativeMovementZone } from "./zoneRuntime";

function recordingSocket() {
  const messages: ZoneServerMessage[] = [];
  const bytes: string[] = [];
  const socket = {
    OPEN: 1, readyState: 1,
    send: (payload: string) => { bytes.push(payload); messages.push(JSON.parse(payload)); },
    close: vi.fn(),
  } as unknown as WebSocket;
  const snapshot = (): ZoneSnapshot => {
    const value = messages.at(-1);
    if (!value || value.type !== "snapshot") throw new Error("EXPECTED_REAL_ZONE_SNAPSHOT");
    return value;
  };
  return { socket, messages, bytes, snapshot };
}

// Transport recording is a unit-test seam; zone state and readbacks use the actual implementation.
describe("immediate zone peer readbacks", () => {
  it("includes a newly authenticated peer in its welcome before the first tick", () => {
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const peer = recordingSocket();
    const welcome = zone.join({ userId: 2, socket: peer.socket });
    expect(welcome.presences.map(value => value.entityId)).toEqual(["player:2"]);
    expect(welcome.combatants.filter(value => value.entityId.startsWith("player:"))).toHaveLength(1);
    expect(peer.snapshot().presences).toEqual(welcome.presences);
  });

  it("keeps join and leave readbacks sorted and current without advancing the tick", () => {
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const a = recordingSocket(), b = recordingSocket();
    const first = zone.join({ userId: 2, socket: a.socket });
    const second = zone.join({ userId: 10, socket: b.socket });
    expect(second.presences.map(value => value.entityId)).toEqual(["player:10", "player:2"]);
    zone.leave(first.connectionId);
    expect(b.snapshot().presences.map(value => value.entityId)).toEqual(["player:10"]);
    expect(zone.combatSnapshot().filter(value => value.entityId.startsWith("player:"))).toHaveLength(1);
    zone.leave(second.connectionId);
    expect(zone.combatSnapshot().filter(value => value.entityId.startsWith("player:"))).toEqual([]);
  });

  it("does not resurrect a retired connection through the cached projection", () => {
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const old = recordingSocket(), next = recordingSocket();
    const first = zone.join({ userId: 2, socket: old.socket });
    zone.submitMovement(first.connectionId, { type: "move", clientSeq: 1, input: { x: 1, z: 0 } });
    zone.tick();
    const welcome = zone.join({ userId: 2, socket: next.socket });
    expect(old.socket.close).toHaveBeenCalledTimes(1);
    expect(welcome.presences).toHaveLength(1);
    expect(welcome.presences[0].position).toEqual(zone.positionForConnection(welcome.connectionId));
    expect(welcome.presences[0].lastAcceptedClientSeq).toBe(0);
    zone.leave(first.connectionId);
    expect(zone.positionForConnection(welcome.connectionId)).toEqual({ x: 0, z: 0 });
  });

  it("sends snapshots only to open peers and uses identical bytes for every recipient", () => {
    const zone = new AuthoritativeMovementZone("observatory_threshold");
    const a = recordingSocket(), b = recordingSocket();
    zone.join({ userId: 1, socket: a.socket });
    zone.join({ userId: 2, socket: b.socket });
    expect(a.bytes.at(-1)).toBe(b.bytes.at(-1));
    const count = a.messages.length;
    Object.assign(a.socket, { readyState: 3 });
    zone.tick();
    expect(a.messages).toHaveLength(count);
  });

  it("replays identical movement and membership inputs to identical projected state", () => {
    const replay = () => {
      const zone = new AuthoritativeMovementZone("observatory_threshold");
      const a = recordingSocket(), b = recordingSocket();
      const first = zone.join({ userId: 2, socket: a.socket });
      zone.join({ userId: 10, socket: b.socket });
      zone.submitMovement(first.connectionId, { type: "move", clientSeq: 1, input: { x: 1, z: 0 } });
      for (let tick = 0; tick < 4; tick += 1) zone.tick();
      const beforeLeave = b.snapshot();
      zone.leave(first.connectionId);
      return { beforeLeave, afterLeave: b.snapshot(), combatants: zone.combatSnapshot(), mobs: zone.mobSnapshot() };
    };
    expect(replay()).toEqual(replay());
  });
});
