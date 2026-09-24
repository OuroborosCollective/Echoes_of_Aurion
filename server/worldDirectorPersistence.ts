import { and, desc, eq, lt } from "drizzle-orm";
import { aurionWorldDirectorReceipts } from "../drizzle/schema";
import { getDb } from "./db";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import type { WorldDirectorDecision } from "../shared/worldPressureProtocol";

export type StoredWorldDirectorReceipt = Readonly<{
  id: string;
  schemaVersion: string;
  worldId: string;
  worldEpoch: number;
  zoneId: string;
  logicalTick: number;
  sourceRevision: string;
  sourceRootHash: string;
  causalReceiptHash: string;
  seedDigest: string;
  previousReceiptHash: string | null;
  candidateSetHash: string;
  decisionHash: string;
  rulesetVersion: string;
  decisionJson: string;
  receiptHash: string;
}>;

function receiptId(decision: WorldDirectorDecision, zoneId: string): string {
  return `wdr_${canonicalSha256({
    worldId: decision.worldId,
    zoneId,
    logicalTick: decision.logicalTick,
    sourceRevision: decision.sourceRevision,
  }).slice(7, 63)}`;
}

function storedReceiptHashPayload(row: StoredWorldDirectorReceipt | Record<string, any>) {
  return {
    id: row.id,
    schemaVersion: row.schemaVersion,
    worldId: row.worldId,
    worldEpoch: row.worldEpoch,
    zoneId: row.zoneId,
    logicalTick: row.logicalTick,
    sourceRevision: row.sourceRevision,
    sourceRootHash: row.sourceRootHash,
    causalReceiptHash: row.causalReceiptHash,
    seedDigest: row.seedDigest,
    previousReceiptHash: row.previousReceiptHash ?? null,
    candidateSetHash: row.candidateSetHash,
    decisionHash: row.decisionHash,
    rulesetVersion: row.rulesetVersion,
    decisionJson: row.decisionJson,
  };
}

function computeStoredReceiptHash(input: StoredWorldDirectorReceipt | Record<string, unknown>): string {
  return canonicalSha256(storedReceiptHashPayload(input));
}

function verifyStoredReceipt(row: StoredWorldDirectorReceipt): void {
  if (computeStoredReceiptHash(row) !== row.receiptHash) throw new Error("WORLD_DIRECTOR_STORED_RECEIPT_HASH_MISMATCH");
  const decision = JSON.parse(row.decisionJson) as WorldDirectorDecision;
  if (
    decision.decisionHash !== row.decisionHash ||
    decision.sourceRevision !== row.sourceRevision ||
    decision.sourceRootHash !== row.sourceRootHash ||
    decision.causalReceiptHash !== row.causalReceiptHash
  ) throw new Error("WORLD_DIRECTOR_STORED_DECISION_CONFLICT");
}

export async function persistWorldDirectorDecision(input: {
  decision: WorldDirectorDecision;
  zoneId: string;
}): Promise<StoredWorldDirectorReceipt> {
  const db = await getDb();
  if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");

  const id = receiptId(input.decision, input.zoneId);
  const decisionJson = JSON.stringify(input.decision);
  const unsigned = {
    id,
    schemaVersion: input.decision.schemaVersion,
    worldId: input.decision.worldId,
    worldEpoch: input.decision.worldEpoch,
    zoneId: input.zoneId,
    logicalTick: input.decision.logicalTick,
    sourceRevision: input.decision.sourceRevision,
    sourceRootHash: input.decision.sourceRootHash,
    causalReceiptHash: input.decision.causalReceiptHash,
    seedDigest: input.decision.seedDigest,
    previousReceiptHash: input.decision.previousReceiptHash,
    candidateSetHash: input.decision.candidateSetHash,
    decisionHash: input.decision.decisionHash,
    rulesetVersion: input.decision.rulesetVersion,
    decisionJson,
  };
  const row = { ...unsigned, receiptHash: computeStoredReceiptHash(unsigned) };

  try {
    await db.insert(aurionWorldDirectorReceipts).values(row);
  } catch {
    const [existing] = await db.select().from(aurionWorldDirectorReceipts)
      .where(eq(aurionWorldDirectorReceipts.id, id)).limit(1);
    if (!existing) throw new Error("WORLD_DIRECTOR_PERSISTENCE_CONFLICT");
    const stored = existing as StoredWorldDirectorReceipt;
    verifyStoredReceipt(stored);
    if (stored.receiptHash !== row.receiptHash) throw new Error("WORLD_DIRECTOR_PERSISTENCE_CONFLICT");
    return stored;
  }

  const [readback] = await db.select().from(aurionWorldDirectorReceipts)
    .where(eq(aurionWorldDirectorReceipts.id, id)).limit(1);
  if (!readback) throw new Error("WORLD_DIRECTOR_READBACK_FAILED");
  const stored = readback as StoredWorldDirectorReceipt;
  verifyStoredReceipt(stored);
  return stored;
}

export async function readWorldDirectorReceiptAt(worldId: string, zoneId: string, logicalTick: number): Promise<StoredWorldDirectorReceipt | null> {
  const db = await getDb();
  if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
  const [row] = await db.select().from(aurionWorldDirectorReceipts)
    .where(and(
      eq(aurionWorldDirectorReceipts.worldId, worldId),
      eq(aurionWorldDirectorReceipts.zoneId, zoneId),
      eq(aurionWorldDirectorReceipts.logicalTick, logicalTick),
    )).limit(1);
  if (!row) return null;
  const stored = row as StoredWorldDirectorReceipt;
  verifyStoredReceipt(stored);
  return stored;
}

export async function readLatestWorldDirectorReceipt(
  worldId: string,
  zoneId: string,
  beforeLogicalTick?: number,
): Promise<StoredWorldDirectorReceipt | null> {
  const db = await getDb();
  if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
  const conditions = [
    eq(aurionWorldDirectorReceipts.worldId, worldId),
    eq(aurionWorldDirectorReceipts.zoneId, zoneId),
  ];
  if (beforeLogicalTick !== undefined) conditions.push(lt(aurionWorldDirectorReceipts.logicalTick, beforeLogicalTick));
  const [row] = await db.select().from(aurionWorldDirectorReceipts)
    .where(and(...conditions))
    .orderBy(desc(aurionWorldDirectorReceipts.logicalTick)).limit(1);
  if (!row) return null;
  const stored = row as StoredWorldDirectorReceipt;
  verifyStoredReceipt(stored);
  return stored;
}
