import { createServer } from "node:http";
import { ZONE_PROTOCOL_VERSION } from "../shared/zonePresenceContract";
import WebSocket from "ws";
import { describe, expect, it, vi } from "vitest";
import { registerZoneGateway } from "./zoneGateway";
import { ZoneRegistry } from "./zoneRuntime";

function onceOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", () => resolve());
    socket.once("error", reject);
  });
}

function onceMessageOfType(socket: WebSocket, type: string): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      if (message.type !== type) return;
      socket.off("message", onMessage);
      socket.off("error", onError);
      resolve(message);
    };
    const onError = (error: Error) => {
      socket.off("message", onMessage);
      reject(error);
    };
    socket.on("message", onMessage);
    socket.once("error", onError);
  });
}

function onceClose(socket: WebSocket): Promise<void> {
  return new Promise(resolve => socket.once("close", () => resolve()));
}

describe("zoneGateway world presence bridge", () => {
  it("creates and releases a server-observed world presence only around an accepted current-protocol zone connection", async () => {
    const server = createServer();
    const upsert = vi.fn(async () => undefined);
    const release = vi.fn(async () => undefined);
    const registry = new ZoneRegistry();
    const consumeTicket = vi.fn(async () => ({
      userId: 73,
      zoneId: "observatory_threshold" as const,
      clientBuild: "aurion-presence-test-v1",
      expiresAt: new Date(Date.now() + 60_000),
    }));
    const gateway = registerZoneGateway(server, registry, consumeTicket, { upsert, release });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");
    const endpoint = `ws://127.0.0.1:${address.port}/v1/ws`;
    const legacy = new WebSocket(endpoint, { origin: "http://localhost" });
    await onceOpen(legacy);
    const legacyReject = onceMessageOfType(legacy, "reject"), legacyClosed = onceClose(legacy);
    legacy.send(JSON.stringify({ type: "hello", ticket: "aurion_zone_012345678901234567890123456789", zoneId: "observatory_threshold", protocolVersion: ZONE_PROTOCOL_VERSION - 1 }));
    expect(await legacyReject).toMatchObject({code:"PROTOCOL_VERSION_UNSUPPORTED"});
    await legacyClosed;expect(consumeTicket).not.toHaveBeenCalled();
    const socket = new WebSocket(endpoint, { origin: "http://localhost" });
    try {
      await onceOpen(socket);
      const welcomePromise = onceMessageOfType(socket, "welcome");
      socket.send(JSON.stringify({ type: "hello", ticket: "aurion_zone_012345678901234567890123456789", zoneId: "observatory_threshold", protocolVersion: ZONE_PROTOCOL_VERSION }));
      const welcome = await welcomePromise;
      expect(welcome.type).toBe("welcome");
      expect(welcome.protocolVersion).toBe(ZONE_PROTOCOL_VERSION);
      expect(welcome.selfEntityId).toBe("player:73");
      expect(Array.isArray(welcome.mobs)).toBe(true);
      expect(Array.isArray(welcome.combatants)).toBe(true);
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(upsert.mock.calls[0]?.[0]).toMatchObject({ userId: 73, zoneId: "observatory_threshold", position: { x: 0, z: 0 }, connectionId: expect.stringMatching(/^zone_peer_/) });
      const zone = registry.get("observatory_threshold");
      zone.submitMovement(String(welcome.connectionId), {type:"move",clientSeq:1,input:{x:0,z:-1}});
      for(let i=0;i<95;i++) zone.tick();
      zone.submitMovement(String(welcome.connectionId), {type:"move",clientSeq:2,input:{x:0,z:0}});
      await vi.waitFor(()=>expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({position:{x:0,z:-32300}})),{timeout:1000});
      const closePromise = onceClose(socket);
      socket.close();
      await closePromise;
      await vi.waitFor(() => expect(release).toHaveBeenCalledTimes(1));
      expect(release.mock.calls[0]?.[0]).toEqual({ connectionId: welcome.connectionId });
    } finally {
      if (socket.readyState === socket.OPEN || socket.readyState === socket.CONNECTING) socket.close();
      gateway.close();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
