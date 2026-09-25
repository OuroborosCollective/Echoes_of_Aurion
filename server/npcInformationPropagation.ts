import { and, desc, eq } from "drizzle-orm";
import { aurionNpcInformationReceipts } from "../drizzle/schema";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { getDb } from "./db";
import type { NpcTransaction } from "./npcMultiMemoryPersistence";
import {
  assertVerifiedNpcInformation,
  communicateNpcInformation,
  createExperiencedNpcInformation,
  isVerifiedConsumableNpcInformation,
  npcInformationReceiptSchema,
  summarizeNpcInformationProvenance,
  transitionNpcInformation,
  type NpcInformationReceipt,
  type NpcInformationSource,
} from "../shared/npcInformationEcologyProtocol";

type InformationRow = typeof aurionNpcInformationReceipts.$inferSelect;

function toRow(value: NpcInformationReceipt) {
  return {
    id: value.id,
    factId: value.factId,
    worldId: value.worldId,
    ownerNpcId: value.ownerNpcId,
    subjectId: value.subjectId,
    predicate: value.predicate,
    value: value.value,
    claimKey: value.claimKey,
    status: value.status,
    confidenceBps: value.confidenceBps,
    witnessNpcId: value.witnessNpcId,
    communicatedByNpcId: value.communicatedByNpcId,
    communicationReceiptId: value.communicationReceiptId,
    relatedFactId: value.relatedFactId,
    sourceKind: value.sourceKind,
    sourceReceiptId: value.sourceReceiptId,
    sourceReceiptHash: value.sourceReceiptHash,
    sourceRevision: value.sourceRevision,
    sourceSha256: value.sourceSha256,
    sourceCausalRoot: value.sourceCausalRoot,
    logicalIndex: value.logicalIndex,
    expiresAtIndex: value.expiresAtIndex,
    previousReceiptId: value.previousReceiptId,
    receiptHash: value.receiptHash,
  };
}

function assertStored(row: InformationRow): NpcInformationReceipt {
  const receipt = npcInformationReceiptSchema.parse(row);
  const { receiptHash, ...unsigned } = receipt;
  const expected = canonicalSha256({
    domain: "aurion.npc-information-receipt.v1",
    value: unsigned,
  }).slice("sha256:".length);
  if (expected !== receiptHash) throw new Error("NPC_INFORMATION_STORED_CONTENT_CORRUPT");
  assertVerifiedNpcInformation(receipt);
  return receipt;
}

export async function appendNpcInformationReceipt(tx: NpcTransaction, receipt: NpcInformationReceipt): Promise<NpcInformationReceipt> {
  const parsed = npcInformationReceiptSchema.parse(receipt);
  await tx.insert(aurionNpcInformationReceipts).values(toRow(parsed));
  const stored = (await tx.select().from(aurionNpcInformationReceipts)
    .where(eq(aurionNpcInformationReceipts.id, parsed.id)).limit(1))[0];
  if (!stored) throw new Error("NPC_INFORMATION_READBACK_REQUIRED");
  return assertStored(stored);
}

async function readReceiptById(tx: NpcTransaction, id: string): Promise<NpcInformationReceipt> {
  const row = (await tx.select().from(aurionNpcInformationReceipts)
    .where(eq(aurionNpcInformationReceipts.id, id)).limit(1))[0];
  if (!row) throw new Error("NPC_INFORMATION_SOURCE_RECEIPT_READBACK_REQUIRED");
  return assertStored(row);
}

export async function recordExperiencedNpcInformation(input: Readonly<{
  worldId: string;
  witnessNpcId: string;
  subjectId: string;
  predicate: string;
  value: string;
  logicalIndex: number;
  expiresAtIndex?: number | null;
  confidenceBps?: number;
  source: NpcInformationSource;
}>): Promise<NpcInformationReceipt> {
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  const receipt = createExperiencedNpcInformation(input);
  return db.transaction(tx => appendNpcInformationReceipt(tx, receipt));
}

export async function recordNpcInformationTransition(input: Readonly<{
  previousReceiptId: string;
  status: NpcInformationReceipt["status"];
  logicalIndex: number;
  confidenceBps: number;
  ownerNpcId?: string;
  communicatedByNpcId?: string | null;
  communicationReceiptId?: string | null;
  relatedFactId?: string | null;
}>): Promise<NpcInformationReceipt> {
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  return db.transaction(async tx => {
    const previous = await readReceiptById(tx, input.previousReceiptId);
    return appendNpcInformationReceipt(tx, transitionNpcInformation(previous, input));
  });
}

