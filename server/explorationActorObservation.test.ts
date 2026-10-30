import { describe, expect, it } from "vitest";
import type WebSocket from "ws";
import { AurionTickRecorder } from "./causality/tickRecorder";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import { requireExplorationActorConnection, verifyExplorationActorObservation } from "./explorationActorObservation";

function fixture(maxEntries = 1000) {
  const recorder = new AurionTickRecorder(maxEntries);
  const zone = new AuthoritativeMovementZone("observatory_threshold", recorder);
  const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as unknown as WebSocket;
  const connectionId = zone.join({ userId: 41, socket }).connectionId;
  zone.tick();
  const receipt = zone.getLatestReceipt()!;
  const stored = {
    worldId: receipt.worldId, zoneId: receipt.zoneId, tick: receipt.tick,
    receiptHash: receipt.receiptHash, postStateHash: receipt.postStateHash,
  };
  const anchor = { epochFromTick: 1, epochToTick: 1, epochSourceRevision: receipt.sourceRevision, epochRulesetVersion: receipt.rulesetVersion, epochLastReceiptHash: receipt.receiptHash };
  return { zone, socket, connectionId, stored, recorder, anchor };
}

describe("server-owned exploration actor observation", () => {
  it("binds a connected actor's real zone tick and matching persisted identity to their chunk", () => {
    const f = fixture();
    expect(verifyExplorationActorObservation({
      zone: f.zone, userId: 41, coordinate: { x: 0, z: 0 }, connectionId: f.connectionId,
      ...f.anchor, stored: f.stored,
    })).toEqual({ tick: 1, receiptHash: f.stored.receiptHash });
  });

  it("rejects disconnected users, other chunks and a replaced connection", () => {
    const f = fixture();
    expect(() => requireExplorationActorConnection(f.zone, 42, { x: 0, z: 0 })).toThrow("EXPLORATION_ACTOR_NOT_CONNECTED");
    expect(() => requireExplorationActorConnection(f.zone, 41, { x: 1, z: 0 })).toThrow("EXPLORATION_ACTOR_CHUNK_MISMATCH");
    const next = f.zone.join({ userId: 41, socket: f.socket }).connectionId;
    expect(next).not.toBe(f.connectionId);
    expect(() => verifyExplorationActorObservation({
      zone: f.zone, userId: 41, coordinate: { x: 0, z: 0 }, connectionId: f.connectionId,
      ...f.anchor, stored: f.stored,
    })).toThrow("EXPLORATION_ACTOR_SESSION_CHANGED");
  });

  it("rejects a connected player who joined after the anchored epoch tick", () => {
    const f = fixture();
    const second = f.zone.join({ userId: 42, socket: f.socket }).connectionId;
    expect(() => verifyExplorationActorObservation({
      zone: f.zone, userId: 42, coordinate: { x: 0, z: 0 }, connectionId: second,
      ...f.anchor, stored: f.stored,
    })).toThrow("EXPLORATION_ACTOR_NOT_IN_EPOCH");
  });

  it("does not mistake a restored player or a closed socket for a live connection", () => {
    const f = fixture();
    const restored = new AuthoritativeMovementZone("observatory_threshold", new AurionTickRecorder());
    restored.restoreFromCanonicalState(f.zone.getCanonicalZoneState());
    expect(restored.connectionIdForUser(41)).toBeDefined();
    expect(() => requireExplorationActorConnection(restored, 41, { x: 0, z: 0 })).toThrow("EXPLORATION_ACTOR_NOT_CONNECTED");
    (f.socket as unknown as { readyState: number }).readyState = 3;
    expect(() => requireExplorationActorConnection(f.zone, 41, { x: 0, z: 0 })).toThrow("EXPLORATION_ACTOR_NOT_CONNECTED");
  });

  it("rejects stale epoch ranges, altered durable receipts and evicted actor snapshots", () => {
    const f = fixture(1);
    const request = {
      zone: f.zone, userId: 41, coordinate: { x: 0, z: 0 }, connectionId: f.connectionId,
      ...f.anchor, stored: f.stored,
    };
    expect(() => verifyExplorationActorObservation({ ...request, epochFromTick: 2 })).toThrow("EXPLORATION_EPOCH_TICK_INVALID");
    expect(() => verifyExplorationActorObservation({ ...request, stored: { ...f.stored, postStateHash: `sha256:${"0".repeat(64)}` } })).toThrow("EXPLORATION_ACTOR_RECEIPT_UNPROVABLE");
    expect(() => verifyExplorationActorObservation({ ...request, epochSourceRevision: "f".repeat(40) })).toThrow("EXPLORATION_ACTOR_RECEIPT_UNPROVABLE");
    expect(() => verifyExplorationActorObservation({ ...request, epochLastReceiptHash: `sha256:${"0".repeat(64)}` })).toThrow("EXPLORATION_ACTOR_RECEIPT_UNPROVABLE");
    f.zone.tick();
    expect(() => verifyExplorationActorObservation(request)).toThrow("EXPLORATION_ACTOR_RECEIPT_UNPROVABLE");
  });
});
