import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { advanceNpcMemory, createNpcSnapshot, decodeNpcReceipt, encodeNpcReceipt, normalizeNpcRequest, npcHash, npcNeedsSchema, parseNpcJson, parseNpcMemory, type NpcRequest } from "./npcPersistenceProtocol";
import { aurionDialogueReceipts, aurionNpcDecisionReceipts, aurionNpcStates, aurionPolityStates, aurionWorldResolutions } from "../drizzle/schema";
import { getDb } from "./db";
import {
  AURION_WASD_CONTENT_VERSION,
  AURION_WASD_RULESET_VERSION,
  buildWorldSeedDigest,
  decideNpcGoal,
  interpretDialogue,
  resolveNpcNeeds,
  resolvePolityState,
  resolveWorldReaction,
  type DialogueInterpretation,
  type LanguageProfile,
  type NpcNeedEvent,
  type NpcNeedState,
  type PolityGovernmentType,
  type PolityState,
  type WorldReaction,
  type WorldSignal,
} from "./wasdAurionProtocol";

const defaultLyraProfile: LanguageProfile = {
  languageProfileId: "aurion-common-v1",
  dialectId: "observatory",
  lexiconVersion: "v1",
  grammarVersion: "v1",
  comprehensionThreshold: 0.6,
};