export async function recordNpcInformationCommunication(input: Readonly<{
  sourceReceiptId: string;
  receiverNpcId: string;
  logicalIndex: number;
}>): Promise<NpcInformationReceipt> {
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  return db.transaction(async tx => {
    const source = await readReceiptById(tx, input.sourceReceiptId);
    const communication = communicateNpcInformation({
      source,
      receiverNpcId: input.receiverNpcId,
      logicalIndex: input.logicalIndex,
    });
    if (communication.communicationReceiptId) {
      const prior = (await tx.select().from(aurionNpcInformationReceipts)
        .where(eq(aurionNpcInformationReceipts.communicationReceiptId, communication.communicationReceiptId)).limit(1))[0];
      if (prior) return assertStored(prior);
    }
    return appendNpcInformationReceipt(tx, communication);
  });
}

export async function readConfirmedNpcInformation(input: Readonly<{
  ownerNpcId: string;
  worldId?: string;
  logicalIndex?: number;
}>): Promise<readonly NpcInformationReceipt[]> {
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  return db.transaction(async tx => {
    const rows = await tx.select().from(aurionNpcInformationReceipts)
      .where(input.worldId
        ? and(eq(aurionNpcInformationReceipts.ownerNpcId, input.ownerNpcId), eq(aurionNpcInformationReceipts.worldId, input.worldId))
        : eq(aurionNpcInformationReceipts.ownerNpcId, input.ownerNpcId))
      .orderBy(desc(aurionNpcInformationReceipts.logicalIndex), desc(aurionNpcInformationReceipts.id))
      .limit(512);
    const latest = new Map<string, NpcInformationReceipt>();
    for (const row of rows) {
      const receipt = assertStored(row);
      if (input.logicalIndex !== undefined && receipt.logicalIndex > input.logicalIndex) continue;
      const current = latest.get(receipt.factId);
      if (!current || receipt.logicalIndex > current.logicalIndex || (receipt.logicalIndex === current.logicalIndex && receipt.id > current.id)) {
        latest.set(receipt.factId, receipt);
      }
    }
    return Object.freeze([...latest.values()].sort((a, b) =>
      a.claimKey.localeCompare(b.claimKey) || a.value.localeCompare(b.value) || a.factId.localeCompare(b.factId)
    ));
  });
}

export async function readConsumableNpcInformation(ownerNpcId: string, logicalIndex: number, worldId?: string) {
  const facts = await readConfirmedNpcInformation({ ownerNpcId, logicalIndex, worldId });
  return Object.freeze(facts.filter(fact => isVerifiedConsumableNpcInformation(fact, logicalIndex)));
}

export async function readNpcInformationProvenance(ownerNpcId: string, factId: string): Promise<ReturnType<typeof summarizeNpcInformationProvenance> | null> {
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  return db.transaction(async tx => {
    const newest = (await tx.select().from(aurionNpcInformationReceipts)
      .where(and(eq(aurionNpcInformationReceipts.factId, factId), eq(aurionNpcInformationReceipts.ownerNpcId, ownerNpcId)))
      .orderBy(desc(aurionNpcInformationReceipts.logicalIndex), desc(aurionNpcInformationReceipts.id))
      .limit(1))[0];
    if (!newest) return null;
    const rows = await tx.select().from(aurionNpcInformationReceipts)
      .where(eq(aurionNpcInformationReceipts.factId, factId))
      .orderBy(desc(aurionNpcInformationReceipts.logicalIndex), desc(aurionNpcInformationReceipts.id))
      .limit(128);
    return summarizeNpcInformationProvenance(rows.map(assertStored));
  });
}

export function verifyNpcInformationConsumerFact(receipt: NpcInformationReceipt, logicalIndex: number): NpcInformationReceipt {
  assertVerifiedNpcInformation(receipt, logicalIndex);
  if (!isVerifiedConsumableNpcInformation(receipt, logicalIndex)) {
    throw new Error("NPC_INFORMATION_CONSUMER_FACT_NOT_VERIFIED");
  }
  return receipt;
}
