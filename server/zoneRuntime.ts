import type WebSocket from "ws";
import { makeZoneConnectionId, type ZoneId, type ZonePresence, type ZoneSnapshot, type ZoneWelcome } from "./zoneProtocol";

type PresencePeer = { connectionId: string; userId: number; socket: WebSocket };

function serialize(payload: ZoneWelcome | ZoneSnapshot) {
  return JSON.stringify(payload);
}

/** Read-only first slice: it exposes confirmed presence only and accepts no gameplay input. */
export class ReadOnlyPresenceZone {
  private readonly peers = new Map<string, PresencePeer>();
  private snapshotSeq = 0;

  constructor(readonly zoneId: ZoneId) {}

  join(values: { userId: number; socket: WebSocket }): ZoneWelcome {
    const connectionId = makeZoneConnectionId();
    this.peers.set(connectionId, { connectionId, userId: values.userId, socket: values.socket });
    const welcome: ZoneWelcome = { type: "welcome", connectionId, zoneId: this.zoneId, snapshotSeq: ++this.snapshotSeq, presences: this.presences() };
    this.broadcastSnapshot();
    return welcome;
  }

  leave(connectionId: string): void {
    if (!this.peers.delete(connectionId)) return;
    this.broadcastSnapshot();
  }

  private presences(): ZonePresence[] {
    return Array.from(this.peers.values()).map(peer => ({ entityId: `player:${peer.userId}`, userId: peer.userId })).sort((left, right) => left.entityId.localeCompare(right.entityId));
  }

  private broadcastSnapshot(): void {
    const snapshot: ZoneSnapshot = { type: "snapshot", zoneId: this.zoneId, snapshotSeq: ++this.snapshotSeq, presences: this.presences() };
    const serialized = serialize(snapshot);
    this.peers.forEach(peer => {
      if (peer.socket.readyState === peer.socket.OPEN) peer.socket.send(serialized);
    });
  }
}

export class ZoneRegistry {
  private readonly zones = new Map<ZoneId, ReadOnlyPresenceZone>();

  get(zoneId: ZoneId): ReadOnlyPresenceZone {
    const existing = this.zones.get(zoneId);
    if (existing) return existing;
    const zone = new ReadOnlyPresenceZone(zoneId);
    this.zones.set(zoneId, zone);
    return zone;
  }
}
