import { createServer } from "node:http";
import WebSocket from "ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ZONE_PROTOCOL_VERSION } from "../shared/zonePresenceContract";
import { registerZoneGateway } from "./zoneGateway";
import { AuthoritativeMovementZone, ZoneRegistry } from "./zoneRuntime";
import { AurionTickRecorder } from "./causality/tickRecorder";
import { replayZoneTick } from "./causality/replayZoneTick";
import { observatoryMobDefinitions } from "./ax1MobContent";
import { ZoneJoinHealthMonitor, zoneFailureCode } from "./zoneJoinHealth";
import { withShutdownDeadline } from "./_core/gracefulCausalShutdown";
import { readFileSync } from "node:fs";

// Production 2026-11-04 follow-ups: the zone lock was invisible, server-side failures
// were reported as authorization rejections, the next process could not settle the
// head before the release probe, and a slow drain could be killed without a receipt.
const hello = { type: "hello", ticket: "aurion_zone_012345678901234567890123456789", zoneId: "observatory_threshold", protocolVersion: ZONE_PROTOCOL_VERSION };
const onceOpen = (socket: WebSocket) => new Promise<void>((resolve, reject) => { socket.once("open", () => resolve()); socket.once("error", reject); });
const onceClose = (socket: WebSocket) => new Promise<number>(resolve => socket.once("close", code => resolve(code)));
const onceWelcome = (socket: WebSocket) => new Promise<void>(resolve => {
  const onMessage = (data: WebSocket.RawData) => { if ((JSON.parse(data.toString()) as { type?: string }).type === "welcome") { socket.off("message", onMessage); resolve(); } };
  socket.on("message", onMessage);
});
const quiet = () => new ZoneJoinHealthMonitor(() => undefined, () => undefined);

async function startGateway(options: {
  recover: (zoneId: "observatory_threshold") => Promise<AuthoritativeMovementZone>;
  registry?: ZoneRegistry;
  health?: ZoneJoinHealthMonitor;
  ticket?: () => Promise<unknown>;
  releaseOrphaned?: (values: { lastSeenBefore: Date }) => Promise<number>;
  admissionSettlementWaitMs?: number;
}) {
  const server = createServer();
  const registry = options.registry ?? new ZoneRegistry();
  const health = options.health ?? quiet();
  const ticket = vi.fn(options.ticket ?? (async () => ({ userId: 91, zoneId: "observatory_threshold" as const, clientBuild: "fixture", expiresAt: new Date(Date.now() + 60_000) })));
  const presence = { upsert: vi.fn(async () => undefined), release: vi.fn(async () => undefined), ...(options.releaseOrphaned ? { releaseOrphaned: options.releaseOrphaned } : {}) };
  const gateway = registerZoneGateway(server, registry, ticket as never, presence, undefined, options.recover as never, undefined, health, { admissionSettlementWaitMs: options.admissionSettlementWaitMs });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("ADDRESS_REQUIRED");
  const connect = () => new WebSocket(`ws://127.0.0.1:${address.port}/v1/ws`, { origin: "http://localhost" });
  return { server, registry, gateway, connect, health, ticket };
}

describe("zone admission health and retryable failures", () => {
  const servers: { close(): void }[] = [];
  afterEach(() => { for (const server of servers.splice(0)) server.close(); vi.restoreAllMocks(); });

  it("closes a server-side recovery failure with retryable 1011, reports it in the readback and clears it on the next join", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const lines: string[] = [];
    const health = new ZoneJoinHealthMonitor(line => lines.push(line), line => lines.push(line));
    let locked = true;
    const runtime = await startGateway({
      health,
      recover: async zoneId => { if (locked) throw new Error("ZONE_PRESENCE_RECOVERY_REQUIRED"); return new AuthoritativeMovementZone(zoneId, new AurionTickRecorder()); },
    });
    servers.push(runtime.server);
    for (let attempt = 0; attempt < 2; attempt++) {
      const socket = runtime.connect(); await onceOpen(socket);
      const closed = onceClose(socket); socket.send(JSON.stringify(hello));
      // Previously 1008 ("authorization rejected"): clients treated a server lock as a rejection.
      expect(await closed).toBe(1011);
    }
    expect(health.readback()).toMatchObject({ status: "failing", consecutiveFailures: 2, failuresTotal: 2, lastFailureCode: "ZONE_PRESENCE_RECOVERY_REQUIRED" });
    expect(lines.filter(line => line.startsWith("[Aurion Zone] JOIN_FAILING "))).toHaveLength(1);

    locked = false;
    const socket = runtime.connect(); await onceOpen(socket);
    const welcomed = onceWelcome(socket); socket.send(JSON.stringify(hello)); await welcomed;
    expect(health.readback()).toMatchObject({ status: "ok", consecutiveFailures: 0, failuresTotal: 2 });
    expect(lines.some(line => line.startsWith("[Aurion Zone] JOIN_RECOVERED "))).toBe(true);
    socket.close();
  });

  it("keeps 1008 for an invalid or reused ticket", async () => {
    const health = quiet();
    const runtime = await startGateway({ health, ticket: async () => undefined, recover: async zoneId => new AuthoritativeMovementZone(zoneId, new AurionTickRecorder()) });
    servers.push(runtime.server);
    const socket = runtime.connect(); await onceOpen(socket);
    const closed = onceClose(socket); socket.send(JSON.stringify(hello));
    expect(await closed).toBe(1008);
    expect(health.readback().failuresTotal).toBe(0);
  });

  it("reports only stable machine codes", () => {
    expect(zoneFailureCode(new Error("ZONE_RECEIPT_GAP"))).toBe("ZONE_RECEIPT_GAP");
    expect(zoneFailureCode(new Error("connect ECONNREFUSED 10.0.0.2:3306 user=aurion"))).toBe("UNCLASSIFIED");
  });
});

