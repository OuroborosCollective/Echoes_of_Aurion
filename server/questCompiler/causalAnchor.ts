import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import {
  aurionCausalTickReceipts,
  aurionGlobalStateProofs,
} from "../../drizzle/aurionCausalitySchema";
import { type QuestInstance, type QuestPlan, type QuestReceipt } from "../../shared/aurionQuestContract";
import { type QuestCompleteSource, type QuestDomainCommand } from "../../shared/aurionQuestDomainCommandContract";
import {
  AURION_QUEST_CAUSAL_ANCHOR_SCHEMA,
  createQuestCausalAnchor,
  type QuestCausalAnchor,
  QuestCausalAnchorSchema,
  verifyQuestCausalAnchor,
} from "../../shared/aurionQuestCausalAnchorContract";
import { type AurionCausalTickReceipt, computeReceiptHash } from "../../shared/aurionCausalTickContract";
import { getDb } from "../db";
import { worldCausalRootService } from "../causality/worldCausalRootService";
import { canonicalJson } from "../../shared/aurionCanonicalHash";
import { readEncounterCompletionEvidence } from "../encounterCompletionEvidence";
import type { AurionZoneIntent, AurionQuestHandInIntent } from "../../shared/aurionZoneIntentContract";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

const MAX_PROOF_EPOCHS = 64;
const MAX_RECEIPTS_PER_RANGE = 16_384;
const RANGE_PAGE_SIZE = 256;

function sourceMatches(instance: QuestInstance, plan: QuestPlan, source: QuestCompleteSource): void {
  const checks: Array<[string, unknown, unknown]> = [
    ["triggerEventId", instance.triggerEventId, source.triggerEventId],
    ["triggerEventDigest", instance.triggerEventDigest, source.triggerEventDigest],
    ["compilerVersion", instance.compilerVersion, source.compilerVersion],
    ["sourceRevision", instance.sourceRevision, source.sourceRevision],
    ["templateSetHash", instance.templateSetHash, source.templateSetHash],
    ["candidateSetHash", instance.candidateSetHash, source.candidateSetHash],
    ["seedDigest", instance.seedDigest, source.seedDigest],
    ["roleBindingHash", instance.roleBindingHash, source.roleBindingHash],
    ["planHash", instance.planHash, plan.planHash],
    ["graphHash", instance.graphHash, plan.graphHash],
  ];
  if (!instance.worldId.trim()) throw new Error("QUEST_CAUSAL_SOURCE_WORLD_ID_INVALID");
  for (const [name, actual, expected] of checks) {
    if (actual !== undefined && actual !== expected) throw new Error(`QUEST_CAUSAL_SOURCE_${name.toUpperCase()}_MISMATCH`);
  }
  if (instance.worldStateRevision !== undefined && instance.worldStateRevision !== source.sourceLogicalRevision) {
    throw new Error("QUEST_CAUSAL_SOURCE_LOGICAL_REVISION_MISMATCH");
  }
  if (source.sourceLogicalRevision < 0) throw new Error("QUEST_CAUSAL_SOURCE_LOGICAL_REVISION_INVALID");
  if (source.sourceEvidenceDigest.length !== 64 || !/^[a-f0-9]{64}$/.test(source.sourceEvidenceDigest)) {
    throw new Error("QUEST_CAUSAL_SOURCE_EVIDENCE_DIGEST_INVALID");
  }
}

function sameHandIn(intent: AurionQuestHandInIntent, command: QuestDomainCommand, source: QuestCompleteSource, questId: string): boolean {
  if (command.kind !== "complete") return false;
  const expected: Record<string, unknown> = {
    instanceId: command.instanceId,
    commandId: command.commandId,
    planHash: command.planHash,
    graphHash: command.graphHash,
    expectedStateHash: command.expectedStateHash,
    triggerEventId: source.triggerEventId,
    triggerEventDigest: source.triggerEventDigest,
    sourceEvidenceId: source.sourceEvidenceId,
    sourceEvidenceDigest: source.sourceEvidenceDigest,
    sourceLogicalRevision: source.sourceLogicalRevision,
    compilerVersion: source.compilerVersion,
    sourceRevision: source.sourceRevision,
    templateSetHash: source.templateSetHash,
    candidateSetHash: source.candidateSetHash,
    seedDigest: source.seedDigest,
    roleBindingHash: source.roleBindingHash,
  };
  for (const [key, value] of Object.entries(expected)) {
    if ((intent as unknown as Record<string, unknown>)[key] !== value) return false;
  }
  return intent.questId === questId;
}

