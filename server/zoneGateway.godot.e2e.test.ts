import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { eq } from "drizzle-orm";
import { zoneConnectionTickets } from "../drizzle/schema";
import { consumeZoneConnectionTicket, getDb } from "./db";
import { registerZoneGateway } from "./zoneGateway";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { ZONE_PROTOCOL_VERSION } from "../shared/zonePresenceContract";

// A separately gated, real Godot-process ↔ real Aurion-owned gateway test.
// This is *not* a production WSS, native browser login or Tab A9 test.
const suite = process.env.AURION_G13_GODOT_E2E === "1" && !!process.env.DATABASE_URL
  ? describe : describe.skip;
const ZONE = "observatory_threshold" as const;

function testCaller(userId: number) {
  const context: TrpcContext = {
    user: {
      id: userId,
      openId: "g13-test:" + userId,
      name: "G13 isolated test",
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
  return appRouter.createCaller(context);
}

function openRealPeer(url: string, ticket: string): Promise<WebSocket> {
  return new Promise((resolvePeer, rejectPeer) => {
    const socket = new WebSocket(url, { headers: { Origin: "http://127.0.0.1" } });
    const timeout = setTimeout(() => {
      socket.terminate();
      rejectPeer(new Error("G13_SECOND_PEER_WELCOME_TIMEOUT"));
    }, 8_000);
    const error = (reason: Error) => { clearTimeout(timeout); rejectPeer(reason); };
    socket.once("error", error);
    socket.once("open", () => socket.send(JSON.stringify({
      type: "hello", ticket, zoneId: ZONE, protocolVersion: ZONE_PROTOCOL_VERSION,
    })));
    socket.on("message", raw => {
      const value = JSON.parse(raw.toString("utf8")) as { type?: string };
      if (value.type !== "welcome") return;
      clearTimeout(timeout);
      socket.off("error", error);
      resolvePeer(socket);
    });
  });
}

function awaitAuthoritativeMovement(socket: WebSocket, entityId: string) {
  return new Promise<{ snapshotSeq: number; tick: number }>((resolveMovement, rejectMovement) => {
    const timeout = setTimeout(() => {
      cleanup();
      rejectMovement(new Error("G13_AUTHORITATIVE_MOVE_TIMEOUT"));
    }, 13_000);
    const onMessage = (raw: WebSocket.RawData) => {
      const value = JSON.parse(raw.toString("utf8")) as {
        type?: string; snapshotSeq?: number; tick?: number;
        presences?: { entityId: string; position: { x: number }; lastAcceptedClientSeq: number }[];
      };
      if (value.type !== "snapshot") return;
      const moved = value.presences?.find(p => p.entityId === entityId);
      if (!moved || moved.lastAcceptedClientSeq !== 1 || moved.position.x <= 0) return;
      cleanup();
      resolveMovement({ snapshotSeq: value.snapshotSeq!, tick: value.tick! });
    };
    const onClose = () => {
      cleanup();
      rejectMovement(new Error("G13_SECOND_PEER_CLOSED_BEFORE_MOVE"));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("message", onMessage);
      socket.off("close", onClose);
    };
    socket.on("message", onMessage);
    socket.once("close", onClose);
  });
}

async function runActualGodot(url: string, ticket: string, entityId: string): Promise<void> {
  const project = resolve(process.cwd(), "godot-client");
  const script = resolve(project, "tests/integration/test_zone_gateway_real.gd");
  // RED precondition: the integration script must exist and use an actual Godot process.
  expect(existsSync(script), "G13_REAL_GODOT_SCRIPT_MISSING").toBe(true);
  const lock = JSON.parse(readFileSync(resolve(process.cwd(), "config/godot-toolchain.lock.json"), "utf8")) as {
    engine: { file: string };
  };
  const executable = resolve(process.cwd(), ".aurion-godot/editor", lock.engine.file);
  expect(existsSync(executable), "G13_PINNED_GODOT_EDITOR_MISSING").toBe(true);
  const output = await new Promise<{ code: number | null; text: string }>((resolveRun, rejectRun) => {
    const child = spawn(executable, [
      "--headless", "--path", project, "--script", "tests/integration/test_zone_gateway_real.gd",
    ], {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        LANG: "C.UTF-8",
        // Test-only ticket is never passed via argv, persisted or emitted in logs.
        AURION_G13_TEST_WS_URL: url,
        AURION_G13_TEST_TICKET: ticket,
        AURION_G13_TEST_ENTITY_ID: entityId,
      },
    });
    let text = "";
    let timedOut = false;
    const deadline = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, 16_000);
    child.stdout.on("data", chunk => { text += chunk.toString("utf8").slice(0, 32_768); });
    child.stderr.on("data", chunk => { text += chunk.toString("utf8").slice(0, 32_768); });
    child.once("error", error => { clearTimeout(deadline); rejectRun(error); });
    child.once("close", code => {
      clearTimeout(deadline);
      if (timedOut) rejectRun(new Error("G13_GODOT_PROCESS_TIMEOUT"));
      else resolveRun({ code, text });
    });
  });
  const sanitized = output.text.replaceAll(ticket, "[redacted-zone-ticket]");
  expect(sanitized).not.toContain("aurion_zone_");
  expect(output.code, "G13_GODOT_PROCESS_FAILED: " + sanitized.slice(-4_000)).toBe(0);
  expect(sanitized).toContain("G13_REAL_AURION_GATEWAY_GODOT_PASS");
  expect(sanitized).not.toMatch(/SCRIPT ERROR:|\bERROR:/);
}

