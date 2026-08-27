import type WebSocket from "ws";
import {
  makeZoneConnectionId,
  ZONE_FIXED_POINT_SCALE,
  type ZoneId,
  type ZoneMove,
  type ZonePosition,
  type ZonePresence,
  type ZoneSnapshot,
  type ZoneWelcome,
} from "./zoneProtocol";

const ZONE_BOUNDARY_FIXED = 14_500;
const CARDINAL_STEP_FIXED = 340;
const DIAGONAL_STEP_FIXED = 240;

type PresencePeer = {
  connectionId: string;
  userId: number;
  socket: WebSocket;
  input: ZoneMove["input"];
  lastAcceptedClientSeq: number;
  position: ZonePosition;
};

function serialize(payload: ZoneWelcome | ZoneSnapshot) {
  return JSON.stringify(payload);
}

function compareBinary(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function clampFixed(value: number): number {
  return Math.max(-ZONE_BOUNDARY_FIXED, Math.min(ZONE_BOUNDARY_FIXED, value));
}

/** Pure Level-A movement step: positions are millimetre-like fixed-point integers, never client coordinates. */
export function integrateZoneMovement(position: ZonePosition, input: ZoneMove["input"]): ZonePosition {
  const diagonal = input.x !== 0 && input.z !== 0;
  const step = diagonal ? DIAGONAL_STEP_FIXED : CARDINAL_STEP_FIXED;
  return {
    x: clampFixed(position.x + input.x * step),
    z: clampFixed(position.z + input.z * step),
  };
}

/** First writable slice: clients submit only ordered movement intents; this zone owns all resulting positions. */
export class AuthoritativeMovementZone {
  private readonly peers = new Map<string, PresencePeer>();
  private snapshotSeq = 0;
  private tickNumber = 0;

  constructor(readonly zoneId: ZoneId) {}

  join(values: { userId: number; socket: WebSocket }): ZoneWelcome {
    const connectionId = makeZoneConnectionId();
    this.peers.set(connectionId, {
      connectionId,
      userId: values.userId,
      socket: values.socket,
      input: { x: 0, z: 0 },
      lastAcceptedClientSeq: 0,
      position: { x: 0, z: 0 },
    });
    const welcome: ZoneWelcome = { type: "welcome", connectionId, zoneId: this.zoneId, snapshotSeq: ++this.snapshotSeq, tick: this.tickNumber, presences: this.presences() };
    this.broadcastSnapshot();
    return welcome;
  }

  leave(connectionId: string): void {
    if (!this.peers.delete(connectionId)) return;
    this.broadcastSnapshot();
  }

  positionForConnection(connectionId: string): ZonePosition | undefined {
    const position = this.peers.get(connectionId)?.position;
    return position ? { ...position } : undefined;
  }

  submitMovement(connectionId: string, move: ZoneMove): "accepted" | "stale" | "missing" {
    const peer = this.peers.get(connectionId);
    if (!peer) return "missing";
    if (move.clientSeq <= peer.lastAcceptedClientSeq) return "stale";
    peer.lastAcceptedClientSeq = move.clientSeq;
    peer.input = move.input;
    return "accepted";
  }

  tick(): boolean {
    this.tickNumber += 1;
    let changed = false;
    Array.from(this.peers.values()).sort((left, right) => compareBinary(left.connectionId, right.connectionId)).forEach(peer => {
      if (peer.input.x === 0 && peer.input.z === 0) return;
      const next = integrateZoneMovement(peer.position, peer.input);
      if (next.x === peer.position.x && next.z === peer.position.z) return;
      peer.position = next;
      changed = true;
    });
    if (changed) this.broadcastSnapshot();
    return changed;
  }

  private presences(): ZonePresence[] {
    return Array.from(this.peers.values())
      .map(peer => ({ entityId: `player:${peer.userId}`, userId: peer.userId, position: peer.position, lastAcceptedClientSeq: peer.lastAcceptedClientSeq }))
      .sort((left, right) => compareBinary(left.entityId, right.entityId));
  }

  private broadcastSnapshot(): void {
    const snapshot: ZoneSnapshot = { type: "snapshot", zoneId: this.zoneId, snapshotSeq: ++this.snapshotSeq, tick: this.tickNumber, presences: this.presences() };
    const serialized = serialize(snapshot);
    this.peers.forEach(peer => {
      if (peer.socket.readyState === peer.socket.OPEN) peer.socket.send(serialized);
    });
  }
}

export class ZoneRegistry {
  private readonly zones = new Map<ZoneId, AuthoritativeMovementZone>();

  get(zoneId: ZoneId): AuthoritativeMovementZone {
    const existing = this.zones.get(zoneId);
    if (existing) return existing;
    const zone = new AuthoritativeMovementZone(zoneId);
    this.zones.set(zoneId, zone);
    return zone;
  }

  tick(): void {
    Array.from(this.zones.entries()).sort(([left], [right]) => compareBinary(left, right)).forEach(([, zone]) => zone.tick());
  }
}
