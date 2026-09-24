import { and, desc, eq } from "drizzle-orm";
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

function computeStoredReceiptHash(input: Omit<StoredWorldDirectorReceipt, "receiptHash">): string {
  return canonicalSha256(input);
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

export async function readLatestWorldDirectorReceipt(worldId: string, zoneId: string): Promise<StoredWorldDirectorReceipt | null> {
  const db = await getDb();
  if (!db) throw new Error("CAUSAL_DATABASE_UNAVAILABLE");
  const [row] = await db.select().from(aurionWorldDirectorReceipts)
    .where(and(eq(aurionWorldDirectorReceipts.worldId, worldId), eq(aurionWorldDirectorReceipts.zoneId, zoneId)))
    .orderBy(desc(aurionWorldDirectorReceipts.logicalTick)).limit(1);
  if (!row) return null;
  const stored = row as StoredWorldDirectorReceipt;
  verifyStoredReceipt(stored);
  return stored;
}