function decodeReceipt(row: typeof aurionCausalTickReceipts.$inferSelect): AurionCausalTickReceipt {
  const receipt = {
    schema: row.receiptSchema,
    worldId: row.worldId,
    zoneId: row.zoneId,
    tick: row.tick,
    sourceRevision: row.revision,
    rulesetVersion: row.rulesetVersion,
    previousReceiptHash: row.previousReceiptHash,
    preStateHash: row.preStateHash,
    orderedIntentHash: row.inputHash,
    transitionHash: row.transitionHash,
    rngRootHash: row.rngRootHash,
    postStateHash: row.postStateHash,
    receiptHash: row.receiptHash,
    ...(row.stageReceiptsJson ? { stages: JSON.parse(row.stageReceiptsJson) } : {}),
  } as AurionCausalTickReceipt;
  if (computeReceiptHash({ ...receipt, receiptHash: undefined } as never) !== row.receiptHash) {
    throw new Error("QUEST_CAUSAL_RECEIPT_HASH_MISMATCH");
  }
  return receipt;
}

function intentMatchesStored(row: typeof aurionCausalTickReceipts.$inferSelect, command: QuestDomainCommand, source: QuestCompleteSource, questId: string): boolean {
  if (!row.inputJson || command.kind !== "complete") return false;
  let intents: AurionZoneIntent[];
  try {
    intents = JSON.parse(row.inputJson) as AurionZoneIntent[];
  } catch {
    throw new Error("QUEST_CAUSAL_INTENT_EVIDENCE_CORRUPT");
  }
  return intents.some(intent => intent.type === "quest_hand_in" && sameHandIn(intent as AurionQuestHandInIntent, command, source, questId));
}

async function findRealCausalReceipt(
  db: Database,
  worldId: string,
  source: QuestCompleteSource,
  command: QuestDomainCommand,
  questId: string,
): Promise<{ receipt: AurionCausalTickReceipt; epoch: number; sourceWorldRoot: string } > {
  const proofs = await db.select({ epoch: aurionGlobalStateProofs.epoch })
    .from(aurionGlobalStateProofs)
    .where(and(
      eq(aurionGlobalStateProofs.worldId, worldId),
      eq(aurionGlobalStateProofs.status, "VERIFIED"),
    ))
    .orderBy(desc(aurionGlobalStateProofs.epoch))
    .limit(MAX_PROOF_EPOCHS + 1);
  if (proofs.length > MAX_PROOF_EPOCHS) throw new Error("QUEST_CAUSAL_ANCHOR_EPOCH_LIMIT_EXCEEDED");

  const matches: Array<{ receipt: AurionCausalTickReceipt; epoch: number; sourceWorldRoot: string }> = [];
  for (const proof of proofs) {
    const persisted = await worldCausalRootService.read(worldId, proof.epoch);
    if (!persisted || persisted.status !== "VERIFIED" || !persisted.root) continue;
    if (persisted.root.sourceRevision !== source.sourceRevision) continue;
    const replay = await worldCausalRootService.replay(worldId, proof.epoch);
    if (replay.status === "FIRST_DIVERGENCE") throw new Error("QUEST_CAUSAL_WORLD_ROOT_FIRST_DIVERGENCE");
    if (replay.status !== "MATCH" || replay.worldRootHash !== persisted.root.worldRootHash) continue;

    for (const zoneRoot of persisted.root.zoneRoots) {
      let cursor = zoneRoot.fromTick;
      let scanned = 0;
      while (cursor <= zoneRoot.toTick) {
        const end = Math.min(zoneRoot.toTick, cursor + RANGE_PAGE_SIZE - 1);
        const rows = await db.select().from(aurionCausalTickReceipts).where(and(
          eq(aurionCausalTickReceipts.worldId, worldId),
          eq(aurionCausalTickReceipts.zoneId, zoneRoot.zoneId),
          gte(aurionCausalTickReceipts.tick, cursor),
          lte(aurionCausalTickReceipts.tick, end),
          eq(aurionCausalTickReceipts.revision, source.sourceRevision),
          eq(aurionCausalTickReceipts.rulesetVersion, persisted.root.rulesetVersion),
        )).orderBy(asc(aurionCausalTickReceipts.tick));
        scanned += rows.length;
        if (scanned > MAX_RECEIPTS_PER_RANGE) throw new Error("QUEST_CAUSAL_ANCHOR_RECEIPT_SCAN_LIMIT");
        for (const row of rows) {
          if (!intentMatchesStored(row, command, source, questId)) continue;
          if (row.tick < zoneRoot.fromTick || row.tick > zoneRoot.toTick) continue;
          matches.push({ receipt: decodeReceipt(row), epoch: proof.epoch, sourceWorldRoot: persisted.root.worldRootHash });
          if (matches.length > 1) throw new Error("QUEST_CAUSAL_ANCHOR_MULTIPLE_MATCHES");
        }
        cursor = end + 1;
      }
    }
  }

  const match = matches[0];
  if (!match) throw new Error("QUEST_CAUSAL_ANCHOR_UNPROVABLE");
  return match;
}

