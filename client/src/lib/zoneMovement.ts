import { validConfirmedPresences, ZONE_SNAPSHOT_MAX_CHARACTERS, ZONE_PROTOCOL_VERSION } from "@shared/zonePresenceContract";
import { validConfirmedZoneMobs, type ConfirmedZoneMob } from "@shared/zoneMobContract";

export type ZoneMovementInput = { x: -1 | 0 | 1; z: -1 | 0 | 1 };
export type ZonePresenceSnapshot = {
  type: "snapshot";
  zoneId: "observatory_threshold";
  snapshotSeq: number;
  tick: number;
  presences: Array<{ entityId: string; userId: number; position: { x: number; z: number }; lastAcceptedClientSeq: number }>;
  mobs: readonly ConfirmedZoneMob[];
};

type ZoneMessage = ZonePresenceSnapshot | { type: "welcome"; connectionId: string; zoneId: "observatory_threshold"; snapshotSeq: number; tick: number; presences: ZonePresenceSnapshot["presences"]; mobs: readonly ConfirmedZoneMob[]; protocolVersion: typeof ZONE_PROTOCOL_VERSION } | { type: "reject"; code: string };

export function zoneWebSocketUrl(origin: string): string {
  const url = new URL("/v1/ws", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function parseZoneMessage(raw: string): ZoneMessage | null {
  if (raw.length > ZONE_SNAPSHOT_MAX_CHARACTERS) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const message = value as Record<string, unknown>;
    if (message.type === "reject") return typeof message.code === "string" ? message as ZoneMessage : null;
    if (message.type !== "welcome" && message.type !== "snapshot") return null;
    if (message.type === "welcome" && message.protocolVersion !== ZONE_PROTOCOL_VERSION) return { type: "reject", code: "PROTOCOL_VERSION_UNSUPPORTED" };
    const integer = (n: unknown) => typeof n === "number" && Number.isSafeInteger(n);
    if (message.zoneId !== "observatory_threshold" || !integer(message.snapshotSeq) || (message.snapshotSeq as number) < 0 || !integer(message.tick) || (message.tick as number) < 0) return null;
    if (message.type === "welcome" && (typeof message.connectionId !== "string" || !/^[A-Za-z0-9_-]{12,96}$/.test(message.connectionId))) return null;
    if (!validConfirmedPresences(message.presences) || !validConfirmedZoneMobs(message.mobs)) return null;
    return message as ZoneMessage;
  } catch {
    return null;
  }
}

/** Browser-side transport only: it never predicts player or mob positions and sends no coordinates. */
export class ZoneMovementClient {
  private socket: WebSocket | null = null;
  private nextClientSeq = 1;

  constructor(private readonly options: {
    onStatus: (status: "connecting" | "connected" | "closed" | "rejected") => void;
    onSnapshot: (snapshot: ZonePresenceSnapshot) => void;
    onReject: (code: string) => void;
  }) {}

  connect(ticket: string, zoneId: "observatory_threshold" = "observatory_threshold"): void {
    this.close();
    this.nextClientSeq = 1;
    this.options.onStatus("connecting");
    const socket = new WebSocket(zoneWebSocketUrl(window.location.origin));
    let welcomed = false;
    let rejected = false;
    let lastSnapshot = -1;
    let lastTick = -1;
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket) { socket.close(1000, "retired zone client"); return; }
      socket.send(JSON.stringify({ type: "hello", ticket, zoneId, protocolVersion: ZONE_PROTOCOL_VERSION }));
    });
    socket.addEventListener("message", event => {
      if (this.socket !== socket) return;
      const message = parseZoneMessage(String(event.data));
      if (!message) return;
      if (message.type === "welcome") {
        if (welcomed) return;
        welcomed = true;
        lastSnapshot = message.snapshotSeq;
        lastTick = message.tick;
        this.options.onStatus("connected");
        this.options.onSnapshot({ type: "snapshot", zoneId: message.zoneId, snapshotSeq: message.snapshotSeq, tick: message.tick, presences: message.presences, mobs: message.mobs });
      } else if (message.type === "snapshot") {
        if (!welcomed || message.snapshotSeq <= lastSnapshot || message.tick < lastTick) return;
        lastSnapshot = message.snapshotSeq;
        lastTick = message.tick;
        this.options.onSnapshot(message);
      } else if (message.type === "reject") {
        this.options.onReject(message.code);
        if (message.code !== "STALE_CLIENT_SEQUENCE") {
          rejected = true;
          this.options.onStatus("rejected");
          socket.close(1008, "zone command rejected");
        }
      }
    });
    socket.addEventListener("close", event => {
      if (this.socket !== socket) return;
      this.socket = null;
      if (!rejected) this.options.onStatus(!welcomed && event.code === 1008 ? "rejected" : "closed");
    });
    socket.addEventListener("error", () => { if (this.socket === socket) this.options.onStatus("closed"); });
  }

  sendMovement(input: ZoneMovementInput): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: "move", clientSeq: this.nextClientSeq++, input }));
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket && (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN)) socket.close(1000, "zone client closed");
  }
}
