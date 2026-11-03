import express from "express";
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import WebSocket from "ws";
import { describe, expect, it, vi } from "vitest";
import { DefensiveGatewayObserver, type GatewayObservation } from "./defensiveGatewayObserver";
import { registerZoneGateway } from "./zoneGateway";
import { ZoneRegistry, AuthoritativeMovementZone } from "./zoneRuntime";
import { AurionTickRecorder } from "./causality/tickRecorder";
import { ZONE_PROTOCOL_VERSION } from "../shared/zonePresenceContract";

async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("ADDRESS_REQUIRED");
  return addr.port;
}

describe("observe-only gateway telemetry", () => {
  it("counts sensitive route families over HTTP without recording credentials, identifiers or query strings", async () => {
    const events: GatewayObservation[] = [];
    const observer = new DefensiveGatewayObserver(true, e => events.push(e));
    const app = express(); app.use(observer.httpMiddleware); app.use((_req, res) => res.status(204).end());
    const server = createServer(app); const port = await listen(server);
    try {
      for (const path of ["/api/native-auth/start?secret=private-value", "/api/oauth/start", "/api/trpc/auth.loginLocal", "/api/admin/test", "/healthz", "/api/administer"]) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers: { authorization: "Bearer private-token", cookie: "session=private-cookie", "x-forwarded-for": "198.51.100.17" } });
        expect(response.status).toBe(204);
      }
      observer.flush();
      expect(events[0].http).toEqual({ nativeAuth: 1, browserAuth: 2, admin: 1 });
      expect(JSON.stringify(events)).not.toMatch(/private|198\.51|start\?|cookie|Bearer/);
      observer.flush(); expect(events[1].http).toEqual({ nativeAuth: 0, browserAuth: 0, admin: 0 });
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });

  it("keeps delayed authentication pending and releases once on close or welcome", async () => {
    const events: GatewayObservation[] = [];
    const observer = new DefensiveGatewayObserver(true, e => events.push(e));
    const server = createServer(); const registry = new ZoneRegistry();
    let releaseTicket!: () => void;
    const delayed = new Promise<void>(resolve => { releaseTicket = resolve; });
    let calls = 0;
    const gateway = registerZoneGateway(server, registry, async () => {
      calls++; if (calls === 1) await delayed;
      return { userId: 73, zoneId: "observatory_threshold", clientBuild: "test", expiresAt: new Date(Date.now() + 60_000) };
    }, undefined, undefined, async id => new AuthoritativeMovementZone(id, new AurionTickRecorder()), observer);
    const port = await listen(server);
    const first = new WebSocket(`ws://127.0.0.1:${port}/v1/ws`, { origin: "http://localhost" });
    const second = new WebSocket(`ws://127.0.0.1:${port}/v1/ws`, { origin: "http://localhost" });
    try {
      await Promise.all([once(first, "open"), once(second, "open")]);
      const hello = JSON.stringify({ type: "hello", ticket: "aurion_zone_private_ticket_123456789", zoneId: "observatory_threshold", protocolVersion: ZONE_PROTOCOL_VERSION });
      first.send(hello);
      await vi.waitFor(() => expect(calls).toBe(1));
      observer.flush(); expect(events.at(-1)?.handshakes).toMatchObject({ opened: 2, pending: 2, peakPending: 2 });
      const welcome = new Promise<void>((resolve, reject) => {
        second.on("message", data => { if (JSON.parse(data.toString()).type === "welcome") resolve(); });
        second.once("error", reject);
      });
      second.send(hello); await welcome;
      observer.flush(); expect(events.at(-1)?.handshakes).toMatchObject({ completed: 1, pending: 1 });
      const closed = once(first, "close"); first.close(); await closed;
      await vi.waitFor(() => { observer.flush(); expect(events.at(-1)?.handshakes.pending).toBe(0); });
      releaseTicket();
      await new Promise(resolve => setImmediate(resolve));
      observer.flush(); expect(events.at(-1)?.handshakes).toMatchObject({ pending: 0, completed: 0, closed: 0 });
      expect(JSON.stringify(events)).not.toContain("private_ticket");
    } finally {
      releaseTicket(); first.terminate(); second.terminate(); gateway.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });

  it("is off by default when constructed disabled and tolerates sink failures", () => {
    const sink = vi.fn((_event: GatewayObservation) => { throw new Error("unavailable"); });
    const off = new DefensiveGatewayObserver(false, sink); off.start(); off.beginHandshake()("completed"); off.flush(); off.stop(); expect(sink).not.toHaveBeenCalled();
    const on = new DefensiveGatewayObserver(true, sink); on.start(); on.start(); const end = on.beginHandshake(); end("closed"); end("completed");
    expect(() => on.flush()).not.toThrow(); on.stop(); expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0][0].handshakes).toMatchObject({ opened: 1, closed: 1, completed: 0, pending: 0 });
  });
});
