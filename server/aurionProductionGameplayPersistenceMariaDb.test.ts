import { describe, expect, it } from "vitest";
import { createPool } from "mysql2/promise";
import { MariaDBCausalPersistenceAdapter } from "./causality/persistence";
import { AurionTickRecorder } from "./causality/tickRecorder";
import { AuthoritativeMovementZone, ZoneRegistry } from "./zoneRuntime";
import { prepareProductionProbeZone } from "./aurionProductionProbeZone";
import { AurionProductionProbeStore } from "./aurionProductionProbeStore";
import { runProductionGameplaySessionReadback } from "./aurionProductionGameplaySession";
import { AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID, requireProbePersistenceEvidence } from "../shared/aurionProductionProbeEvidence";
import { orderCanonicalZoneIntents, sanitizeIntentForHash } from "../shared/aurionZoneIntentContract";

const suite = process.env.AURION_PROBE_E2E === "1" ? describe : describe.skip;
suite("real Aurion membership receipts in isolated MariaDB (not production)", () => {
  it("flushes canonical join/leave, reads both committed ticks independently and rejects a deleted receipt", async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (!/^aurion_.*test/.test(url.pathname.slice(1)) || !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("ISOLATED_TEST_DB_REQUIRED");
    const pool = createPool(url.href);
    const zoneId = "observatory_threshold:probe-persistence-test";
    let releaseWrites!: () => void;
    const writesAllowed = new Promise<void>(resolve => { releaseWrites = resolve; });
    class DelayedPersistence extends MariaDBCausalPersistenceAdapter {
      override async saveReceipt(...args: Parameters<MariaDBCausalPersistenceAdapter["saveReceipt"]>) {
        await writesAllowed;
        await super.saveReceipt(...args);
      }
    }
    const adapter = new DelayedPersistence();
    const recorder = new AurionTickRecorder(20, adapter);
    const zone = new AuthoritativeMovementZone(zoneId, recorder);
    const revision = "a".repeat(40);
    zone.sourceRevisionOverride = revision;
    const socket = { OPEN: 1, readyState: 1, send() {}, close() {} } as any;
    try {
      const welcome = zone.join({ userId: AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID, socket });
      zone.tick();
      const snapshotTick = zone.getTickNumber();
      zone.leave(welcome.connectionId);
      zone.tick();
      const flushed = zone.flushEvidencePersistence();
      expect(recorder.getPersistenceStatus().pending).toBe(2);
      expect(await adapter.getTicksInRange(zoneId, 1, 2)).toEqual([]);
      releaseWrites();
      await flushed;
      expect(recorder.getPersistenceStatus()).toMatchObject({ pending: 0, failures: 0 });
      const readback = async () => ({ joinTick: 1, leaveTick: 2,
        ticks: (await adapter.getTicksInRange(zoneId, 1, 2)).map(entry => ({ receipt: entry.receipt,
          intents: orderCanonicalZoneIntents(entry.intents ?? []).map(sanitizeIntentForHash) })) });
      const persisted = await readback();
      requireProbePersistenceEvidence(persisted, revision, zoneId, welcome.tick, snapshotTick);
      expect(persisted.ticks.map(entry => entry.receipt.receiptHash)).toEqual(recorder.getReceiptChain(zoneId, 1, 2).map(receipt => receipt.receiptHash));
      await pool.execute("DELETE FROM aurionCausalTickReceipts WHERE zoneId=? AND tick=2", [zoneId]);
      expect(() => requireProbePersistenceEvidence(persisted, revision, zoneId, welcome.tick, snapshotTick)).not.toThrow();
      const incomplete = await readback();
      expect(() => requireProbePersistenceEvidence(incomplete, revision, zoneId, welcome.tick, snapshotTick)).toThrow("PROBE_PERSISTED_MEMBERSHIP_INVALID");
    } finally {
      releaseWrites();
      await zone.flushEvidencePersistence();
      await pool.execute("DELETE FROM aurionCausalTickReceipts WHERE zoneId=?", [zoneId]);
      await pool.execute("DELETE FROM aurionCausalCheckpoints WHERE zoneId=?", [zoneId]);
      await pool.end();
    }
  }, 30000);

  it("hydrates an earlier revision, continues its durable chain, stops ticking and hydrates again", async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (!/^aurion_.*test/.test(url.pathname.slice(1)) || !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("ISOLATED_TEST_DB_REQUIRED");
    const pool = createPool(url.href), adapter = new MariaDBCausalPersistenceAdapter();
    const zoneId = "observatory_threshold";
    const old = new AuthoritativeMovementZone(zoneId, new AurionTickRecorder(20, adapter));
    old.sourceRevisionOverride = "a".repeat(40);
    const socket = () => ({ OPEN: 1, readyState: 1, send() {}, close() {} }) as any;
    const registry = new ZoneRegistry();
    try {
      const first = old.join({ userId: AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID, socket: socket() });
      old.tick(); old.leave(first.connectionId); old.tick(); await old.flushEvidencePersistence();
      const original = await adapter.getLatestReceipt(zoneId);
      const prepared = await prepareProductionProbeZone(registry, adapter, new AurionTickRecorder(20, adapter));
      expect(prepared.needsActivation).toBe(true);
      expect(registry.find(zoneId)).toBeUndefined();
      expect(prepared.zone.getTickNumber()).toBe(2);
      expect(prepared.zone.getCanonicalZoneState()).toEqual(old.getCanonicalZoneState());
      prepared.zone.sourceRevisionOverride = "b".repeat(40);
      registry.installProbeZone(prepared.zone);
      const next = prepared.zone.join({ userId: AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID, socket: socket() });
      registry.tick(); prepared.zone.leave(next.connectionId); registry.tick(); await prepared.zone.flushEvidencePersistence();
      const continued = await adapter.getTicksInRange(zoneId, 3, 4);
      expect(continued).toHaveLength(2);
      expect(continued[0].receipt.previousReceiptHash).toBe(original!.receiptHash);
      expect(continued[1].receipt.sourceRevision).toBe("b".repeat(40));
      registry.releaseProbeZone(prepared.zone);
      registry.tick();
      expect(prepared.zone.getTickNumber()).toBe(4);
      const again = await prepareProductionProbeZone(registry, adapter, new AurionTickRecorder(20, adapter));
      expect(again.zone.getTickNumber()).toBe(4);
      expect(again.zone.getCanonicalZoneState()).toEqual(prepared.zone.getCanonicalZoneState());
      // Never silently erase an interrupted player's persisted presence.
      again.zone.sourceRevisionOverride = "b".repeat(40);
      again.zone.join({ userId: 77, socket: socket() }); again.zone.tick(); await again.zone.flushEvidencePersistence();
      await expect(prepareProductionProbeZone(registry, adapter, new AurionTickRecorder(20, adapter))).rejects.toThrow("PROBE_ZONE_PRESENCE_RECOVERY_REQUIRED");
    } finally {
      await pool.execute("DELETE FROM aurionCausalTickReceipts WHERE zoneId=?", [zoneId]);
      await pool.execute("DELETE FROM aurionCausalCheckpoints WHERE zoneId=?", [zoneId]);
      await pool.end();
    }
  }, 30000);

  it("holds the actual MariaDB session lock across a timed-out handshake until the leave is committed", async () => {
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (!/^aurion_.*test/.test(url.pathname.slice(1)) || !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("ISOLATED_TEST_DB_REQUIRED");
    const pool = createPool(url.href), store = new AurionProductionProbeStore(pool);
    const zoneId = "observatory_threshold:cleanup-lock-test";
    let allowWrites!: () => void;
    const allowed = new Promise<void>(resolve => { allowWrites = resolve; });
    class DelayedPersistence extends MariaDBCausalPersistenceAdapter {
      override async saveReceipt(...args: Parameters<MariaDBCausalPersistenceAdapter["saveReceipt"]>) { await allowed; await super.saveReceipt(...args); }
    }
    const adapter = new DelayedPersistence();
    const zone = new AuthoritativeMovementZone(zoneId, new AurionTickRecorder(20, adapter));
    const revision = "a".repeat(40); zone.sourceRevisionOverride = revision;
    let finished = false;
    const result = store.withExclusiveGameplayProbeSession(() => runProductionGameplaySessionReadback({ zone, expectedRevision: revision,
      health: () => ({ revision }), readNpcGuildOverview: async () => ({}), sampleAssurance: async () => ({}),
      readPersistedTicks: (id, from, to) => adapter.getTicksInRange(id, from, to),
      timings: { handshakeTimeoutMs: 10, pollIntervalMs: 2 },
    })).then(() => "unexpected success", error => { finished = true; return error.message; });
    try {
      for (let i = 0; i < 200 && !zone.getPendingIntents().some(intent => intent.type === "presence_leave"); i++) await new Promise(resolve => setTimeout(resolve, 5));
      expect(zone.getPendingIntents().some(intent => intent.type === "presence_leave")).toBe(true);
      await expect(store.withExclusiveGameplayProbeSession(async () => undefined)).rejects.toThrow("PROBE_GAMEPLAY_SESSION_BUSY");
      zone.tick();
      expect(finished).toBe(false);
      expect(await adapter.getTicksInRange(zoneId, 1, 1)).toEqual([]);
      await expect(store.withExclusiveGameplayProbeSession(async () => undefined)).rejects.toThrow("PROBE_GAMEPLAY_SESSION_BUSY");
      allowWrites();
      expect(await result).toBe("PROBE_ZONE_HANDSHAKE_TIMEOUT");
      expect((await adapter.getRecordedTick(zoneId, 1))!.intents!.map(i => i.type)).toEqual(["presence_join", "presence_leave"]);
      await expect(store.withExclusiveGameplayProbeSession(async () => "released after readback")).resolves.toBe("released after readback");
    } finally {
      allowWrites();
      if (zone.getPendingIntents().length) zone.tick();
      await result;
      await pool.execute("DELETE FROM aurionCausalTickReceipts WHERE zoneId=?", [zoneId]);
      await pool.execute("DELETE FROM aurionCausalCheckpoints WHERE zoneId=?", [zoneId]);
      await pool.end();
    }
  }, 30000);
});
