import { describe, expect, it } from "vitest";
import { createPool } from "mysql2/promise";
import { MariaDBCausalPersistenceAdapter } from "./causality/persistence";
import { AurionTickRecorder } from "./causality/tickRecorder";
import { AuthoritativeMovementZone } from "./zoneRuntime";
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
});
