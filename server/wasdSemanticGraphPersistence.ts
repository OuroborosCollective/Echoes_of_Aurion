import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { aurionNpcDecisionReceipts, aurionSemanticMemoryReceipts, aurionSemanticNodes, aurionSemanticProvenance, aurionSemanticRetrievalIndex } from "../drizzle/schema";
import { getDb } from "./db";
import { npcAuthority, npcHash, parseNpcMemoryV4, stableCatalogStringify, verifyConfirmedNpcDecision, type NpcMemoryV4, type NpcSemanticFact } from "./wasdNpcCapsule";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type NpcTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

const GRAPH_RECEIPT_VERSION = "aurion-semantic-memory-receipt.v1";
const GENESIS_HASH = "0".repeat(64);

const storageReceiptId = (sourceId: string) => 
  `sgre_${npcHash([GRAPH_RECEIPT_VERSION, sourceId]).slice(0, 58)}`;

export type ConfirmedSemanticMemoryGraph = Readonly<{
  receipt: typeof aurionSemanticMemoryReceipts.$inferSelect;
  nodes: readonly (typeof aurionSemanticNodes.$inferSelect)[];
}>;

/**
 * Validates the semantic graph structure and verifies full provenance for every node/edge.
 * Enforces AIM-293 causality: outcomes are rejected if their source decision receipts are missing or unverified.
 */
export async function verifySemanticGraphProvenance(tx: NpcTransaction, npcId: string, semanticFacts: readonly NpcSemanticFact[]): Promise<void> {
  const receiptIds = Array.from(new Set(semanticFacts.flatMap(f => f.provenance.map(p => p.receiptId))));
  if (receiptIds.length === 0) return;

  const sources = await tx.select().from(aurionNpcDecisionReceipts)
    .where(and(
      eq(aurionNpcDecisionReceipts.npcId, npcId),
      inArray(aurionNpcDecisionReceipts.id, receiptIds)
    ));

  if (sources.length !== receiptIds.length) {
    throw new Error("SEMANTIC_GRAPH_PROVENANCE_MISSING_RECEIPTS");
  }

  for (const source of sources) {
    // This validates signature, hashes, ruleset identity, and integrity of the source decision
    verifyConfirmedNpcDecision(source.observationIdsJson, { ...source, receiptId: source.id });
  }
}

/**
 * Persists the semantic graph state during an atomic NPC memory update.
 * Enforces transactional consistency: if any insert fails, the entire transaction is rolled back.
 */
