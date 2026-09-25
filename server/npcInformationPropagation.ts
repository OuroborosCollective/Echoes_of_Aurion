import { and, desc, eq } from "drizzle-orm";
import {
  aurionNpcActionReceipts,
  aurionNpcDecisionReceipts,
  aurionNpcInformationReceipts,
  aurionNpcMemoryReceiptsV4,
  aurionQuestReceipts,
  aurionSemanticGraphReceiptsV2,
  aurionWorldResolutions,
} from "../drizzle/schema";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { getDb } from "./db";
import { AURION_WORLD_CHECKPOINT_WORLD_ID } from "./worldCheckpointProtocol";
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
  type NpcInformationSourceKind,
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
  const { createdAt: _createdAt, ...storedReceipt } = row;
  const receipt = npcInformationReceiptSchema.parse(storedReceipt);
  const { receiptHash, ...unsigned } = receipt;
  const expected = canonicalSha256({
    domain: "aurion.npc-information-receipt.v1",
    value: unsigned,
  }).slice("sha256:".length);
  if (expected !== receiptHash) throw new Error("NPC_INFORMATION_STORED_CONTENT_CORRUPT");
  assertVerifiedNpcInformation(receipt);
  return receipt;
}

async function appendNpcInformationReceipt(tx: NpcTransaction, receipt: NpcInformationReceipt): Promise<NpcInformationReceipt> {
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

const sourceVerifiers: Record<NpcInformationSourceKind, (tx: NpcTransaction, receipt: NpcInformationReceipt) => Promise<void>> = {
  npc_decision_receipt: verifyNpcDecisionSource,
  npc_memory_receipt: verifyNpcMemorySource,
  npc_action_receipt: verifyNpcActionSource,
  world_receipt: verifyWorldResolutionSource,
  quest_receipt: verifyQuestSource,
  semantic_graph_receipt: verifySemanticGraphSource,
};

async function verifyExperiencedSource(tx: NpcTransaction, receipt: NpcInformationReceipt): Promise<void> {
  // A caller-provided evidenceClass is only a claim. Bind it to a committed Aurion receipt.
  // Each source kind has its own typed verifier that readbacks the committed receipt.
  const verifier = sourceVerifiers[receipt.sourceKind];
  if (!verifier) throw new Error("NPC_INFORMATION_SOURCE_VERIFIER_REQUIRED");
  await verifier(tx, receipt);
}

async function verifyNpcDecisionSource(tx: NpcTransaction, receipt: NpcInformationReceipt): Promise<void> {
  const decision = (await tx.select().from(aurionNpcDecisionReceipts)
    .where(eq(aurionNpcDecisionReceipts.id, receipt.sourceReceiptId)).limit(1))[0];
  if (!decision || receipt.worldId !== AURION_WORLD_CHECKPOINT_WORLD_ID || decision.npcId !== receipt.witnessNpcId ||
      receipt.subjectId !== decision.npcId || receipt.predicate !== "npc_decision" || receipt.value !== decision.goal ||
      `sha256:${decision.decisionHash}` !== receipt.sourceReceiptHash ||
      receipt.sourceCausalRoot !== receipt.sourceReceiptHash) {
    throw new Error("NPC_INFORMATION_SOURCE_READBACK_MISMATCH");
  }
}

async function verifyNpcMemorySource(tx: NpcTransaction, receipt: NpcInformationReceipt): Promise<void> {
  const memory = (await tx.select().from(aurionNpcMemoryReceiptsV4)
    .where(eq(aurionNpcMemoryReceiptsV4.id, receipt.sourceReceiptId)).limit(1))[0];
  if (!memory || receipt.worldId !== AURION_WORLD_CHECKPOINT_WORLD_ID ||
      memory.npcId !== receipt.witnessNpcId ||
      receipt.subjectId !== memory.npcId ||
      receipt.predicate !== "npc_memory" ||
      receipt.value !== memory.memoryHash ||
      `sha256:${memory.receiptHash}` !== receipt.sourceReceiptHash ||
      memory.sourceRevision !== receipt.sourceRevision ||
      `sha256:${memory.sourceSha256}` !== receipt.sourceSha256 ||
      receipt.sourceCausalRoot !== receipt.sourceReceiptHash) {
    throw new Error("NPC_INFORMATION_SOURCE_READBACK_MISMATCH");
  }
}

async function verifyNpcActionSource(tx: NpcTransaction, receipt: NpcInformationReceipt): Promise<void> {
  const action = (await tx.select().from(aurionNpcActionReceipts)
    .where(eq(aurionNpcActionReceipts.id, receipt.sourceReceiptId)).limit(1))[0];
  if (!action || receipt.worldId !== AURION_WORLD_CHECKPOINT_WORLD_ID ||
      action.npcId !== receipt.witnessNpcId ||
      receipt.subjectId !== action.npcId ||
      receipt.predicate !== "npc_action" ||
      receipt.value !== action.effectsHash ||
      `sha256:${action.receiptHash}` !== receipt.sourceReceiptHash ||
      action.sourceRevision !== receipt.sourceRevision ||
      `sha256:${action.sourceSha256}` !== receipt.sourceSha256 ||
      receipt.sourceCausalRoot !== receipt.sourceReceiptHash) {
    throw new Error("NPC_INFORMATION_SOURCE_READBACK_MISMATCH");
  }
}

async function verifyWorldResolutionSource(tx: NpcTransaction, receipt: NpcInformationReceipt): Promise<void> {
  const world = (await tx.select().from(aurionWorldResolutions)
    .where(eq(aurionWorldResolutions.id, receipt.sourceReceiptId)).limit(1))[0];
  if (!world || receipt.worldId !== AURION_WORLD_CHECKPOINT_WORLD_ID ||
      receipt.subjectId !== world.regionId ||
      receipt.predicate !== "world_resolution" ||
      receipt.value !== world.reactionHash ||
      `sha256:${world.reactionHash}` !== receipt.sourceReceiptHash ||
      receipt.sourceCausalRoot !== receipt.sourceReceiptHash) {
    throw new Error("NPC_INFORMATION_SOURCE_READBACK_MISMATCH");
  }
}

async function verifyQuestSource(tx: NpcTransaction, receipt: NpcInformationReceipt): Promise<void> {
  const quest = (await tx.select().from(aurionQuestReceipts)
    .where(eq(aurionQuestReceipts.id, receipt.sourceReceiptId)).limit(1))[0];
  if (!quest || receipt.worldId !== AURION_WORLD_CHECKPOINT_WORLD_ID ||
      receipt.subjectId !== quest.instanceId ||
      receipt.predicate !== "quest_event" ||
      receipt.value !== quest.resultStateHash ||
      `sha256:${quest.receiptHash}` !== receipt.sourceReceiptHash ||
      receipt.sourceCausalRoot !== receipt.sourceReceiptHash) {
    throw new Error("NPC_INFORMATION_SOURCE_READBACK_MISMATCH");
  }
}

async function verifySemanticGraphSource(tx: NpcTransaction, receipt: NpcInformationReceipt): Promise<void> {
  const graph = (await tx.select().from(aurionSemanticGraphReceiptsV2)
    .where(eq(aurionSemanticGraphReceiptsV2.id, receipt.sourceReceiptId)).limit(1))[0];
  if (!graph || receipt.worldId !== AURION_WORLD_CHECKPOINT_WORLD_ID ||
      graph.npcId !== receipt.witnessNpcId ||
      receipt.subjectId !== graph.npcId ||
      receipt.predicate !== "semantic_graph" ||
      receipt.value !== graph.graphHash ||
      `sha256:${graph.receiptHash}` !== receipt.sourceReceiptHash ||
      graph.sourceRevision !== receipt.sourceRevision ||
      `sha256:${graph.sourceSha256}` !== receipt.sourceSha256 ||
      receipt.sourceCausalRoot !== receipt.sourceReceiptHash) {
    throw new Error("NPC_INFORMATION_SOURCE_READBACK_MISMATCH");
  }
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
  return db.transaction(async tx => {
    await verifyExperiencedSource(tx, receipt);
    return appendNpcInformationReceipt(tx, receipt);
  });
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
    if (input.status === "communicated" || input.ownerNpcId && input.ownerNpcId !== previous.ownerNpcId ||
        input.communicatedByNpcId !== undefined || input.communicationReceiptId !== undefined ||
        input.confidenceBps !== previous.confidenceBps) {
      throw new Error("NPC_INFORMATION_TRANSITION_AUTHORITY_INVALID");
    }
    if (input.status === "corroborated" || input.status === "contradicted") {
      if (!input.relatedFactId) throw new Error("NPC_INFORMATION_RELATED_FACT_REQUIRED");
      const related = (await tx.select().from(aurionNpcInformationReceipts)
        .where(eq(aurionNpcInformationReceipts.factId, input.relatedFactId))
        .orderBy(desc(aurionNpcInformationReceipts.logicalIndex)).limit(1))[0];
      if (!related) throw new Error("NPC_INFORMATION_RELATED_FACT_READBACK_REQUIRED");
      const other = assertStored(related);
      if (other.worldId !== previous.worldId || other.claimKey !== previous.claimKey ||
          other.sourceReceiptId === previous.sourceReceiptId || other.witnessNpcId === previous.witnessNpcId ||
          (input.status === "corroborated") !== (other.value === previous.value)) {
        throw new Error("NPC_INFORMATION_RELATED_FACT_MISMATCH");
      }
    }
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
      .limit(513);
    if (rows.length > 512) throw new Error("NPC_INFORMATION_READBACK_PAGE_REQUIRED");
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
