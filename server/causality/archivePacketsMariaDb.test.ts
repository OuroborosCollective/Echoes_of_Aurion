import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Pool } from "mysql2/promise";
import { aurionCausalTickReceipts } from "../../drizzle/aurionCausalitySchema";
import { getDb } from "../db";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { AurionTickRecorder } from "./tickRecorder";
import { MariaDBCausalPersistenceAdapter, causalReceiptPersistenceId } from "./persistence";
import { AurionCausalArchivingService } from "./archivingService";
import { CAUSAL_ARCHIVE_PACKET_MAX_BYTES, causalArchiveHash } from "./archivePacking";
const real = process.env.AURION_ARCHIVE_DB_E2E === "1" && process.env.NODE_ENV === "test" ? describe : describe.skip;
real("bounded causal archives — real MariaDB", () => {
  let pool: Pool;
  const adapter = new MariaDBCausalPersistenceAdapter();
  const zoneId = "observatory_threshold:archive-proof";
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/aurion_archive_test") throw new Error("ISOLATED_ARCHIVE_TEST_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
    for (const table of ["aurionCausalArchive", "aurionCausalCheckpoints", "aurionCausalTickReceipts"]) {
      await pool.query(`DELETE FROM ${table} WHERE zoneId=?`, [zoneId]);
    }
    // Actual deterministic v2 ticks; this fixture tests DB archival, not a player journey.
    const zone = new AuthoritativeMovementZone(zoneId as any, new AurionTickRecorder(1));
    const rows: (typeof aurionCausalTickReceipts.$inferInsert)[] = [];
    for (let n = 1; n <= 1100; n++) {
      zone.tick();
      const r = zone.getLatestReceipt()!;
      rows.push({ id: causalReceiptPersistenceId(r), worldId: r.worldId, zoneId, tick: r.tick,
        revision: r.sourceRevision, rulesetVersion: r.rulesetVersion, receiptSchema: r.schema,
        preStateHash: r.preStateHash, inputHash: r.orderedIntentHash, inputJson: "[]",
        stageReceiptsJson: r.schema === "aurion.causal.tick.v2" ? JSON.stringify(r.stages) : null,
        transitionHash: r.transitionHash, rngRootHash: r.rngRootHash, postStateHash: r.postStateHash,
        previousReceiptHash: r.previousReceiptHash, receiptHash: r.receiptHash });
    }
    const db = (await getDb())!;
    for (let i = 0; i < rows.length; i += 100) await db.insert(aurionCausalTickReceipts).values(rows.slice(i, i + 100));
    await adapter.saveCheckpoint(zoneId, 1100, zone.getLatestReceipt()!.postStateHash, zone.getCanonicalZoneState());
    await pool.query("UPDATE aurionCausalCheckpoints SET reconciled=1 WHERE zoneId=?", [zoneId]);
  }, 60_000);
  afterAll(async () => { await pool?.end(); });

  it("archives 900+ v2 receipts with stable existing boundaries, retry and complete checkpoint coverage", async () => {
    const first = await adapter.archiveOldReceipts(zoneId, 901);
    expect(first).toMatchObject({ startTick: 1, endTick: 900, archivedCount: 900 });
    expect(first!.archiveIds.length).toBeGreaterThan(1);
    expect(await adapter.archiveOldReceipts(zoneId, 901)).toEqual(first);
    const [before] = await pool.query("SELECT id,archiveHash,payloadJson FROM aurionCausalArchive WHERE zoneId=? ORDER BY startTick", [zoneId]);
    const backup = await new AurionCausalArchivingService().triggerZoneBackup(zoneId);
    expect(backup).toMatchObject({ ok: true, status: "ARCHIVED", startTick: 1, endTick: 1100, archivedCount: 1100, checkpointTick: 1100 });
    const [after] = await pool.query("SELECT id,archiveHash,payloadJson FROM aurionCausalArchive WHERE zoneId=? ORDER BY startTick", [zoneId]);
    const all = after as Array<{ id: string; archiveHash: string; payloadJson: string }>;
    expect(all.slice(0, (before as any[]).length)).toEqual(before);
    expect(all.every(row => Buffer.byteLength(row.payloadJson, "utf8") <= CAUSAL_ARCHIVE_PACKET_MAX_BYTES)).toBe(true);
    expect(all.every(row => causalArchiveHash(row.payloadJson) === row.archiveHash)).toBe(true);
    expect(all.flatMap(row => JSON.parse(row.payloadJson).map((receipt: { tick: number }) => receipt.tick)))
      .toEqual(Array.from({ length: 1100 }, (_, i) => i + 1));
    expect(await new AurionCausalArchivingService().triggerZoneBackup(zoneId)).toEqual(backup);
    // A smaller request reuses its existing full last packet; never rewrites its boundary.
    expect((await adapter.archiveOldReceipts(zoneId, 850))!.endTick).toBeGreaterThanOrEqual(849);
    const [source] = await pool.query("SELECT COUNT(*) AS n FROM aurionCausalTickReceipts WHERE zoneId=?", [zoneId]);
    expect(source).toEqual([expect.objectContaining({ n: 1100 })]);
    await pool.query("UPDATE aurionCausalArchive SET archiveHash=REPEAT('0',64) WHERE id=?", [first!.archiveIds[0]]);
    await expect(adapter.archiveOldReceipts(zoneId, 1101)).rejects.toThrow("CAUSAL_ARCHIVE_CONFLICT");
  }, 60_000);

  it("atomically rolls back a failure after the first packet and permits a complete retry", async () => {
    await pool.query("DELETE FROM aurionCausalArchive WHERE zoneId=?", [zoneId]);
    await pool.query("CREATE TRIGGER archive_insert_failure BEFORE INSERT ON aurionCausalArchive FOR EACH ROW BEGIN IF NEW.startTick > 1 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='INJECTED_ARCHIVE_INSERT_FAILURE'; END IF; END");
    try {
      await expect(adapter.archiveOldReceipts(zoneId, 1101)).rejects.toThrow();
      const [rows] = await pool.query("SELECT id FROM aurionCausalArchive WHERE zoneId=?", [zoneId]);
      expect(rows).toEqual([]);
    } finally { await pool.query("DROP TRIGGER archive_insert_failure"); }
    expect(await adapter.archiveOldReceipts(zoneId, 1101)).toMatchObject({ startTick: 1, endTick: 1100, archivedCount: 1100 });
  }, 60_000);

  it("rolls back oversized and incomplete coverage instead of reporting a successful backup", async () => {
    await pool.query("DELETE FROM aurionCausalArchive WHERE zoneId=?", [zoneId]);
    const [original] = await pool.query("SELECT inputJson FROM aurionCausalTickReceipts WHERE zoneId=? AND tick=1100", [zoneId]);
    // Fits its source TEXT column, but the containing v2 archive object exceeds the packet budget.
    await pool.query("UPDATE aurionCausalTickReceipts SET inputJson=? WHERE zoneId=? AND tick=1100", [JSON.stringify(["🐺".repeat(15000)]), zoneId]);
    await expect(adapter.archiveOldReceipts(zoneId, 1101)).rejects.toThrow("CAUSAL_ARCHIVE_RECEIPT_TOO_LARGE:1100");
    const [archives] = await pool.query("SELECT id FROM aurionCausalArchive WHERE zoneId=?", [zoneId]);
    expect(archives).toEqual([]);
    await pool.query("UPDATE aurionCausalTickReceipts SET inputJson=? WHERE zoneId=? AND tick=1100", [(original as any[])[0].inputJson, zoneId]);
    expect(await adapter.archiveOldReceipts(zoneId, 1101)).toMatchObject({ archivedCount: 1100 });
    const failed = await adapter.archiveOldReceipts(zoneId, 1201).catch(error => error.message);
    expect(failed).toBe("CAUSAL_ARCHIVE_SOURCE_COVERAGE_INCOMPLETE");
  }, 60_000);
});
