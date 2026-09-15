import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "./db";
import { 
  aurionNpcDecisionReceipts, 
  aurionSemanticMemoryReceipts, 
  aurionSemanticNodes, 
  aurionSemanticProvenance, 
  aurionSemanticRetrievalIndex 
} from "../drizzle/schema";
import { 
  appendSemanticMemoryGraph, 
  querySemanticGraph, 
  verifySemanticGraphProvenance 
} from "./wasdSemanticGraphPersistence";
import { 
  npcAuthority, 
  npcHash, 
  createNpcMemoryV4, 
  stableCatalogStringify, 
  type NpcMemoryV4, 
  type NpcSemanticFact 
} from "./wasdNpcCapsule";

const suite = process.env.AURION_NPC_E2E === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const npcId = "aim294:semantic-npc";
const GENESIS_HASH = "0".repeat(64);

suite("AIM-294 transactional semantic memory graph persistence & query", () => {
  let pool: Pool;
  let isolated = false;

  async function cleanup() {
    if (!isolated) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    // Ensure clean slate
    await pool.query("DELETE FROM aurionSemanticRetrievalIndex WHERE npcId = ?", [npcId]);
    await pool.query("DELETE FROM aurionSemanticProvenance WHERE factId LIKE ?", [`${npcId}:%`]);
    await pool.query("DELETE FROM aurionSemanticNodes WHERE npcId = ?", [npcId]);
    await pool.query("DELETE FROM aurionSemanticMemoryReceipts WHERE npcId = ?", [npcId]);
    await pool.query("DELETE FROM aurionNpcDecisionReceipts WHERE npcId = ?", [npcId]);
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) {
      throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    }
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (rows[0]?.name !== url.pathname.slice(1)) {
      throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    }
    isolated = true;
  });

  beforeEach(cleanup);

  afterAll(async () => {
    if (pool) {
      if (isolated) await cleanup();
      await pool.end();
    }
  });

  const makeDecisionRow = (id: string, resolutionIndex: number, decisionHash: string) => ({
    id,
    npcId,
    regionId: "observatory_threshold",
    resolutionIndex,
    observationIdsJson: JSON.stringify({
      receiptId: id,
      receiptSha256: npcHash(["payload", id]),
      decisionHash,
      logicalIndex: resolutionIndex,
      authority: npcAuthority()
    }),
    goal: "seek_safety" as const,
    decisionHash,
    createdAt: new Date()
  });

  const makeSemanticFact = (factId: string, predicate: "selected_goal" | "current_hub", value: string, receiptId: string, resolutionIndex: number, status: "active" | "expired" | "conflicted" = "active"): NpcSemanticFact => ({
    id: factId,
    subjectId: npcId,
    predicate,
    value,
    version: "wasd-npc-fact.v1",
    validFromIndex: resolutionIndex,
    validUntilIndex: resolutionIndex + 10,
    status,
    conflictsWith: [],
    provenance: [{
      receiptId,
      receiptSha256: npcHash(["payload", receiptId]),
      decisionHash: npcHash(["decision", receiptId]),
      logicalIndex: resolutionIndex,
      authority: npcAuthority()
    }]
  });

  it("successfully persists semantic graph nodes/edges and reconstructs retrieval index", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");

    const decisionId = `dec_${npcHash(["test-decision-1", npcId]).slice(0, 56)}`;
    const decisionRow = makeDecisionRow(decisionId, 10, npcHash(["dec-hash-1"]));

    // Save mock source decision first (to satisfy provenance causality)
    await db.insert(aurionNpcDecisionReceipts).values(decisionRow);

    const memory = createNpcMemoryV4(npcId);
    const fact1 = makeSemanticFact(`${npcId}:fact-1`, "selected_goal", "seek_safety", decisionId, 10);
    const fact2 = makeSemanticFact(`${npcId}:fact-2`, "current_hub", "observatory_threshold", decisionId, 10);
    
    const mutableMemory = {
      ...memory,
      semantic: [fact1, fact2],
      memoryHash: npcHash(["memory-state-1"])
    };

    // Append graph via persistence function
    const result = await db.transaction(async (tx) => {
      return appendSemanticMemoryGraph(tx, decisionRow, mutableMemory, null, GENESIS_HASH);
    });

    expect(result.receipt.npcId).toBe(npcId);
    expect(result.receipt.resolutionIndex).toBe(10);
    expect(result.nodes).toHaveLength(2);

    // Verify retrieval index was reconstructed correctly with scores
    const queryResult = await querySemanticGraph({ npcId, limit: 10 });
    expect(queryResult.nodes).toHaveLength(2);
    expect(queryResult.nodes.find(n => n.predicate === "selected_goal")?.score).toBe(100);
    expect(queryResult.nodes.find(n => n.predicate === "current_hub")?.score).toBe(100);
  });

  it("retains the same stable WASD fact id across consecutive immutable graph receipts", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");

    const stableFactId = `${npcId}:stable-current-hub`;
    const firstDecisionId = `dec_${npcHash(["stable-fact-1", npcId]).slice(0, 56)}`;
    const secondDecisionId = `dec_${npcHash(["stable-fact-2", npcId]).slice(0, 56)}`;
    const firstDecision = makeDecisionRow(firstDecisionId, 40, npcHash(["stable-fact-decision-1"]));
    const secondDecision = makeDecisionRow(secondDecisionId, 41, npcHash(["stable-fact-decision-2"]));
    await db.insert(aurionNpcDecisionReceipts).values([firstDecision, secondDecision]);

    const base = createNpcMemoryV4(npcId);
    const first = await db.transaction(async tx => appendSemanticMemoryGraph(
      tx,
      firstDecision,
      { ...base, semantic: [makeSemanticFact(stableFactId, "current_hub", "observatory_threshold", firstDecisionId, 40)] },
      null,
      GENESIS_HASH,
    ));
    const second = await db.transaction(async tx => appendSemanticMemoryGraph(
      tx,
      secondDecision,
      { ...base, semantic: [makeSemanticFact(stableFactId, "current_hub", "observatory_threshold", secondDecisionId, 41)] },
      first.receipt.id,
      first.receipt.graphHash,
    ));

    expect(first.receipt.id).not.toBe(second.receipt.id);
    const nodes = await db.select().from(aurionSemanticNodes).where(eq(aurionSemanticNodes.id, stableFactId));
    expect(nodes).toHaveLength(2);
    expect(new Set(nodes.map(node => node.graphReceiptId))).toEqual(new Set([first.receipt.id, second.receipt.id]));
    const provenance = await db.select().from(aurionSemanticProvenance).where(eq(aurionSemanticProvenance.factId, stableFactId));
    expect(provenance).toHaveLength(2);
    const projected = await querySemanticGraph({ npcId, predicate: "current_hub", limit: 10 });
    expect(projected.nodes).toHaveLength(1);
    expect(projected.nodes[0].id).toBe(stableFactId);
  });

  it("strictly fails validation (AIM-293 causality) if semantic facts refer to unverified/missing provenance receipts", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");

    const decisionId = `dec_${npcHash(["unregistered-decision", npcId]).slice(0, 56)}`;
    const decisionRow = makeDecisionRow(decisionId, 10, npcHash(["dec-hash-unreg"]));

    // We purposely do NOT insert the decision row into aurionNpcDecisionReceipts.

    const memory = createNpcMemoryV4(npcId);
    const fact = makeSemanticFact(`${npcId}:fact-unreg`, "selected_goal", "seek_safety", decisionId, 10);
    const mutableMemory = {
      ...memory,
      semantic: [fact]
    };

    // Attempting to append must fail with provenance error
    await expect(db.transaction(async (tx) => {
      return appendSemanticMemoryGraph(tx, decisionRow, mutableMemory, null, GENESIS_HASH);
    })).rejects.toThrow("SEMANTIC_GRAPH_PROVENANCE_MISSING_RECEIPTS");
  });

  it("atomically rolls back the entire semantic memory graph insert on sub-step failures", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");

    const decisionId = `dec_${npcHash(["rollback-decision", npcId]).slice(0, 56)}`;
    const decisionRow = makeDecisionRow(decisionId, 20, npcHash(["dec-hash-rb"]));
    await db.insert(aurionNpcDecisionReceipts).values(decisionRow);

    const memory = createNpcMemoryV4(npcId);
    const fact = makeSemanticFact(`${npcId}:fact-rb`, "selected_goal", "seek_safety", decisionId, 20);
    const mutableMemory = {
      ...memory,
      semantic: [fact]
    };

    // We force a failure inside the transaction by throwing an error right after appendSemanticMemoryGraph
    await expect(db.transaction(async (tx) => {
      await appendSemanticMemoryGraph(tx, decisionRow, mutableMemory, null, GENESIS_HASH);
      throw new Error("FORCED_TRANSACTION_ROLLBACK");
    })).rejects.toThrow("FORCED_TRANSACTION_ROLLBACK");

    // Verify absolutely nothing was persisted in receipts, nodes, or retrieval index
    const receipts = await db.select().from(aurionSemanticMemoryReceipts).where(eq(aurionSemanticMemoryReceipts.npcId, npcId));
    expect(receipts).toHaveLength(0);

    const nodes = await db.select().from(aurionSemanticNodes).where(eq(aurionSemanticNodes.npcId, npcId));
    expect(nodes).toHaveLength(0);

    const indexRows = await db.select().from(aurionSemanticRetrievalIndex).where(eq(aurionSemanticRetrievalIndex.npcId, npcId));
    expect(indexRows).toHaveLength(0);
  });

  it("supports deterministic cursor-based pagination and score-based sorting (active > expired > conflicted)", async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not initialized");

    const decisionId = `dec_${npcHash(["paging-decision", npcId]).slice(0, 56)}`;
    const decisionRow = makeDecisionRow(decisionId, 30, npcHash(["dec-hash-paging"]));
    await db.insert(aurionNpcDecisionReceipts).values(decisionRow);

    const memory = createNpcMemoryV4(npcId);
    // 3 facts with different statuses (hence different deterministic scores: active=100, expired=50, conflicted=0)
    const fact1 = makeSemanticFact(`${npcId}:fact-active`, "selected_goal", "seek_safety", decisionId, 30, "active");
    const fact2 = makeSemanticFact(`${npcId}:fact-expired`, "selected_goal", "gather_resources", decisionId, 30, "expired");
    const fact3 = makeSemanticFact(`${npcId}:fact-conflicted`, "selected_goal", "socialize", decisionId, 30, "conflicted");

    const mutableMemory = {
      ...memory,
      semantic: [fact1, fact2, fact3]
    };

    await db.transaction(async (tx) => {
      return appendSemanticMemoryGraph(tx, decisionRow, mutableMemory, null, GENESIS_HASH);
    });

    // Query with limit = 1 to test pagination
    const page1 = await querySemanticGraph({ npcId, limit: 1 });
    expect(page1.nodes).toHaveLength(1);
    expect(page1.nodes[0].score).toBe(100); // active has highest score
    expect(page1.nextCursor).not.toBeNull();

    // Query second page using the cursor
    const page2 = await querySemanticGraph({ npcId, limit: 1, cursor: page1.nextCursor! });
    expect(page2.nodes).toHaveLength(1);
    expect(page2.nodes[0].score).toBe(50); // expired has second highest score
    expect(page2.nextCursor).not.toBeNull();

    // Query third page
    const page3 = await querySemanticGraph({ npcId, limit: 1, cursor: page2.nextCursor! });
    expect(page3.nodes).toHaveLength(1);
    expect(page3.nodes[0].score).toBe(0); // conflicted has lowest score
  });
});
