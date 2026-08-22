import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { eq } from "drizzle-orm";
import { zoneConnectionTickets } from "../drizzle/schema";
import { getDb } from "./db";
import { registerZoneGateway } from "./zoneGateway";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

type ZoneMessage = { type: string; [key: string]: unknown };

function makeContext(userId: number): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `zone-e2e:${userId}`,
      name: "Zone E2E",
      email: null,
      loginMethod: "test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "http", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function waitForMessage(socket: WebSocket, type: string): Promise<ZoneMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 5_000);
    socket.on("message", raw => {
      const parsed = JSON.parse(raw.toString("utf8")) as ZoneMessage;
      if (parsed.type !== type) return;
      clearTimeout(timeout);
      resolve(parsed);
    });
  });
}

async function startZoneServer(): Promise<{ server: Server; url: string; close: () => Promise<void> }> {
  const server = createServer();
  const gateway = registerZoneGateway(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Zone test server did not bind a TCP port.");
  return {
    server,
    url: `ws://127.0.0.1:${address.port}/v1/ws`,
    close: async () => {
      gateway.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    },
  };
}

function openWithTicket(url: string, ticket: string): Promise<{ socket: WebSocket; welcome: ZoneMessage }> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Origin: "http://127.0.0.1" } });
    const timeout = setTimeout(() => reject(new Error("Timed out while joining the read-only zone.")), 5_000);
    socket.once("error", reject);
    socket.once("open", () => socket.send(JSON.stringify({ type: "hello", ticket, zoneId: "observatory_threshold", protocolVersion: 1 })));
    socket.on("message", raw => {
      const message = JSON.parse(raw.toString("utf8")) as ZoneMessage;
      if (message.type !== "welcome") return;
      clearTimeout(timeout);
      resolve({ socket, welcome: message });
    });
  });
}

describeWithDatabase("zone gateway e2e", () => {
  const userId = 2_146_900_000;
  let clientBuild = "";

  beforeEach(() => {
    clientBuild = `zone-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  });

  it("issues a protected ticket, persists only its digest, admits it once and blocks gameplay input", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;
    const caller = appRouter.createCaller(makeContext(userId));
    const peerUserId = userId + 1;
    const peerCaller = appRouter.createCaller(makeContext(peerUserId));
    const issued = await caller.gameplay.issueZoneTicket({ zoneId: "observatory_threshold", clientBuild });
    const peerIssued = await peerCaller.gameplay.issueZoneTicket({ zoneId: "observatory_threshold", clientBuild });
    const persisted = await db.select().from(zoneConnectionTickets).where(eq(zoneConnectionTickets.clientBuild, clientBuild)).limit(1);
    expect(persisted).toHaveLength(1);
    expect(persisted[0]?.ticketDigest).not.toBe(issued.ticket);
    expect(persisted[0]?.consumedAt).toBeNull();

    const runtime = await startZoneServer();
    let socket: WebSocket | undefined;
    let peerSocket: WebSocket | undefined;
    try {
      const joined = await openWithTicket(runtime.url, issued.ticket);
      socket = joined.socket;
      expect(joined.welcome.zoneId).toBe("observatory_threshold");
      expect(joined.welcome.presences).toEqual([{ entityId: `player:${userId}`, userId }]);

      const presenceAfterPeerJoin = waitForMessage(socket, "snapshot");
      const peerJoined = await openWithTicket(runtime.url, peerIssued.ticket);
      peerSocket = peerJoined.socket;
      const expectedPresences = [
        { entityId: `player:${userId}`, userId },
        { entityId: `player:${peerUserId}`, userId: peerUserId },
      ];
      expect(peerJoined.welcome.presences).toEqual(expectedPresences);
      await expect(presenceAfterPeerJoin).resolves.toMatchObject({ presences: expectedPresences });

      const rejection = waitForMessage(socket, "reject");
      socket.send(JSON.stringify({ type: "input", clientSeq: 1, command: "attack" }));
      await expect(rejection).resolves.toMatchObject({ code: "READ_ONLY_PRESENCE" });

      const reused = new WebSocket(runtime.url, { headers: { Origin: "http://127.0.0.1" } });
      await once(reused, "open");
      reused.send(JSON.stringify({ type: "hello", ticket: issued.ticket, zoneId: "observatory_threshold", protocolVersion: 1 }));
      const [closeCode] = await once(reused, "close") as [number];
      expect(closeCode).toBe(1008);
    } finally {
      socket?.close();
      peerSocket?.close();
      await runtime.close();
      await db.delete(zoneConnectionTickets).where(eq(zoneConnectionTickets.clientBuild, clientBuild));
    }
  }, 20_000);
});
