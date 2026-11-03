import { describe, expect, it, vi } from "vitest";
import WebSocket, { WebSocketServer } from "ws";
import { once } from "node:events";
import { parseZoneOutboundLimit, sendZoneMessage } from "./zoneOutboundPressure";

describe("outbound congestion guard", () => {
  it("defaults off and rejects invalid or unbounded configuration", () => {
    expect(parseZoneOutboundLimit(undefined)).toBeNull();
    expect(parseZoneOutboundLimit("65536")).toBe(65536);
    for (const raw of ["-1", "0", "65535", "67108865", "Infinity", "NaN", "1.5"]) expect(() => parseZoneOutboundLimit(raw)).toThrow("ZONE_OUTBOUND_LIMIT_INVALID");
  });
  it("terminates only a slow socket before exceeding the configured byte budget", () => {
    const slow = { readyState: 1, OPEN: 1, bufferedAmount: 65535, send: vi.fn(), terminate: vi.fn() } as unknown as WebSocket;
    const healthy = { readyState: 1, OPEN: 1, bufferedAmount: 0, send: vi.fn(), terminate: vi.fn() } as unknown as WebSocket;
    expect(sendZoneMessage(slow,"ä",65536)).toBe(false);
    expect(slow.terminate).toHaveBeenCalledOnce(); expect(slow.send).not.toHaveBeenCalled();
    expect(sendZoneMessage(healthy,"ä",65536)).toBe(true); expect(healthy.send).toHaveBeenCalledOnce(); expect(healthy.terminate).not.toHaveBeenCalled();
    expect(sendZoneMessage(slow,"ä",null)).toBe(true);
  });
  it("isolates a congested real WebSocket peer while another continues", async () => {
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await once(server, "listening");
    const address = server.address(); if (!address || typeof address === "string") throw new Error("ADDRESS_REQUIRED");
    const peers: WebSocket[] = []; server.on("connection", socket => peers.push(socket));
    const slow = new WebSocket(`ws://127.0.0.1:${address.port}`);
    const healthy = new WebSocket(`ws://127.0.0.1:${address.port}`);
    try {
      await Promise.all([once(slow,"open"), once(healthy,"open")]);
      expect(peers).toHaveLength(2);
      // Explicitly simulate a slow reader at the server's measured buffer boundary;
      // sockets, delivery and close events remain actual ws connections.
      Object.defineProperty(peers[0], "bufferedAmount", { configurable: true, get: () => 65536 });
      const slowClose = once(slow, "close"); const received = once(healthy, "message");
      expect(sendZoneMessage(peers[0],"event",65536)).toBe(false);
      expect(sendZoneMessage(peers[1],"event",65536)).toBe(true);
      const [data] = await received; expect(data.toString()).toBe("event"); await slowClose;
    } finally {
      slow.terminate(); healthy.terminate();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

});
