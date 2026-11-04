import { createServer } from "node:http";
import WebSocket from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZONE_PROTOCOL_VERSION } from "../shared/zonePresenceContract";
import { registerZoneGateway } from "./zoneGateway";
import { AuthoritativeMovementZone, ZoneRegistry } from "./zoneRuntime";
import { AurionTickRecorder } from "./causality/tickRecorder";

const hello = { type: "hello", ticket: "aurion_zone_012345678901234567890123456789", zoneId: "observatory_threshold", protocolVersion: ZONE_PROTOCOL_VERSION };
const onceOpen = (socket: WebSocket) => new Promise<void>((resolve, reject) => { socket.once("open", () => resolve()); socket.once("error", reject); });
const onceClose = (socket: WebSocket) => new Promise<number>(resolve => socket.once("close", code => resolve(code)));
const onceWelcome = (socket: WebSocket) => new Promise<void>(resolve => {
  const onMessage = (data: WebSocket.RawData) => { if ((JSON.parse(data.toString()) as { type?: string }).type === "welcome") { socket.off("message", onMessage); resolve(); } };
  socket.on("message", onMessage);
});

async function startGateway(options: { ticketGate?: Promise<void>; releaseGate?: Promise<void> } = {}) {
  const server = createServer();
  const registry = new ZoneRegistry();
  const recorder = new AurionTickRecorder();
  const zone = new AuthoritativeMovementZone("observatory_threshold", recorder);
  const released: string[] = [];
  const ticket = vi.fn(async () => {
    await options.ticketGate;
    return { userId: 91, zoneId: "observatory_threshold" as const, clientBuild: "fixture", expiresAt: new Date(Date.now() + 60_000) };
  });
  const presence = {
    upsert: vi.fn(async () => undefined),
    release: vi.fn(async (values: { connectionId: string }) => { await options.releaseGate; released.push(values.connectionId); }),
  };
  const gateway = registerZoneGateway(server, registry, ticket, presence, undefined, async () => zone);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("ADDRESS_REQUIRED");
  const connect = () => new WebSocket(`ws://127.0.0.1:${address.port}/v1/ws`, { origin: "http://localhost" });
  return { server, registry, zone, recorder, gateway, connect, ticket, released };
}

describe("zone gateway shutdown quiescence", () => {
  const servers: { close(): void }[] = [];
  afterEach(() => { for (const server of servers.splice(0)) server.close(); vi.restoreAllMocks(); });

  it("closes a connected client, awaits its presence release and commits its leave in the final tick", async () => {
    let releaseLease!: () => void;
    const releaseGate = new Promise<void>(resolve => { releaseLease = resolve; });
    const runtime = await startGateway({ releaseGate });
    servers.push(runtime.server);
    const socket = runtime.connect();
    await onceOpen(socket);
    const welcomed = onceWelcome(socket);
    socket.send(JSON.stringify(hello));
    await welcomed;
    runtime.registry.tick();
    expect(runtime.zone.getCanonicalZoneState().players.map(player => player.userId)).toEqual([91]);

    const closed = onceClose(socket);
    let shutdownDone = false;
    const shutdown = runtime.gateway.close().then(() => { shutdownDone = true; });
    expect(await closed).toBe(1001);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(shutdownDone).toBe(false); // still awaiting the world-presence release
    releaseLease();
    await shutdown;
    expect(runtime.released).toHaveLength(1);
    expect(runtime.released[0]).toMatch(/^zone_peer_/);
    expect(runtime.zone.getCanonicalZoneState().players).toEqual([]);
    const head = runtime.zone.getLatestReceipt();
    const last = runtime.recorder.getEntry("observatory_threshold", head!.tick);
    expect(last?.intents?.filter(intent => intent.type === "presence_leave").map(intent => intent.userId)).toEqual([91]);
  });

  it("bounds a stalled world-presence release and still commits the final leave tick", async () => {
    // Review case: a lease write stalled by the database must not block the final tick and causal flush.
    const runtime = await startGateway({ releaseGate: new Promise<void>(() => undefined) });
    servers.push(runtime.server);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const socket = runtime.connect();
    await onceOpen(socket);
    const welcomed = onceWelcome(socket);
    socket.send(JSON.stringify(hello));
    await welcomed;
    runtime.registry.tick();
    const started = Date.now();
    await runtime.gateway.close();
    expect(Date.now() - started).toBeLessThan(4_000);
    expect(runtime.released).toEqual([]);
    expect(runtime.zone.getCanonicalZoneState().players).toEqual([]);
    const head = runtime.zone.getLatestReceipt();
    expect(runtime.recorder.getEntry("observatory_threshold", head!.tick)?.intents?.filter(intent => intent.type === "presence_leave").map(intent => intent.userId)).toEqual([91]);
    expect(warn.mock.calls.map(call => String(call[0])).some(line => line.includes("1 world-presence lease release(s) still pending"))).toBe(true);
  }, 10_000);

  it("never joins a handshake that resumes after shutdown started", async () => {
    let releaseTicket!: () => void;
    const ticketGate = new Promise<void>(resolve => { releaseTicket = resolve; });
    const runtime = await startGateway({ ticketGate });
    servers.push(runtime.server);
    const join = vi.spyOn(runtime.zone, "join");
    const socket = runtime.connect();
    await onceOpen(socket);
    socket.send(JSON.stringify(hello));
    await vi.waitFor(() => expect(runtime.ticket).toHaveBeenCalledTimes(1));
    const closed = onceClose(socket);
    const shutdown = runtime.gateway.close();
    releaseTicket();
    await shutdown;
    expect(await closed).toBe(1001);
    expect(join).not.toHaveBeenCalled();
    expect(runtime.zone.getCanonicalZoneState().players).toEqual([]);
  });
});