export async function appendSemanticMemoryGraph(
  tx: NpcTransaction,
  source: typeof aurionNpcDecisionReceipts.$inferSelect,
  memory: NpcMemoryV4,
  previousReceiptId: string | null,
  previousGraphHash: string
): Promise<ConfirmedSemanticMemoryGraph> {
  // 1. Enforce capsule authority pin validation
  const authority = npcAuthority();
  if (memory.authority.sourceRevision !== authority.sourceRevision || 
      memory.authority.sourceSha256 !== authority.sourceSha256) {
    throw new Error("WASD_NPC_RUNTIME_SOURCE_MISMATCH");
  }

  // 2. Validate full provenance of the graph facts
  await verifySemanticGraphProvenance(tx, source.npcId, memory.semantic);

  // 3. Compute deterministic graph hash using stable WASD catalog stringifier
  const graphHash = npcHash(stableCatalogStringify(memory.semantic));
  const receiptId = storageReceiptId(source.id);

  // 4. Check for existing receipt (idempotency support)
  const existing = (await tx.select().from(aurionSemanticMemoryReceipts)
    .where(eq(aurionSemanticMemoryReceipts.id, receiptId)).limit(1))[0];

  if (existing) {
    if (existing.graphHash !== graphHash || existing.npcId !== source.npcId) {
      throw new Error("SEMANTIC_GRAPH_RECEIPT_CONFLICT");
    }
    const nodes = await tx.select().from(aurionSemanticNodes)
      .where(eq(aurionSemanticNodes.graphReceiptId, receiptId));
    return Object.freeze({ receipt: existing, nodes: Object.freeze(nodes) });
  }

  // 5. Build and insert the graph receipt
  const receiptRow = {
    id: receiptId,
    npcId: source.npcId,
    resolutionIndex: source.resolutionIndex,
    graphVersion: memory.version,
    sourceDecisionReceiptId: source.id,
    sourceDecisionSha256: source.decisionHash,
    sourceRevision: authority.sourceRevision,
    sourceSha256: authority.sourceSha256,
    previousReceiptId: previousReceiptId,
    previousGraphHash: previousGraphHash || GENESIS_HASH,
    graphHash: graphHash,
    receiptHash: ""
  };

  const payloadStr = JSON.stringify({
    id: receiptRow.id,
    npcId: receiptRow.npcId,
    resolutionIndex: receiptRow.resolutionIndex,
    graphVersion: receiptRow.graphVersion,
    sourceDecisionReceiptId: receiptRow.sourceDecisionReceiptId,
    sourceDecisionSha256: receiptRow.sourceDecisionSha256,
    sourceRevision: receiptRow.sourceRevision,
    sourceSha256: receiptRow.sourceSha256,
    previousReceiptId: receiptRow.previousReceiptId,
    previousGraphHash: receiptRow.previousGraphHash,
    graphHash: receiptRow.graphHash
  });
  receiptRow.receiptHash = npcHash(payloadStr);

  await tx.insert(aurionSemanticMemoryReceipts).values(receiptRow);

  // 6. Insert semantic nodes
  for (const fact of memory.semantic) {
    const nodeRow = {
      id: fact.id,
      graphReceiptId: receiptId,
      npcId: source.npcId,
      subjectId: fact.subjectId,
      predicate: fact.predicate,
      value: fact.value,
      factVersion: fact.version,
      validFromIndex: fact.validFromIndex,
      validUntilIndex: fact.validUntilIndex,
      status: fact.status,
      conflictsWithJson: JSON.stringify(fact.conflictsWith)
    };
    await tx.insert(aurionSemanticNodes).values(nodeRow);

    // 7. Insert node provenance
    for (const prov of fact.provenance) {
      const provId = npcHash([fact.id, prov.receiptId, String(prov.logicalIndex)]).slice(0, 128);
      const provRow = {
        id: provId,
        factId: fact.id,
        receiptId: prov.receiptId,
        receiptSha256: prov.receiptSha256,
        decisionHash: prov.decisionHash,
        logicalIndex: prov.logicalIndex,
        sourceRevision: prov.authority.sourceRevision,
        sourceSha256: prov.authority.sourceSha256
      };
      await tx.insert(aurionSemanticProvenance).ignore().values(provRow);
    }
  }

  // 8. Reconstruct/rebuild the materialized retrieval index for this NPC
  await rebuildRetrievalIndex(tx, source.npcId);

  // 9. Exact DB readback verification
  const readbackReceipt = (await tx.select().from(aurionSemanticMemoryReceipts)
    .where(eq(aurionSemanticMemoryReceipts.id, receiptId)).limit(1))[0];
  if (!readbackReceipt || readbackReceipt.receiptHash !== receiptRow.receiptHash) {
    throw new Error("SEMANTIC_GRAPH_READBACK_MISMATCH");
  }

  const nodes = await tx.select().from(aurionSemanticNodes)
    .where(eq(aurionSemanticNodes.graphReceiptId, receiptId));

  return Object.freeze({ receipt: readbackReceipt, nodes: Object.freeze(nodes) });
}

/**
 * Reconstructs the search/retrieval index deterministically from the latest semantic nodes.
 */
