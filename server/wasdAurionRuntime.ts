import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
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
export async function resolveAndRecordNpc(input: {
  npcId: string;
  regionId: string;
  resolutionIndex: number;
  needEvents: readonly NpcNeedEvent[];
  observationIds: readonly string[];
  memory: readonly string[];
  languageProfileId?: string;
}): Promise<AurionNpcReadModel> {
  assertIndex(input.resolutionIndex);
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  const priorDecision = (await db.select().from(aurionNpcDecisionReceipts).where(eq(aurionNpcDecisionReceipts.npcId, input.npcId)))
    .find(row => row.resolutionIndex === input.resolutionIndex);
  const current = (await db.select().from(aurionNpcStates).where(eq(aurionNpcStates.npcId, input.npcId)).limit(1))[0];
  const currentNeeds = current ? jsonParse<NpcNeedState>(current.needsJson, resolveNpcNeeds({ events: [] })) : resolveNpcNeeds({ events: [] });
  const needs = resolveNpcNeeds({ current: currentNeeds, events: input.needEvents });
  const decision = decideNpcGoal({ npcId: input.npcId, needs, observationIds: input.observationIds, resolutionIndex: input.resolutionIndex });
  if (priorDecision && current) {
    return {
      npcId: input.npcId,
      regionId: current.regionId,
      needs: jsonParse<NpcNeedState>(current.needsJson, needs),
      memory: jsonParse<readonly string[]>(current.memoryJson, input.memory),
      decision: { ...decision, goal: priorDecision.goal as typeof decision.goal, decisionHash: priorDecision.decisionHash, observationIds: jsonParse<readonly string[]>(priorDecision.observationIdsJson, decision.observationIds) },
      source: "persisted",
    };
  }
  await db.transaction(async tx => {
    await tx.insert(aurionNpcStates).values({
      npcId: input.npcId,
      regionId: input.regionId,
      needsJson: JSON.stringify(needs),
      memoryJson: JSON.stringify(input.memory.slice(-24)),
      languageProfileId: input.languageProfileId ?? defaultLyraProfile.languageProfileId,
      lastResolutionIndex: input.resolutionIndex,
    }).onDuplicateKeyUpdate({
      set: {
        regionId: input.regionId,
        needsJson: JSON.stringify(needs),
        memoryJson: JSON.stringify(input.memory.slice(-24)),
        languageProfileId: input.languageProfileId ?? defaultLyraProfile.languageProfileId,
        lastResolutionIndex: input.resolutionIndex,
      },
    });
    await tx.insert(aurionNpcDecisionReceipts).values({
      id: runtimeId("npcdec"),
      npcId: input.npcId,
      regionId: input.regionId,
      resolutionIndex: input.resolutionIndex,
      observationIdsJson: JSON.stringify(decision.observationIds),
      goal: decision.goal,
      decisionHash: decision.decisionHash,
    });
  });
  const readback = (await db.select().from(aurionNpcDecisionReceipts).where(eq(aurionNpcDecisionReceipts.decisionHash, decision.decisionHash)).limit(1))[0];
  if (!readback) throw new Error("NPC decision readback failed");
  return { npcId: input.npcId, regionId: input.regionId, needs, memory: input.memory.slice(-24), decision, source: "created" };
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
}): Promise<DialogueInterpretation> {
  if (!input.idempotencyKey) throw new Error("Dialogue idempotency key is required");
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  const prior = (await db.select().from(aurionDialogueReceipts).where(eq(aurionDialogueReceipts.idempotencyKey, input.idempotencyKey)).limit(1))[0];
  if (prior) return jsonParse<DialogueInterpretation>(prior.interpretationJson, { state: "quarantined", semanticIntent: "unknown", confidence: 0, dialectId: (input.profile ?? defaultLyraProfile).dialectId, reason: "invalid_persisted_payload" });
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
  return jsonParse<DialogueInterpretation>(readback.interpretationJson, interpretation);
}
