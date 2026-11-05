import { execFileSync } from "node:child_process";
import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { npcCapsulePin as pin } from "./aurion/npc/authority.js";
import { LIVING_HISTORY_HUBS, executeLivingHistoryCycle } from "./aurion/livingHistoryLoop";
import { getDb } from "./db";
import { resolveAndRecordNpc } from "./wasdAurionRuntime";
import {
  GRAPH_BODY_CHECKPOINT_INTERVAL,
  readConfirmedNpcSemanticGraphPacket,
  readVerifiedNpcSemanticGraphV2,
  storesGraphBody,
  verifyNpcSemanticGraphChainV2,
} from "./wasdSemanticGraphV2Persistence";
import { merchantBootstrapMarkets, merchantInventoryStateHash, merchantMarketStateHash, merchantPolityStateHash, npcIdentity } from "./wasdNpcCapsule";

const GENERATIONS = GRAPH_BODY_CHECKPOINT_INTERVAL + 4;
const npcIds = LIVING_HISTORY_HUBS.map(hub => npcIdentity(hub));

describe("semantic graph body checkpoint policy", () => {
  it("stores a full body only for the first generation of a chain and every checkpoint interval", () => {
    expect(storesGraphBody({ previousGraphHash: null, generation: 17 })).toBe(true);
    expect(storesGraphBody({ previousGraphHash: "a".repeat(64), generation: GRAPH_BODY_CHECKPOINT_INTERVAL * 3 })).toBe(true);
    expect(storesGraphBody({ previousGraphHash: "a".repeat(64), generation: GRAPH_BODY_CHECKPOINT_INTERVAL * 3 + 1 })).toBe(false);
    expect(storesGraphBody({ previousGraphHash: "a".repeat(64), generation: 1 })).toBe(false);
  });
});

const suite = process.env.AURION_NPC_ACTION_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;

