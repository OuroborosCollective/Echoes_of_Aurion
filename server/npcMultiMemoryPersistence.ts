import { and, desc, eq, inArray } from "drizzle-orm";
import { aurionNpcDecisionReceipts, aurionNpcMemoryReceiptsV4, aurionNpcStates } from "../drizzle/schema";
import { getDb } from "./db";
import { commitNpcMemoryV4, createNpcMemoryV4, npcHash, npcMemoryReceiptIds, parseNpcMemoryV4, projectNpcMemoryV4,
  stableCatalogStringify, verifyConfirmedNpcDecision, verifyNpcMemoryEvidence, type NpcMemoryV4 } from "./wasdNpcCapsule";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type NpcTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type MemoryRow = typeof aurionNpcMemoryReceiptsV4.$inferSelect;
type DecisionRow = typeof aurionNpcDecisionReceipts.$inferSelect;
const RECEIPT_VERSION = "aurion-npc-memory-receipt.v4";
const GENESIS_HASH = "0".repeat(64);
const storageId = (sourceId: string) => `npm4_${npcHash([RECEIPT_VERSION,sourceId]).slice(0,58)}`;

function payload(row: Omit<MemoryRow,"createdAt">) {
  return { version:RECEIPT_VERSION, npcId:row.npcId, resolutionIndex:row.resolutionIndex,
    sourceDecisionReceiptId:row.sourceDecisionReceiptId, sourceDecisionSha256:row.sourceDecisionSha256,
    sourceRevision:row.sourceRevision, sourceSha256:row.sourceSha256, ruleSetVersion:row.ruleSetVersion,
    previousReceiptId:row.previousReceiptId, previousMemoryHash:row.previousMemoryHash,
    memoryHash:row.memoryHash, memoryJson:row.memoryJson };
}

/** Storage envelope verification only. All memory semantics are checked by the WASD capsule. */
function decodeMemoryRow(row: MemoryRow): NpcMemoryV4 {
  const memory = parseNpcMemoryV4(row.memoryJson);
  if (row.id !== storageId(row.sourceDecisionReceiptId) || row.receiptHash !== npcHash(payload(row)) ||
      row.npcId !== memory.npcId || row.resolutionIndex !== memory.lastResolutionIndex ||
      row.memoryHash !== memory.memoryHash || row.sourceDecisionReceiptId !== memory.lastReceiptId ||
      row.sourceDecisionSha256 !== memory.seenReceipts[0]?.receiptSha256 ||
      row.sourceRevision !== memory.authority.sourceRevision || row.sourceSha256 !== memory.authority.sourceSha256 ||
      row.ruleSetVersion !== memory.authority.rulesetVersion) throw new Error("NPC_MEMORY_V4_STORED_CONTENT_CORRUPT");
  return memory;
}

export type ConfirmedNpcMultiMemory = Readonly<{ row: MemoryRow; memory: NpcMemoryV4 }>;

async function verifiedReadback(tx: NpcTransaction, row: MemoryRow): Promise<ConfirmedNpcMultiMemory> {
  const memory = decodeMemoryRow(row);
  if (row.previousReceiptId) {
    const previous = (await tx.select().from(aurionNpcMemoryReceiptsV4).where(eq(aurionNpcMemoryReceiptsV4.id,row.previousReceiptId)).limit(1))[0];
    if (!previous || previous.npcId !== row.npcId || previous.resolutionIndex >= row.resolutionIndex ||
        decodeMemoryRow(previous).memoryHash !== row.previousMemoryHash) throw new Error("NPC_MEMORY_V4_CHAIN_INVALID");
  } else if (row.previousMemoryHash !== GENESIS_HASH) throw new Error("NPC_MEMORY_V4_GENESIS_INVALID");
  const ids = npcMemoryReceiptIds(memory);
  const sources = await tx.select().from(aurionNpcDecisionReceipts).where(and(eq(aurionNpcDecisionReceipts.npcId,row.npcId),inArray(aurionNpcDecisionReceipts.id,[...ids]))).limit(ids.length+1);
  const verified = sources.map(source=>verifyConfirmedNpcDecision(source.observationIdsJson,{...source,receiptId:source.id}));
  return Object.freeze({row:Object.freeze(row),memory:verifyNpcMemoryEvidence(memory,verified)});
}

/** Historical retries return their own sidecar; old v2/v3 receipts are never backfilled implicitly. */
export async function readNpcMultiMemoryForDecision(tx: NpcTransaction, sourceId: string): Promise<ConfirmedNpcMultiMemory | null> {
  const row = (await tx.select().from(aurionNpcMemoryReceiptsV4).where(eq(aurionNpcMemoryReceiptsV4.sourceDecisionReceiptId,sourceId)).limit(1))[0];
  return row ? verifiedReadback(tx,row) : null;
}