export async function resolveQuestCausalAnchor(input: {
  instance: QuestInstance;
  plan: QuestPlan;
  command: QuestDomainCommand;
  receipt: QuestReceipt;
}): Promise<{ anchor: QuestCausalAnchor; receipt: AurionCausalTickReceipt }> {
  if (input.command.kind !== "complete") throw new Error("QUEST_CAUSAL_ANCHOR_COMPLETE_COMMAND_REQUIRED");
  if (input.receipt.instanceId !== input.instance.id) throw new Error("QUEST_CAUSAL_ANCHOR_RECEIPT_INSTANCE_MISMATCH");
  if (input.receipt.planHash !== input.plan.planHash || input.receipt.graphHash !== input.plan.graphHash) {
    throw new Error("QUEST_CAUSAL_ANCHOR_RECEIPT_PLAN_MISMATCH");
  }
  sourceMatches(input.instance, input.plan, input.command);
  if (input.command.sourceEvidenceId.startsWith("evt_encounter_complete_")) {
    const sessionId = input.command.sourceEvidenceId.slice("evt_encounter_complete_".length);
    const evidence = await readEncounterCompletionEvidence(input.instance.playerUserId, sessionId);
    if (evidence.eventId !== input.command.sourceEvidenceId || evidence.evidenceHash !== input.command.sourceEvidenceDigest) {
      throw new Error("QUEST_CAUSAL_SOURCE_EVIDENCE_IDENTITY_MISMATCH");
    }
  } else {
    throw new Error("QUEST_CAUSAL_SOURCE_EVIDENCE_UNPROVABLE");
  }

  const db = await getDb();
  if (!db) throw new Error("QUEST_CAUSAL_DATABASE_UNAVAILABLE");

  const found = await findRealCausalReceipt(db, input.instance.worldId, input.command, input.command, input.instance.templateId);
  const anchor = createQuestCausalAnchor({
    schema: AURION_QUEST_CAUSAL_ANCHOR_SCHEMA,
    questReceiptId: input.receipt.id,
    worldId: input.instance.worldId,
    epoch: found.epoch,
    zoneId: found.receipt.zoneId,
    tick: found.receipt.tick,
    causalReceiptHash: found.receipt.receiptHash,
    sourceWorldRoot: found.sourceWorldRoot,
    sourceRevision: input.command.sourceRevision,
    rulesetVersion: found.receipt.rulesetVersion,
    sourceEvidenceId: input.command.sourceEvidenceId,
    sourceEvidenceDigest: input.command.sourceEvidenceDigest,
    sourceLogicalRevision: input.command.sourceLogicalRevision,
    triggerEventId: input.command.triggerEventId,
    triggerEventDigest: input.command.triggerEventDigest,
    compilerVersion: input.command.compilerVersion,
    templateSetHash: input.command.templateSetHash,
    candidateSetHash: input.command.candidateSetHash,
    seedDigest: input.command.seedDigest,
    roleBindingHash: input.command.roleBindingHash,
    commandId: input.command.commandId,
    planHash: input.plan.planHash,
    graphHash: input.plan.graphHash,
    previousStateHash: input.receipt.previousStateHash,
    resultStateHash: input.receipt.resultStateHash,
  });

  return Object.freeze({ anchor, receipt: found.receipt });
}

