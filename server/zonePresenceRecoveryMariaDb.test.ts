import { createServer } from "node:http";
import { createPool, type RowDataPacket } from "mysql2/promise";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MariaDBCausalPersistenceAdapter } from "./causality/persistence";
import { AurionTickRecorder } from "./causality/tickRecorder";
import { restorePersistedZoneHead } from "./causality/persistedZoneRecovery";
import { ZoneRegistry, type AuthoritativeMovementZone } from "./zoneRuntime";
import { registerZoneGateway } from "./zoneGateway";
import type { ZoneId } from "./zoneProtocol";

// Production 2026-11-04: a release restarted the runtime while player:1210 was in the
// zone. The persisted head kept that player, every later handshake failed with
// ZONE_PRESENCE_RECOVERY_REQUIRED and the live game froze on start for everyone.
const socket = () => ({ OPEN: 1, readyState: 1, send() {}, close() {} }) as never;
const suite = process.env.AURION_PROBE_E2E === "1" ? describe : describe.skip;

suite("zone presence across process restarts (isolated MariaDB)", () => {
  const url = () => {
    const value = new URL(process.env.DATABASE_URL ?? "");
    if (!/^aurion_.*test/.test(value.pathname.slice(1)) || !["127.0.0.1", "localhost"].includes(value.hostname)) throw new Error("ISOLATED_TEST_DB_REQUIRED");
    return value;
  };
  const freshProcess = (adapter: MariaDBCausalPersistenceAdapter) => (zoneId: ZoneId) => restorePersistedZoneHead(zoneId, adapter, new AurionTickRecorder(20, adapter));

  async function cleanup(zoneId: string) {
    const pool = createPool(url().href);
    try {
      await pool.execute("DELETE FROM aurionCausalTickReceipts WHERE zoneId=?", [zoneId]);
      await pool.execute("DELETE FROM aurionCausalCheckpoints WHERE zoneId=?", [zoneId]);
    } finally { await pool.end(); }
  }
  async function receiptCount(zoneId: string) {
    const pool = createPool(url().href);
    try {
      const [rows] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS n FROM aurionCausalTickReceipts WHERE zoneId=?", [zoneId]);
      return Number(rows[0].n);
    } finally { await pool.end(); }
  }

  it("recovers a head that still carries a player after a crash through one durable, replayable presence_leave tick", async () => {
    const zoneId = "observatory_threshold:presence-crash-recovery-test" as ZoneId;
    const adapter = new MariaDBCausalPersistenceAdapter();
    await cleanup(zoneId);
    try {
      // First process: a player joins and the process dies without leaving.
      const first = await freshProcess(adapter)(zoneId);
      first.join({ userId: 1210, socket: socket() });
      first.tick(); first.tick();
      await first.flushEvidencePersistence();
      const head = await adapter.getLatestReceipt(zoneId);
      expect(first.getCanonicalZoneState().players.map(player => player.entityId)).toEqual(["player:1210"]);

      // Second process: concurrent handshakes share one recovery that commits exactly one leave tick.
      const registry = new ZoneRegistry();
      const [a, b] = await Promise.all([registry.getOrRecover(zoneId, freshProcess(adapter)), registry.getOrRecover(zoneId, freshProcess(adapter))]);
      expect(a).toBe(b);
      expect(a.getCanonicalZoneState().players).toEqual([]);
      const leave = await adapter.getRecordedTick(zoneId, head!.tick + 1);
      expect(leave!.receipt.previousReceiptHash).toBe(head!.receiptHash);
      expect(leave!.intents!.filter(intent => intent.type === "presence_leave").map(intent => intent.userId)).toEqual([1210]);
      expect((await adapter.getLatestReceipt(zoneId))?.receiptHash).toBe(leave!.receipt.receiptHash);
      expect(await receiptCount(zoneId)).toBe(head!.tick + 1);

      // The same player can play again in the recovered zone.
      const welcome = a.join({ userId: 1210, socket: socket() });
      expect(welcome.selfEntityId).toBe("player:1210");

      // Third process: the recovery tick replays from the checkpoint tail and needs no new recovery.
      const third = await freshProcess(adapter)(zoneId);
      expect(third.getLatestReceipt()?.receiptHash).toBe(leave!.receipt.receiptHash);
      expect(third.getCanonicalZoneState().players).toEqual([]);
    } finally { await cleanup(zoneId); }
  }, 60_000);

  it("commits canonical leaves for every presence at shutdown so the next process starts without recovery", async () => {
    const zoneId = "observatory_threshold:presence-shutdown-test" as ZoneId;
    const adapter = new MariaDBCausalPersistenceAdapter();
    await cleanup(zoneId);
    try {
      const registry = new ZoneRegistry();
      const zone: AuthoritativeMovementZone = await registry.getOrRecover(zoneId, freshProcess(adapter));
      zone.join({ userId: 501, socket: socket() });
      zone.join({ userId: 502, socket: socket() });
      registry.tick();
      expect(registry.commitShutdownLeaves()).toBe(2);
      expect(registry.commitShutdownLeaves()).toBe(0);
      await zone.flushEvidencePersistence();
      const head = await adapter.getLatestReceipt(zoneId);
      const final = await adapter.getRecordedTick(zoneId, head!.tick);
      expect(final!.intents!.filter(intent => intent.type === "presence_leave").map(intent => intent.userId).sort()).toEqual([501, 502]);

      const restarted = await freshProcess(adapter)(zoneId);
      expect(restarted.getCanonicalZoneState().players).toEqual([]);
      expect((await adapter.getLatestReceipt(zoneId))?.receiptHash).toBe(head!.receiptHash);
    } finally { await cleanup(zoneId); }
  }, 60_000);
});

describe("zone gateway shutdown boundary", () => {
  afterEach(() => vi.restoreAllMocks());

  it("commits presence leaves after stopping the tick timer and before closing sockets", () => {
    const server = createServer();
    const registry = new ZoneRegistry();
    const order: string[] = [];
    vi.spyOn(registry, "commitShutdownLeaves").mockImplementation(() => { order.push("leaves"); return 0; });
    const clear = vi.spyOn(globalThis, "clearInterval").mockImplementation(((id: unknown) => { order.push("timer"); }) as typeof clearInterval);
    const gateway = registerZoneGateway(server, registry, async () => null);
    try { gateway.close(); } finally { clear.mockRestore(); server.close(); }
    expect(order.slice(0, 2)).toEqual(["timer", "leaves"]);
  });
});