/** Called while the existing NPC state row is locked. A post-cutover gap fails closed. */
export async function readPreviousNpcMultiMemory(tx: NpcTransaction, npcId: string, lastIndex: number): Promise<ConfirmedNpcMultiMemory | null> {
  const row = (await tx.select().from(aurionNpcMemoryReceiptsV4).where(eq(aurionNpcMemoryReceiptsV4.npcId,npcId)).orderBy(desc(aurionNpcMemoryReceiptsV4.resolutionIndex)).limit(1))[0];
  if (!row) return null;
  if (row.resolutionIndex !== lastIndex) throw new Error("NPC_MEMORY_V4_STATE_GAP");
  return verifiedReadback(tx,row);
}

/** Persist and read back the WASD reducer output in the caller's same NPC transaction. */
export async function appendNpcMultiMemory(tx: NpcTransaction, source: DecisionRow, previous: ConfirmedNpcMultiMemory | null): Promise<ConfirmedNpcMultiMemory> {
  const confirmed = verifyConfirmedNpcDecision(source.observationIdsJson,{...source,receiptId:source.id});
  const result = commitNpcMemoryV4(previous?.memory ?? createNpcMemoryV4(source.npcId),confirmed);
  if (result.status !== "committed") throw new Error("NPC_MEMORY_V4_NEW_COMMIT_REQUIRED");
  const memory = result.memory;
  const row = { id:storageId(source.id), npcId:source.npcId, resolutionIndex:source.resolutionIndex,
    sourceDecisionReceiptId:source.id, sourceDecisionSha256:confirmed.receiptSha256,
    sourceRevision:memory.authority.sourceRevision, sourceSha256:memory.authority.sourceSha256, ruleSetVersion:memory.authority.rulesetVersion,
    previousReceiptId:previous?.row.id ?? null, previousMemoryHash:previous?.memory.memoryHash ?? GENESIS_HASH,
    memoryHash:memory.memoryHash, memoryJson:stableCatalogStringify(memory), receiptHash:"" };
  row.receiptHash = npcHash(payload(row));
  await tx.insert(aurionNpcMemoryReceiptsV4).values(row);
  const stored = (await tx.select().from(aurionNpcMemoryReceiptsV4).where(eq(aurionNpcMemoryReceiptsV4.id,row.id)).limit(1))[0];
  if (!stored || stored.receiptHash !== row.receiptHash || stored.memoryJson !== row.memoryJson) throw new Error("NPC_MEMORY_V4_READBACK_MISMATCH");
  return verifiedReadback(tx,stored);
}

/** Separate v4 evidence readback; the legacy snapshot's serialized bytes stay unchanged. */
export async function readConfirmedNpcMultiMemory(npcId: string): Promise<NpcMemoryV4 | null> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(npcId)) throw new Error("NPC_ID_INVALID");
  const db = await getDb(); if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx=>{
    const current = (await tx.select().from(aurionNpcStates).where(eq(aurionNpcStates.npcId,npcId)).limit(1))[0];
    if (!current || current.lastResolutionIndex<0) return null;
    return (await readPreviousNpcMultiMemory(tx,npcId,current.lastResolutionIndex))?.memory ?? null;
  });
}

const visibleNpcs = ["lyra","orun","ax1_merchant_observatory_threshold","ax1_merchant_windhollow","ax1_merchant_emberfall","ax1_merchant_cinder_vault"] as const;
/** Authenticated, bounded presentation projection. No authoring or gameplay mutation endpoint. */
export async function readConfirmedNpcMultiMemoryPacket(userId: number) {
  if (!Number.isSafeInteger(userId) || userId<1) throw new Error("NPC_PACKET_OWNER_INVALID");
  const db = await getDb(); if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx=>{
    const states = await tx.select().from(aurionNpcStates).where(inArray(aurionNpcStates.npcId,[...visibleNpcs])).limit(visibleNpcs.length);
    const npcs = [];
    for (const state of states.sort((a,b)=>a.npcId<b.npcId?-1:a.npcId>b.npcId?1:0)) {
      if (state.lastResolutionIndex<0) continue;
      const confirmed = await readPreviousNpcMultiMemory(tx,state.npcId,state.lastResolutionIndex);
      if (confirmed) npcs.push(projectNpcMemoryV4(confirmed.memory));
    }
    return Object.freeze({userId,format:"aurion-public-npc-memory.v4" as const,npcs:Object.freeze(npcs)});
  });
}
