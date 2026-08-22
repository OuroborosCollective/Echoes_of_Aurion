export type ZoneMovementInput = { x: -1 | 0 | 1; z: -1 | 0 | 1 };
export type ZonePresenceSnapshot = {
  type: "snapshot";
  zoneId: "observatory_threshold";
  snapshotSeq: number;
  tick: number;
  presences: Array<{ entityId: string; userId: number; position: { x: number; z: number }; lastAcceptedClientSeq: number }>;
};

type ZoneMessage = ZonePresenceSnapshot | { type: "welcome"; connectionId: string; zoneId: "observatory_threshold"; snapshotSeq: number; tick: number; presences: ZonePresenceSnapshot["presences"] } | { type: "reject"; code: string };

export function zoneWebSocketUrl(origin: string): string {
  const url = new URL("/v1/ws", origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

function parseZoneMessage(raw: string): ZoneMessage | null {
  try {
    const value = JSON.parse(raw) as { type?: unknown };
    return typeof value.type === "string" ? value as ZoneMessage : null;
  } catch {
    return null;
  }
}

/** Browser-side transport only: it never predicts positions or sends player coordinates. */
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
    this.socket = socket;
    socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "hello", ticket, zoneId, protocolVersion: 1 })));
    socket.addEventListener("message", event => {
      const message = parseZoneMessage(String(event.data));
      if (!message) return;
      if (message.type === "welcome") {
        this.options.onStatus("connected");
        this.options.onSnapshot({ type: "snapshot", zoneId: message.zoneId, snapshotSeq: message.snapshotSeq, tick: message.tick, presences: message.presences });
      } else if (message.type === "snapshot") {
        this.options.onSnapshot(message);
      } else if (message.type === "reject") {
        this.options.onReject(message.code);
        if (message.code !== "STALE_CLIENT_SEQUENCE") this.options.onStatus("rejected");
      }
    });
    socket.addEventListener("close", () => {
      if (this.socket === socket) this.socket = null;
      this.options.onStatus("closed");
    });
    socket.addEventListener("error", () => this.options.onStatus("closed"));
  }

  sendMovement(input: ZoneMovementInput): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({ type: "move", clientSeq: this.nextClientSeq++, input }));
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState === WebSocket.OPEN) socket.close(1000, "zone client closed");
  }
}
