import { describe, expect, it } from "vitest";
import {
  AURION_WORLD_EPOCH_RULESET_VERSION,
  WORLD_PRESENCE_LEASE_MS,
  canonicalWorldEpochRequestKey,
  createWorldPresenceLease,
  nextWorldEpoch,
  worldChunkForZone,
} from "./worldPresenceProtocol";

describe("worldPresenceProtocol", () => {
  it("maps server-authorized zones to stable global chunk anchors and bounded leases", () => {
    const now = new Date("2026-08-27T12:00:00.000Z");
    expect(worldChunkForZone("observatory_threshold")).toEqual({ x: 0, z: 0 });
    expect(createWorldPresenceLease({ userId: 41, connectionId: "zone_peer_0123456789", zoneId: "observatory_threshold", position: { x: 340, z: -680 }, now })).toEqual({
      userId: 41,
      connectionId: "zone_peer_0123456789",
      zoneId: "observatory_threshold",
      chunk: { x: 0, z: 0 },
      position: { x: 340, z: -680 },
      expiresAt: new Date(now.getTime() + WORLD_PRESENCE_LEASE_MS),
    });
  });

  it("keeps epoch progression monotonic and keyed requests replay-safe", () => {
    expect(AURION_WORLD_EPOCH_RULESET_VERSION).toBe("aurion-world-epoch.v1");
    expect(nextWorldEpoch(0)).toBe(1);
    expect(nextWorldEpoch(48)).toBe(49);
    expect(canonicalWorldEpochRequestKey("epoch-run:2026-08-27:0001")).toBe("epoch-run:2026-08-27:0001");
    expect(() => nextWorldEpoch(-1)).toThrow("non-negative");
    expect(() => canonicalWorldEpochRequestKey("short")).toThrow("idempotency");
  });

  it("rejects client-like invalid presence identity material", () => {
    expect(() => createWorldPresenceLease({ userId: 0, connectionId: "zone_peer_0123456789", zoneId: "observatory_threshold", position: { x: 0, z: 0 }, now: new Date() })).toThrow("userId");
    expect(() => createWorldPresenceLease({ userId: 1, connectionId: "short", zoneId: "observatory_threshold", position: { x: 0, z: 0 }, now: new Date() })).toThrow("connectionId");
    expect(() => createWorldPresenceLease({ userId: 1, connectionId: "zone_peer_0123456789", zoneId: "observatory_threshold", position: { x: 14_501, z: 0 }, now: new Date() })).toThrow("position");
  });
});
