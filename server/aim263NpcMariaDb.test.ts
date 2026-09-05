import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resolveAndRecordNpc } from "./wasdAurionRuntime";

const suite = process.env.AURION_NPC_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const npcId = "aim263:test-npc";
const request = (resolutionIndex: number) => ({ npcId, regionId: "observatory_threshold", resolutionIndex, needEvents: [{ id: `event:${resolutionIndex}`, need: "safety" as const, delta: -.1, sourceReceiptId: `receipt:${resolutionIndex}`, resolutionIndex }], observationIds: [`receipt:${resolutionIndex}`], memory: [`observed:${resolutionIndex}`] });
suite("AIM-263 exact NPC receipts in isolated MariaDB", () => {
  let pool: Pool; let isolated = false;
  async function cleanup() {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    await pool.query("DROP TRIGGER IF EXISTS aim263_abort_npc_receipt");
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId=?", [npcId]);
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId=?", [npcId]);
  }
  beforeAll(async () => {
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (!rows[0].name?.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
  });
  beforeEach(cleanup);
  afterAll(async () => { if (pool) { if (isolated) await cleanup(); await pool.end(); } });
  it("serializes parallel creation and replays the historical snapshot after later decisions", async () => {
    const results = await Promise.all([0,1,2].map(() => resolveAndRecordNpc(request(0))));
    expect(results.filter(r => r.source === "created")).toHaveLength(1);
    for (const r of results) expect({ ...r, source: "created" }).toEqual({ ...results[0], source: "created" });
    const first = results[0];
    const later = await resolveAndRecordNpc(request(1));
    expect(later.needs.safety).toBeLessThan(first.needs.safety);
    expect(later.memory).toContain("observed:0");
    expect(later.memory).toContain("observed:1");
    const retry = await resolveAndRecordNpc(request(0));
    expect(retry).toEqual({ ...first, source: "persisted" });
    expect(retry.memory).not.toContain("observed:1");
    const [rows] = await pool.query<RowDataPacket[]>("SELECT lastResolutionIndex FROM aurionNpcStates WHERE npcId=?", [npcId]);
    expect(rows[0].lastResolutionIndex).toBe(1);
    const [receipts] = await pool.query<RowDataPacket[]>("SELECT id FROM aurionNpcDecisionReceipts WHERE npcId=? ORDER BY resolutionIndex", [npcId]);
    expect(receipts).toHaveLength(2);
    expect(receipts.every(row => /^npc_[a-f0-9]{56}$/.test(row.id))).toBe(true);
  });
  it("rejects conflicting retry inputs and old unseen resolutions without changing state", async () => {
    await resolveAndRecordNpc(request(4));
    await expect(resolveAndRecordNpc({ ...request(4), memory: ["altered"] })).rejects.toThrow("INPUT_CONFLICT");
    await expect(resolveAndRecordNpc(request(3))).rejects.toThrow("OUT_OF_ORDER");
    const [rows] = await pool.query<RowDataPacket[]>("SELECT lastResolutionIndex FROM aurionNpcStates WHERE npcId=?", [npcId]);
    expect(rows[0].lastResolutionIndex).toBe(4);
  });
  it("rolls back state when the receipt insert fails and preserves the first committed decision", async () => {
    const first = await resolveAndRecordNpc(request(0));
    await pool.query(`CREATE TRIGGER aim263_abort_npc_receipt BEFORE INSERT ON aurionNpcDecisionReceipts FOR EACH ROW BEGIN IF NEW.npcId='aim263:test-npc' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AIM263_FORCED_ROLLBACK'; END IF; END`);
    await expect(resolveAndRecordNpc(request(1))).rejects.toThrow();
    const [rows] = await pool.query<RowDataPacket[]>("SELECT lastResolutionIndex, needsJson FROM aurionNpcStates WHERE npcId=?", [npcId]);
    expect(rows[0].lastResolutionIndex).toBe(0); expect(JSON.parse(rows[0].needsJson)).toEqual(first.needs);
    await pool.query("DROP TRIGGER aim263_abort_npc_receipt");
    expect((await resolveAndRecordNpc(request(1))).source).toBe("created");
  });
  it("fails closed on valid-JSON state tamper and receipt tamper", async () => {
    const first = await resolveAndRecordNpc(request(0));
    const [state] = await pool.query<RowDataPacket[]>("SELECT needsJson FROM aurionNpcStates WHERE npcId=?", [npcId]);
    await pool.query("UPDATE aurionNpcStates SET needsJson=? WHERE npcId=?", [JSON.stringify({ ...first.needs, safety: .999 }),npcId]);
    await expect(resolveAndRecordNpc(request(1))).rejects.toThrow("CORRUPT");
    await pool.query("UPDATE aurionNpcStates SET needsJson=? WHERE npcId=?", [state[0].needsJson,npcId]);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT observationIdsJson FROM aurionNpcDecisionReceipts WHERE npcId=?", [npcId]);
    const value = JSON.parse(rows[0].observationIdsJson); value.snapshot.memory[0] = "tampered";
    await pool.query("UPDATE aurionNpcDecisionReceipts SET observationIdsJson=? WHERE npcId=?", [JSON.stringify(value),npcId]);
    await expect(resolveAndRecordNpc(request(0))).rejects.toThrow("CORRUPT");
  });
});