suite("bounded semantic graph V2 storage and verification over a long four-NPC run (real MariaDB)", () => {
  let pool: Pool;
  let isolated = false;

  async function cleanup() {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    for (const table of ["aurionNpcControllerShadowReceipts", "aurionNpcControllerBindings", 
      "aurionSemanticGraphIndexV2", "aurionSemanticGraphProvenanceV2", "aurionSemanticGraphEdgesV2", "aurionSemanticGraphNodesV2", "aurionSemanticGraphReceiptsV2",
      "aurionNpcGuildReceipts", "aurionNpcGuildMemberships", "aurionNpcGuildStates",
      "aurionNpcActionMemoryLinks", "aurionNpcActionEffectReadbacks", "aurionNpcActionReceipts", "aurionNpcActionEpochSourceReceipts", "aurionNpcActionConsentReceipts", "aurionNpcActionLeases",
      "aurionSemanticRetrievalIndex", "aurionSemanticProvenance", "aurionSemanticNodes", "aurionSemanticMemoryReceipts",
      "aurionNpcMemoryReceiptsV4", "aurionWorldResolutions", "aurionPolityStates", "aurionNpcActionEpochStates",
    ]) await pool.query(`TRUNCATE TABLE ${table}`);
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId IN (?,?,?,?)", npcIds);
    await pool.query("DELETE FROM aurionNpcStates WHERE npcId IN (?,?,?,?)", npcIds);
    for (const hubId of LIVING_HISTORY_HUBS) {
      const market = merchantBootstrapMarkets[hubId], ownerId = `market:${hubId}`;
      const entries = Object.entries(market.stock).map(([itemId, quantity]) => ({ itemId, quantity, capacity: 1_000_000 }));
      const inventory = { ownerId, entries, stateHash: merchantInventoryStateHash({ ownerId, market, entries }) };
      const polityId = `polity:${hubId}`;
      await pool.query(
        "INSERT INTO aurionNpcActionEpochStates (hubId,active,marketVersion,marketJson,marketHash,inventoryJson,inventoryHash,polityVersion,polityId,polityStability,polityStateHash,sourceRevision,sourceSha256) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [hubId, true, 0, JSON.stringify(market), merchantMarketStateHash(market), JSON.stringify(inventory), inventory.stateHash, 0, polityId, 72,
          merchantPolityStateHash({ polityId, version: 0, stability: 72 }), pin.sourceRevision, pin.sourceSha256],
      );
    }
  }
  /** Living history integration: every cycle must stay free of graph/persistence failures. */
  async function runCycles(cycles = 12) {
    for (let cycle = 1; cycle <= cycles; cycle++) {
      const result = await executeLivingHistoryCycle(cycle * 600, cycle);
      // Gameplay blocks (e.g. NPC_ACTION_GATEWAY_BLOCKED_TARGET_RANGE) are a separate, pre-existing issue; graph failures are not allowed.
      expect(result.entries.filter(entry => /SEMANTIC_GRAPH|GRAPH_V2/.test(entry.failureCode ?? ""))).toEqual([]);
      if (cycle === 1) expect(result.entries.every(entry => entry.status === "confirmed" && entry.resolutionIndex === 0)).toBe(true);
    }
  }
  /** Long run through the canonical decision path: each decision appends one graph generation. */
  async function recordGenerations(npcId: string, hubId: typeof LIVING_HISTORY_HUBS[number], count: number) {
    const specs = [["safe_hub", "safe"], ["resource", "resource"], ["social", "social"], ["reputation", "reputation"], ["market", "market"], ["influence", "influence"]] as const;
    for (let index = 0; index < count; index++) {
      await resolveAndRecordNpc({
        npcId, regionId: hubId, resolutionIndex: index, needEvents: [], observationIds: [`retention-source:${hubId}:${index}`], memory: [], roleId: "merchant",
        economy: { currentHubId: hubId, wealthCopper: 1200, hungerBps: 2000, fatigueBps: 1500, tradeProwessBps: 10500, harvestYieldBps: 10000 },
        opportunities: specs.map(([kind, suffix]) => ({ id: `retention-op:${index}:${suffix}`, kind, regionId: hubId, targetId: `target:${suffix}`, benefitBps: 8_000, riskBps: 0, distanceBps: 0, sourceReceiptId: `retention-source:${hubId}:${index}`, resolutionIndex: index })),
      });
    }
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (rows[0]?.name !== url.pathname.slice(1)) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
  });
  beforeEach(cleanup);
  afterAll(async () => { if (pool) { if (isolated) await cleanup(); await pool.end(); } });

  it("appends only small envelopes between body checkpoints over 260 generations for four NPCs and stays fully re-derivable", async () => {
    for (const hubId of LIVING_HISTORY_HUBS) await recordGenerations(npcIdentity(hubId), hubId, GENERATIONS);
    const [receipts] = await pool.query<RowDataPacket[]>(
      "SELECT npcId, COUNT(*) AS generations, SUM(LENGTH(graphJson) > 1000) AS bodies, GROUP_CONCAT(CASE WHEN LENGTH(graphJson) > 1000 THEN generation END ORDER BY generation) AS bodyGenerations, MAX(CASE WHEN LENGTH(graphJson) <= 1000 THEN LENGTH(graphJson) END) AS envelopeBytes FROM aurionSemanticGraphReceiptsV2 GROUP BY npcId ORDER BY npcId");
    expect(receipts.map(row => [row.npcId, Number(row.generations), Number(row.bodies), String(row.bodyGenerations)]))
      .toEqual([...npcIds].sort().map(npcId => [npcId, GENERATIONS, 2, `0,${GRAPH_BODY_CHECKPOINT_INTERVAL}`]));
    expect(receipts.every(row => Number(row.envelopeBytes) < 200)).toBe(true);
    const [nodeOwners] = await pool.query<RowDataPacket[]>("SELECT COUNT(DISTINCT graphReceiptId) AS n FROM aurionSemanticGraphNodesV2");
    expect(Number(nodeOwners[0].n)).toBe(npcIds.length * 2);
    const [indexOwners] = await pool.query<RowDataPacket[]>(
      "SELECT i.npcId, COUNT(DISTINCT i.graphReceiptId) AS receipts, MAX(r.generation) AS generation FROM aurionSemanticGraphIndexV2 i JOIN aurionSemanticGraphReceiptsV2 r ON r.id=i.graphReceiptId GROUP BY i.npcId ORDER BY i.npcId");
    expect(indexOwners.map(row => [Number(row.receipts), Number(row.generation)])).toEqual(npcIds.map(() => [1, GENERATIONS - 1]));

    const db = await getDb();
    if (!db) throw new Error("DB_REQUIRED");
    for (const npcId of npcIds) {
      const head = await db.transaction(tx => readVerifiedNpcSemanticGraphV2(tx, npcId));
      expect(head?.graph.generation).toBe(GENERATIONS - 1);
      const audit = await db.transaction(tx => verifyNpcSemanticGraphChainV2(tx, npcId));
      expect(audit).toMatchObject({ generations: GENERATIONS, bodies: 2, headGraphHash: head?.graph.graphHash });
    }
    const packet = await readConfirmedNpcSemanticGraphPacket(7);
    expect(packet.graphs.filter(graph => npcIds.includes(graph.npcId as never)).map(graph => graph.generation)).toEqual(npcIds.map(() => GENERATIONS - 1));
  }, 1_800_000);

  it("keeps the living history loop with all four merchants free of graph failures", async () => {
    await runCycles();
    const db = await getDb();
    if (!db) throw new Error("DB_REQUIRED");
    for (const npcId of npcIds) {
      const head = await db.transaction(tx => readVerifiedNpcSemanticGraphV2(tx, npcId));
      const audit = await db.transaction(tx => verifyNpcSemanticGraphChainV2(tx, npcId));
      expect(audit.headGraphHash).toBe(head?.graph.graphHash);
      expect(audit.bodies).toBe(1);
    }
  }, 600_000);

  it("serves the same verified packet from a fresh process without any warm cache", async () => {
    for (const hubId of LIVING_HISTORY_HUBS) await recordGenerations(npcIdentity(hubId), hubId, 24);
    const inProcess = await readConfirmedNpcSemanticGraphPacket(7);
    const output = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e",
      'import {readConfirmedNpcSemanticGraphPacket} from "./server/wasdSemanticGraphV2Persistence.ts";const p=await readConfirmedNpcSemanticGraphPacket(7);process.stdout.write(JSON.stringify(p));process.exit(0);',
    ], { cwd: process.cwd(), env: process.env, encoding: "utf8", timeout: 60_000 });
    expect(JSON.parse(output)).toEqual(JSON.parse(JSON.stringify(inProcess)));
  }, 600_000);

  it("verifies the head without walking the chain, while the full audit still detects a corrupted old generation", async () => {
    const npcId = npcIds[0];
    await recordGenerations(npcId, LIVING_HISTORY_HUBS[0], 24);
    const [middle] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM aurionSemanticGraphReceiptsV2 WHERE npcId=? AND generation=?", [npcId, 12]);
    // Corrupt one old envelope inside this isolated database only (receipts are append-only).
    const [[trigger]] = await pool.query<RowDataPacket[]>("SHOW CREATE TRIGGER aurionSemanticGraphReceiptsV2_no_update") as unknown as [RowDataPacket[]];
    await pool.query("DROP TRIGGER aurionSemanticGraphReceiptsV2_no_update");
    try { await pool.query("UPDATE aurionSemanticGraphReceiptsV2 SET receiptHash=? WHERE id=?", ["0".repeat(64), middle[0].id]); }
    finally { await pool.query(String(trigger["SQL Original Statement"])); }

    const db = await getDb();
    if (!db) throw new Error("DB_REQUIRED");
    const head = await db.transaction(tx => readVerifiedNpcSemanticGraphV2(tx, npcId));
    expect(head?.graph.generation).toBe(23);
    await expect(db.transaction(tx => verifyNpcSemanticGraphChainV2(tx, npcId))).rejects.toThrow("NPC_SEMANTIC_GRAPH_V2_RECEIPT_HASH_MISMATCH");
  }, 600_000);
});