export async function rebuildRetrievalIndex(tx: NpcTransaction, npcId: string): Promise<void> {
  // Find the latest graph receipt for this NPC
  const latestReceipt = (await tx.select().from(aurionSemanticMemoryReceipts)
    .where(eq(aurionSemanticMemoryReceipts.npcId, npcId))
    .orderBy(desc(aurionSemanticMemoryReceipts.resolutionIndex)).limit(1))[0];

  if (!latestReceipt) {
    await tx.delete(aurionSemanticRetrievalIndex)
      .where(eq(aurionSemanticRetrievalIndex.npcId, npcId));
    return;
  }

  // Fetch all nodes for this receipt
  const nodes = await tx.select().from(aurionSemanticNodes)
    .where(eq(aurionSemanticNodes.graphReceiptId, latestReceipt.id));

  // Remove stale index entries
  await tx.delete(aurionSemanticRetrievalIndex)
    .where(eq(aurionSemanticRetrievalIndex.npcId, npcId));

  // Re-insert index records with deterministic scores
  for (const node of nodes) {
    const indexId = `idx_${npcHash([npcId, node.subjectId, node.predicate, node.value]).slice(0, 120)}`;
    const score = node.status === "active" ? 100 : node.status === "expired" ? 50 : 0;

    await tx.insert(aurionSemanticRetrievalIndex).values({
      id: indexId,
      npcId: npcId,
      subjectId: node.subjectId,
      predicate: node.predicate,
      value: node.value,
      status: node.status,
      validFromIndex: node.validFromIndex,
      validUntilIndex: node.validUntilIndex,
      score: score
    }).onDuplicateKeyUpdate({
      set: {
        status: node.status,
        validFromIndex: node.validFromIndex,
        validUntilIndex: node.validUntilIndex,
        score: score
      }
    });
  }
}

export type SemanticGraphQuery = {
  npcId: string;
  subjectId?: string;
  predicate?: string;
  value?: string;
  status?: "active" | "expired" | "conflicted";
  limit?: number;
  cursor?: string;
};

export type SemanticGraphQueryResult = {
  nodes: {
    id: string;
    subjectId: string;
    predicate: string;
    value: string;
    status: string;
    validFromIndex: number;
    validUntilIndex: number;
    score: number;
  }[];
  nextCursor: string | null;
};

/**
 * Deterministic query API projection for AX1/UI.
 * Enforces pagination, stable sorting (score DESC, id ASC), and server-side safety boundaries.
 */
export async function querySemanticGraph(query: SemanticGraphQuery): Promise<SemanticGraphQueryResult> {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");

  const limit = Math.min(100, Math.max(1, query.limit || 20));
  
  const conditions = [eq(aurionSemanticRetrievalIndex.npcId, query.npcId)];
  if (query.subjectId) conditions.push(eq(aurionSemanticRetrievalIndex.subjectId, query.subjectId));
  if (query.predicate) conditions.push(eq(aurionSemanticRetrievalIndex.predicate, query.predicate));
  if (query.value) conditions.push(eq(aurionSemanticRetrievalIndex.value, query.value));
  if (query.status) conditions.push(eq(aurionSemanticRetrievalIndex.status, query.status));

  // Cursor parsing
  let cursorScore: number | null = null;
  let cursorId: string | null = null;
  if (query.cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(query.cursor, "base64").toString("utf8"));
      if (typeof decoded.score === "number" && typeof decoded.id === "string") {
        cursorScore = decoded.score;
        cursorId = decoded.id;
      }
    } catch {
      // Ignore malformed cursors
    }
  }

  if (cursorScore !== null && cursorId !== null) {
    conditions.push(or(
      sql`${aurionSemanticRetrievalIndex.score} < ${cursorScore}`,
      and(
        eq(aurionSemanticRetrievalIndex.score, cursorScore),
        sql`${aurionSemanticRetrievalIndex.id} > ${cursorId}`
      )
    )!);
  }

  const results = await db.select()
    .from(aurionSemanticRetrievalIndex)
    .where(and(...conditions))
    .orderBy(desc(aurionSemanticRetrievalIndex.score), aurionSemanticRetrievalIndex.id)
    .limit(limit + 1);

  const hasMore = results.length > limit;
  const nodes = results.slice(0, limit).map(r => ({
    id: r.id,
    subjectId: r.subjectId,
    predicate: r.predicate,
    value: r.value,
    status: r.status,
    validFromIndex: r.validFromIndex,
    validUntilIndex: r.validUntilIndex,
    score: r.score
  }));

  let nextCursor: string | null = null;
  if (hasMore && nodes.length > 0) {
    const lastNode = nodes[nodes.length - 1];
    nextCursor = Buffer.from(JSON.stringify({ score: lastNode.score, id: lastNode.id }), "utf8").toString("base64");
  }

  return { nodes, nextCursor };
}
