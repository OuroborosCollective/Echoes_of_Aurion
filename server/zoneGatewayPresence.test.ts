import { createServer } from "node:http";
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
  it("creates and releases a server-observed world presence only around an accepted zone connection", async () => {
    const server = createServer();
    const upsert = vi.fn(async () => undefined);
    const release = vi.fn(async () => undefined);
    const gateway = registerZoneGateway(server, new ZoneRegistry(), async () => ({
      userId: 73,
      zoneId: "observatory_threshold",
      clientBuild: "aurion-presence-test-v1",
      expiresAt: new Date(Date.now() + 60_000),
    }), { upsert, release });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address");
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/v1/ws`, { origin: "http://localhost" });
    try {
      await onceOpen(socket);
      const welcomePromise = onceMessageOfType(socket, "welcome");
      socket.send(JSON.stringify({ type: "hello", ticket: "aurion_zone_012345678901234567890123456789", zoneId: "observatory_threshold", protocolVersion: 1 }));
      const welcome = await welcomePromise;
      expect(welcome.type).toBe("welcome");
      expect(upsert).toHaveBeenCalledTimes(1);
      expect(upsert.mock.calls[0]?.[0]).toMatchObject({ userId: 73, zoneId: "observatory_threshold", position: { x: 0, z: 0 }, connectionId: expect.stringMatching(/^zone_peer_/) });
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
