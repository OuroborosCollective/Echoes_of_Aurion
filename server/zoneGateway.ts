import type { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { isAllowedZoneOrigin, parseZoneHello, type ZoneReject } from "./zoneProtocol";
import { ZoneRegistry } from "./zoneRuntime";

const HELLO_TIMEOUT_MS = 5_000;
const MAX_MESSAGE_BYTES = 2_048;

export type ZoneTicketReceipt = {
  userId: number;
  zoneId: "observatory_threshold";
  clientBuild: string;
  expiresAt: Date;
};

export type ZoneTicketConsumer = (values: { ticket: string; zoneId: "observatory_threshold" }) => Promise<ZoneTicketReceipt | undefined>;

function closePolicyViolation(socket: WebSocket): void {
  socket.close(1008, "zone authorization rejected");
}

function parseMessage(data: WebSocket.RawData): unknown {
  if (typeof data === "string") return JSON.parse(data);
  if (Array.isArray(data)) return JSON.parse(Buffer.concat(data).toString("utf8"));
  if (data instanceof ArrayBuffer) return JSON.parse(Buffer.from(new Uint8Array(data)).toString("utf8"));
  return JSON.parse(data.toString("utf8"));
}

function rejectReadOnlyInput(socket: WebSocket): void {
  const payload: ZoneReject = { type: "reject", code: "READ_ONLY_PRESENCE" };
  socket.send(JSON.stringify(payload));
}

/** Adds `/v1/ws` to the existing HTTP server without altering tRPC or MCP routes. */
export function registerZoneGateway(server: HttpServer, registry: ZoneRegistry = new ZoneRegistry(), consumeTicket: ZoneTicketConsumer) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/v1/ws") return;
    if (!isAllowedZoneOrigin(request.headers.origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, webSocket => wss.emit("connection", webSocket, request));
  });

  wss.on("connection", (socket: WebSocket, _request: IncomingMessage) => {
    const helloTimeout = setTimeout(() => closePolicyViolation(socket), HELLO_TIMEOUT_MS);
    socket.once("message", async (data, isBinary) => {
      clearTimeout(helloTimeout);
      if (isBinary) return closePolicyViolation(socket);
      let raw: unknown;
      try {
        raw = parseMessage(data);
      } catch {
        return closePolicyViolation(socket);
      }
      const hello = parseZoneHello(raw);
      if (!hello) return closePolicyViolation(socket);
      try {
        const ticket = await consumeTicket({ ticket: hello.ticket, zoneId: hello.zoneId });
        if (!ticket) return closePolicyViolation(socket);
        const zone = registry.get(ticket.zoneId);
        const welcome = zone.join({ userId: ticket.userId, socket });
        socket.send(JSON.stringify(welcome));
        socket.on("message", () => rejectReadOnlyInput(socket));
        socket.once("close", () => zone.leave(welcome.connectionId));
      } catch (error) {
        console.error("[Aurion Zone] Ticket handshake failed", error);
        closePolicyViolation(socket);
      }
    });
  });

  return { registry, close: () => wss.close() };
}