describe("boot settlement", () => {
  const servers: { close(): void }[] = [];
  afterEach(() => { for (const server of servers.splice(0)) server.close(); vi.restoreAllMocks(); });

  it("settles the head in the background without activating the zone; a join during settlement waits instead of racing it", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const recorder = new AurionTickRecorder();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const recover = vi.fn(async (zoneId: "observatory_threshold") => { await gate; return new AuthoritativeMovementZone(zoneId, recorder); });
    const runtime = await startGateway({ recover });
    servers.push(runtime.server);
    const settling = runtime.gateway.settleZonesAtBoot(["observatory_threshold"]);
    expect(runtime.health.readback().bootSettlement).toBe("pending");
    const socket = runtime.connect(); await onceOpen(socket);
    const welcomed = onceWelcome(socket); socket.send(JSON.stringify(hello));
    await vi.waitFor(() => expect(runtime.ticket).toHaveBeenCalledTimes(1));
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(recover).toHaveBeenCalledTimes(1);
    release();
    expect(await settling).toMatchObject({ bootSettlement: "settled", bootSettlementCode: null });
    await welcomed;
    expect(recover).toHaveBeenCalledTimes(2);
    expect(runtime.registry.find("observatory_threshold")).toBeDefined();
    socket.close();
  });

  it("closes a join with retryable 1011 instead of hanging when the settlement stays stuck", async () => {
    // Review case: a stuck settlement left consumed-ticket handshakes open indefinitely.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const recover = vi.fn(() => new Promise<AuthoritativeMovementZone>(() => undefined));
    const runtime = await startGateway({ recover, admissionSettlementWaitMs: 50 });
    servers.push(runtime.server);
    void runtime.gateway.settleZonesAtBoot(["observatory_threshold"], 10_000);
    const socket = runtime.connect(); await onceOpen(socket);
    const closed = onceClose(socket); socket.send(JSON.stringify(hello));
    expect(await closed).toBe(1011);
    expect(runtime.health.readback()).toMatchObject({ status: "failing", lastFailureCode: "ZONE_BOOT_SETTLEMENT_PENDING", bootSettlement: "pending" });
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("never activates a zone at boot", async () => {
    const registry = new ZoneRegistry();
    await registry.settlePersistedHead("observatory_threshold", async zoneId => new AuthoritativeMovementZone(zoneId, new AurionTickRecorder()));
    expect(registry.find("observatory_threshold")).toBeUndefined();
  });

  it("reports a failed settlement, and a settlement still running after the report bound, then its completion", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const failed = await startGateway({ recover: async () => { throw new Error("ZONE_RECEIPT_GAP"); } });
    servers.push(failed.server);
    expect(await failed.gateway.settleZonesAtBoot(["observatory_threshold"])).toMatchObject({ bootSettlement: "failed", bootSettlementCode: "ZONE_RECEIPT_GAP" });

    let release!: () => void;
    const stalled = await startGateway({ recover: zoneId => new Promise(resolve => { release = () => resolve(new AuthoritativeMovementZone(zoneId, new AurionTickRecorder())); }) });
    servers.push(stalled.server);
    const settling = stalled.gateway.settleZonesAtBoot(["observatory_threshold"], 30);
    await vi.waitFor(() => expect(stalled.health.readback()).toMatchObject({ bootSettlement: "timed_out", bootSettlementCode: "ZONE_BOOT_SETTLEMENT_TIMEOUT" }));
    release();
    expect(await settling).toMatchObject({ bootSettlement: "settled" });
  });

  it("releases orphaned leases before admission with an inclusive boundary, bounded", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const leases = vi.fn(async () => 3);
    const runtime = await startGateway({ recover: async zoneId => new AuthoritativeMovementZone(zoneId, new AurionTickRecorder()), releaseOrphaned: leases });
    servers.push(runtime.server);
    const before = Date.now();
    expect(await runtime.gateway.releaseOrphanedLeasesAtBoot()).toMatchObject({ orphanedLeasesReleased: 3, orphanedLeaseReleaseCode: null });
    expect((leases.mock.calls[0] as unknown as [{ lastSeenBefore: Date }])[0].lastSeenBefore.getTime()).toBeGreaterThanOrEqual(before);

    const stuck = await startGateway({ recover: async zoneId => new AuthoritativeMovementZone(zoneId, new AurionTickRecorder()), releaseOrphaned: () => new Promise<number>(() => undefined) });
    servers.push(stuck.server);
    const started = Date.now();
    expect(await stuck.gateway.releaseOrphanedLeasesAtBoot(40)).toMatchObject({ orphanedLeasesReleased: null, orphanedLeaseReleaseCode: "WORLD_PRESENCE_ORPHAN_RELEASE_TIMEOUT" });
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});

describe("release promotion ordering", () => {
  it("stops the serving runtime only after every Compose validation, immediately before up", () => {
    // Review case: stopping it before `config --quiet` turned an invalid release into an outage.
    const promoter = readFileSync("deploy/promote-aurion-zone-runtime.sh", "utf8");
    const validate = promoter.indexOf('"${compose[@]}" config --quiet');
    const stop = promoter.indexOf("# previous-runtime-drain-start");
    const end = promoter.indexOf("# previous-runtime-drain-end");
    const up = promoter.indexOf('env "${compose_digest_env[@]}" "${compose[@]}" up --detach --no-build --force-recreate --no-deps aurion');
    expect(validate).toBeGreaterThan(0);
    expect(stop).toBeGreaterThan(validate);
    expect(up).toBeGreaterThan(end);
    expect(promoter.slice(end, up).trim()).toBe("# previous-runtime-drain-end");
    expect(promoter.slice(stop, end)).not.toMatch(/^\s*exit\b|set -e|\|\| false/m);
    expect(readFileSync("docker-compose.traefik.yml", "utf8")).toMatch(/^    stop_grace_period: 30s$/m);
  });
});

describe("shutdown drain deadline", () => {
  it("fails explicitly before Docker's grace period instead of being killed silently", async () => {
    await expect(withShutdownDeadline(new Promise<void>(() => undefined), 20)).rejects.toThrow("CAUSAL_SHUTDOWN_DEADLINE_EXCEEDED:20ms");
    await expect(withShutdownDeadline(Promise.resolve("drained"), 1_000)).resolves.toBe("drained");
  });
});

describe("mob targets across a presence recovery", () => {
  it("disengages a mob whose combat target was left by the recovery tick, replayably", () => {
    const recorder = new AurionTickRecorder();
    const zone = new AuthoritativeMovementZone("observatory_threshold", recorder);
    zone.join({ userId: 1210, socket: { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() } as never });
    const state = zone.getCanonicalZoneState();
    const boss = state.mobs.find(mob => mob.archetype === "titan_boss")!;
    const home = observatoryMobDefinitions.find(mob => mob.entityId === boss.entityId)!.homePosition;
    boss.x = home.x; boss.z = home.z;
    state.players[0].x = home.x - 1000; state.players[0].z = home.z;
    boss.state = "combat"; boss.targetEntityId = "player:1210";
    zone.restoreFromCanonicalState(state);

    expect(zone.leaveAllPresences()).toBe(1);
    zone.tick();
    const after = zone.getCanonicalZoneState();
    const mob = after.mobs.find(candidate => candidate.entityId === boss.entityId)!;
    expect(after.players).toEqual([]);
    expect(mob.targetEntityId).toBeNull();
    expect(mob.state).not.toBe("combat");
    expect((after.combatTactics?.windups ?? []).filter(windup => windup.targetId === "player:1210")).toEqual([]);
    const receipt = zone.getLatestReceipt()!;
    const entry = recorder.getEntry("observatory_threshold", receipt.tick)!;
    expect(replayZoneTick({ preState: entry.preState!, intents: entry.intents!, expectedReceipt: receipt }).verdict).toBe("MATCH");
  });
});