suite("G13 Godot 4 process ↔ real Aurion gateway + isolated MariaDB", () => {
  it("uses a one-time protected ticket, validates the real v5 welcome, and sees confirmed two-client movement", async () => {
    // Fail closed if the configured DB is not an isolated local CI database.
    const databaseUrl = new URL(process.env.DATABASE_URL!);
    expect(databaseUrl.protocol).toBe("mysql:");
    expect(databaseUrl.hostname).toBe("127.0.0.1");
    expect(databaseUrl.port).toBe("3306");
    expect(databaseUrl.pathname).toMatch(/_test$/);
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) throw Error("G13_ISOLATED_DATABASE_UNAVAILABLE");

    const clientBuild = "g13-godot-" + randomBytes(10).toString("hex");
    const godotUser = 2_146_900_080;
    const observerUser = godotUser + 1;
    const issued = await testCaller(godotUser).gameplay.issueZoneTicket({ zoneId: ZONE, clientBuild });
    const observer = await testCaller(observerUser).gameplay.issueZoneTicket({ zoneId: ZONE, clientBuild });
    const server = createServer();
    const gateway = registerZoneGateway(server, undefined, consumeZoneConnectionTicket);
    let observerSocket: WebSocket | undefined;
    try {
      await new Promise<void>((ok, fail) => {
        server.once("error", fail);
        server.listen(0, "127.0.0.1", ok);
      });
      const address = server.address();
      if (!address || typeof address === "string") throw Error("G13_GATEWAY_LISTEN_FAILED");
      const url = "ws://127.0.0.1:" + address.port + "/v1/ws";
      observerSocket = await openRealPeer(url, observer.ticket);
      const movement = awaitAuthoritativeMovement(observerSocket, "player:" + godotUser);
      await runActualGodot(url, issued.ticket, "player:" + godotUser);
      const receipt = await movement;
      expect(receipt.snapshotSeq).toBeGreaterThan(0);
      expect(receipt.tick).toBeGreaterThanOrEqual(0);
      const stored = await db.select().from(zoneConnectionTickets)
        .where(eq(zoneConnectionTickets.clientBuild, clientBuild));
      expect(stored).toHaveLength(2);
      for (const row of stored) {
        expect(row.consumedAt).not.toBeNull();
        expect(row.ticketDigest).not.toBe(issued.ticket);
        expect(row.ticketDigest).not.toBe(observer.ticket);
      }
      console.log("G13 real Godot↔Aurion gateway+MariaDB: PASS, revision=" +
        (process.env.AURION_RELEASE_SHA ?? "unbound") +
        ", snapshotSeq=" + receipt.snapshotSeq + ", tick=" + receipt.tick);
    } finally {
      observerSocket?.terminate();
      gateway.close();
      await new Promise<void>(ok => server.close(() => ok()));
      await db.delete(zoneConnectionTickets).where(eq(zoneConnectionTickets.clientBuild, clientBuild));
    }
  }, 35_000);
});