export async function readQuestCausalAnchorByReceiptId(questReceiptId: string): Promise<QuestCausalAnchor> {
  if (!questReceiptId.trim()) throw new Error("QUEST_CAUSAL_ANCHOR_RECEIPT_ID_INVALID");
  const db = await getDb();
  if (!db) throw new Error("QUEST_CAUSAL_DATABASE_UNAVAILABLE");
  const row = (await db.select().from(aurionQuestCausalAnchors)
    .where(eq(aurionQuestCausalAnchors.questReceiptId, questReceiptId))
    .limit(1))[0];
  if (!row) throw new Error("QUEST_CAUSAL_ANCHOR_UNPROVABLE");

  const anchor = QuestCausalAnchorSchema.parse({
    schema: AURION_QUEST_CAUSAL_ANCHOR_SCHEMA,
    questReceiptId: row.questReceiptId,
    worldId: row.worldId,
    epoch: row.epoch,
    zoneId: row.zoneId,
    tick: row.tick,
    causalReceiptHash: row.causalReceiptHash,
    sourceWorldRoot: row.sourceWorldRoot,
    sourceRevision: row.sourceRevision,
    rulesetVersion: row.rulesetVersion,
    sourceEvidenceId: row.sourceEvidenceId,
    sourceEvidenceDigest: row.sourceEvidenceDigest,
    sourceLogicalRevision: row.sourceLogicalRevision,
    triggerEventId: row.triggerEventId,
    triggerEventDigest: row.triggerEventDigest,
    compilerVersion: row.compilerVersion,
    templateSetHash: row.templateSetHash,
    candidateSetHash: row.candidateSetHash,
    seedDigest: row.seedDigest,
    roleBindingHash: row.roleBindingHash,
    commandId: row.commandId,
    planHash: row.planHash,
    graphHash: row.graphHash,
    previousStateHash: row.previousStateHash,
    resultStateHash: row.resultStateHash,
    anchorHash: row.anchorHash,
  });
  if (!verifyQuestCausalAnchor(anchor)) throw new Error("QUEST_CAUSAL_ANCHOR_PERSISTED_HASH_MISMATCH");

  const persisted = (await db.select().from(aurionCausalTickReceipts)
    .where(and(
      eq(aurionCausalTickReceipts.worldId, anchor.worldId),
      eq(aurionCausalTickReceipts.receiptHash, anchor.causalReceiptHash),
    )).limit(1))[0];
  if (!persisted) throw new Error("QUEST_CAUSAL_ANCHOR_RECEIPT_UNPROVABLE");
  if (
    persisted.zoneId !== anchor.zoneId ||
    persisted.tick !== anchor.tick ||
    persisted.revision !== anchor.sourceRevision ||
    persisted.rulesetVersion !== anchor.rulesetVersion
  ) throw new Error("QUEST_CAUSAL_ANCHOR_RECEIPT_IDENTITY_MISMATCH");
  decodeReceipt(persisted);

  const root = await worldCausalRootService.read(anchor.worldId, anchor.epoch);
  if (!root || root.status !== "VERIFIED" || root.root?.worldRootHash !== anchor.sourceWorldRoot) {
    throw new Error("QUEST_CAUSAL_ANCHOR_WORLD_ROOT_UNPROVABLE");
  }
  const zoneRoot = root.root.zoneRoots.find(value => value.zoneId === anchor.zoneId);
  if (!zoneRoot || anchor.tick < zoneRoot.fromTick || anchor.tick > zoneRoot.toTick) {
    throw new Error("QUEST_CAUSAL_ANCHOR_RECEIPT_OUTSIDE_WORLD_ROOT");
  }
  const replay = await worldCausalRootService.replay(anchor.worldId, anchor.epoch);
  if (replay.status !== "MATCH" || replay.worldRootHash !== anchor.sourceWorldRoot) {
    throw new Error("QUEST_CAUSAL_ANCHOR_WORLD_ROOT_DIVERGENCE");
  }
  return anchor;
}

export function verifyQuestCausalAnchorAgainstCommand(anchor: QuestCausalAnchor, command: QuestDomainCommand, receipt: QuestReceipt): void {
  if (command.kind !== "complete") throw new Error("QUEST_CAUSAL_ANCHOR_COMPLETE_COMMAND_REQUIRED");
  if (anchor.questReceiptId !== receipt.id || anchor.commandId !== command.commandId) throw new Error("QUEST_CAUSAL_ANCHOR_BINDING_MISMATCH");
  if (anchor.previousStateHash !== receipt.previousStateHash || anchor.resultStateHash !== receipt.resultStateHash) {
    throw new Error("QUEST_CAUSAL_ANCHOR_STATE_BINDING_MISMATCH");
  }
  if (canonicalJson(anchor).length > 25_000) throw new Error("QUEST_CAUSAL_ANCHOR_SERIALIZED_TOO_LARGE");
}