function runtimeId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll("-", "")}`;
}

function jsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function digestText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertIndex(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("resolutionIndex must be a non-negative safe integer");
}

export type AurionWorldReadModel = {
  reaction: WorldReaction;
  source: "persisted" | "created";
};

/** Persists a pure resolver output once per region/index; retries return the first confirmed reaction. */
export async function resolveAndRecordWorld(input: {
  worldSeed: string;
  regionId: string;
  resolutionIndex: number;
  signals: readonly WorldSignal[];
}): Promise<AurionWorldReadModel> {
  assertIndex(input.resolutionIndex);
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  const prior = (await db.select().from(aurionWorldResolutions).where(eq(aurionWorldResolutions.regionId, input.regionId)))
    .find(row => row.resolutionIndex === input.resolutionIndex);
  if (prior) {
    return { reaction: jsonParse<WorldReaction>(prior.reactionJson, resolveWorldReaction(input)), source: "persisted" };
  }
  const reaction = resolveWorldReaction(input);
  const worldSeedDigest = buildWorldSeedDigest(input);
  await db.insert(aurionWorldResolutions).values({
    id: runtimeId("world"),
    regionId: input.regionId,
    worldSeedDigest,
    ruleSetVersion: reaction.ruleSetVersion,
    contentVersion: reaction.contentVersion,
    resolutionIndex: input.resolutionIndex,
    signalsJson: JSON.stringify(input.signals),
    reactionJson: JSON.stringify(reaction),
    reactionHash: reaction.deterministicHash,
  });
  const readback = (await db.select().from(aurionWorldResolutions).where(eq(aurionWorldResolutions.reactionHash, reaction.deterministicHash)).limit(1))[0];
  if (!readback) throw new Error("World resolution readback failed");
  return { reaction: jsonParse<WorldReaction>(readback.reactionJson, reaction), source: "created" };
}

export type AurionNpcReadModel = {
  npcId: string;
  regionId: string;
  needs: NpcNeedState;
  memory: readonly string[];
  decision: Awaited<ReturnType<typeof decideNpcGoal>>;
  source: "persisted" | "created";
};

/** Applies bounded needs and stores exactly one decision per NPC and resolution. */
export async function resolveAndRecordNpc(raw: NpcRequest): Promise<AurionNpcReadModel> {
  const input = normalizeNpcRequest(raw);
  const requestHash = npcHash(input);
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  return db.transaction(async tx => {
    // The primary-key insert/update acquires the same per-NPC lock for initial and existing state.
    await tx.insert(aurionNpcStates).values({ npcId: input.npcId, regionId: input.regionId, needsJson: JSON.stringify(resolveNpcNeeds({ events: [] })), memoryJson: "[]", languageProfileId: input.languageProfileId, lastResolutionIndex: -1 })
      .onDuplicateKeyUpdate({ set: { npcId: input.npcId } });
    const current = (await tx.select().from(aurionNpcStates).where(eq(aurionNpcStates.npcId, input.npcId)).limit(1).for("update"))[0];
    if (!current) throw new Error("NPC_STATE_REQUIRED");
    const prior = (await tx.select().from(aurionNpcDecisionReceipts).where(and(eq(aurionNpcDecisionReceipts.npcId, input.npcId), eq(aurionNpcDecisionReceipts.resolutionIndex, input.resolutionIndex))).limit(1))[0];
    if (prior) {
      const snapshot = decodeNpcReceipt(prior.observationIdsJson, { ...prior, requestHash });
      return { ...snapshot, source: "persisted" as const };
    }
    if (input.resolutionIndex <= current.lastResolutionIndex) throw new Error("NPC_RESOLUTION_OUT_OF_ORDER");
    const currentNeeds = npcNeedsSchema.parse(parseNpcJson(current.needsJson));
    const currentMemory = parseNpcMemory(current.memoryJson, current.lastResolutionIndex);
    if (current.lastResolutionIndex >= 0) {
      const latest = (await tx.select().from(aurionNpcDecisionReceipts).where(and(eq(aurionNpcDecisionReceipts.npcId, input.npcId), eq(aurionNpcDecisionReceipts.resolutionIndex, current.lastResolutionIndex))).limit(1))[0];
      if (!latest) throw new Error("NPC_STATE_RECEIPT_REQUIRED");
      const value = parseNpcJson(latest.observationIdsJson);
      if (Array.isArray(value)) {
        // Old decisions hash their exact needs/observations. Verify that limited evidence before upgrading.
        if (value.some(v => typeof v !== "string" || v.length > 120) || value.length > 128) throw new Error("NPC_STORED_CONTENT_CORRUPT");
        const old = decideNpcGoal({ npcId: input.npcId, needs: currentNeeds, observationIds: value, resolutionIndex: current.lastResolutionIndex });
        if (old.decisionHash !== latest.decisionHash || old.goal !== latest.goal) throw new Error("NPC_STORED_CONTENT_CORRUPT");
      } else {
        const proof = decodeNpcReceipt(latest.observationIdsJson, latest);
        if (proof.regionId !== current.regionId || npcHash(proof.needs) !== npcHash(currentNeeds) || npcHash(proof.memoryState) !== npcHash(currentMemory)) throw new Error("NPC_STORED_CONTENT_CORRUPT");
      }
    }
    const needs = resolveNpcNeeds({ current: currentNeeds, events: input.needEvents });
    const memory = advanceNpcMemory(currentMemory, input.memory, input.resolutionIndex);
    const snapshot = createNpcSnapshot({ ...input, needs, memoryState: memory });
    const id = "npc_" + npcHash(["aurion-npc-decision.v2", input.npcId, input.resolutionIndex]).slice(0, 56);
    const envelope = encodeNpcReceipt(requestHash, snapshot);
    await tx.update(aurionNpcStates).set({ regionId: input.regionId, needsJson: JSON.stringify(needs), memoryJson: JSON.stringify(memory), languageProfileId: input.languageProfileId, lastResolutionIndex: input.resolutionIndex }).where(eq(aurionNpcStates.npcId, input.npcId));
    // observationIdsJson is a versioned JSON envelope from v2 onward; no information is inferred on replay.
    await tx.insert(aurionNpcDecisionReceipts).values({ id, npcId: input.npcId, regionId: input.regionId, resolutionIndex: input.resolutionIndex, observationIdsJson: envelope, goal: snapshot.decision.goal, decisionHash: snapshot.decision.decisionHash });
    const row = (await tx.select().from(aurionNpcDecisionReceipts).where(eq(aurionNpcDecisionReceipts.id, id)).limit(1))[0];
    if (!row) throw new Error("NPC decision readback failed");
    return { ...decodeNpcReceipt(row.observationIdsJson, { ...row, requestHash }), source: "created" as const };
  });
}

export async function resolveAndRecordPolity(input: {
  polityId: string;
  governmentType: PolityGovernmentType;
  territoryIds: readonly string[];
  stability: number;
  activeDiplomacy: readonly ("alliance" | "trade" | "non_aggression" | "tribute" | "sanction")[];
  warSignals: readonly WorldSignal[];
}): Promise<PolityState> {
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  const state = resolvePolityState(input);
  const existing = (await db.select().from(aurionPolityStates).where(eq(aurionPolityStates.polityId, input.polityId)).limit(1))[0];
  if (existing?.reactionHash === state.reactionHash) return jsonParse<PolityState>(existing.stateJson, state);
  await db.insert(aurionPolityStates).values({
    polityId: state.polityId,
    stateJson: JSON.stringify(state),
    reactionHash: state.reactionHash,
    ruleSetVersion: AURION_WASD_RULESET_VERSION,
    contentVersion: AURION_WASD_CONTENT_VERSION,
  }).onDuplicateKeyUpdate({
    set: {
      stateJson: JSON.stringify(state),
      reactionHash: state.reactionHash,
      ruleSetVersion: AURION_WASD_RULESET_VERSION,
      contentVersion: AURION_WASD_CONTENT_VERSION,
    },
  });
  const readback = (await db.select().from(aurionPolityStates).where(eq(aurionPolityStates.polityId, state.polityId)).limit(1))[0];
  if (!readback) throw new Error("Polity state readback failed");
  return jsonParse<PolityState>(readback.stateJson, state);
}

/** Records a bounded dialog interpretation. It never accepts a gameplay command or reward mutation. */
export async function interpretAndRecordDialogue(input: {
  userId: number;
  npcId: string;
  text: string;
  trust: number;
  threat: number;
  idempotencyKey: string;
  profile?: LanguageProfile;
}): Promise<DialogueInterpretation & { receiptId: string }> {
  if (!input.idempotencyKey) throw new Error("Dialogue idempotency key is required");
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  const prior = (await db.select().from(aurionDialogueReceipts).where(eq(aurionDialogueReceipts.idempotencyKey, input.idempotencyKey)).limit(1))[0];
  if (prior) return {
    ...jsonParse<DialogueInterpretation>(prior.interpretationJson, { state: "quarantined", semanticIntent: "unknown", confidence: 0, dialectId: (input.profile ?? defaultLyraProfile).dialectId, reason: "invalid_persisted_payload" }),
    receiptId: prior.id,
  };
  const interpretation = interpretDialogue({ text: input.text, profile: input.profile ?? defaultLyraProfile, trust: input.trust, threat: input.threat });
  await db.insert(aurionDialogueReceipts).values({
    id: runtimeId("dialogue"),
    userId: input.userId,
    npcId: input.npcId,
    utteranceDigest: digestText(input.text),
    interpretationJson: JSON.stringify(interpretation),
    idempotencyKey: input.idempotencyKey,
  });
  const readback = (await db.select().from(aurionDialogueReceipts).where(eq(aurionDialogueReceipts.idempotencyKey, input.idempotencyKey)).limit(1))[0];
  if (!readback) throw new Error("Dialogue receipt readback failed");
  return {
    ...jsonParse<DialogueInterpretation>(readback.interpretationJson, interpretation),
    receiptId: readback.id,
  };
}
