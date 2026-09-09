import { encodeNpcSnapshot, type PublicNpcSnapshot } from "@shared/npcSnapshotProtocol";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { advanceNpcMemory, createNpcLifeSnapshot, decodeNpcReceipt, encodeNpcLifeReceipt, NPC_LIFE_RECEIPT_VERSION, normalizeNpcRequest, npcHash, npcNeedsSchema, npcReceiptVersion, npcRequestHash, parseNpcJson, parseNpcMemory, type NpcRequest, type NpcSnapshot } from "./npcPersistenceProtocol";
import { aurionDialogueReceipts, aurionNpcDecisionReceipts, aurionNpcStates, aurionPolityStates, aurionWorldResolutions } from "../drizzle/schema";
import { getDb } from "./db";
import { appendNpcMultiMemory, readNpcMultiMemoryForDecision, readPreviousNpcMultiMemory } from "./npcMultiMemoryPersistence";
import type { NpcMemoryV4 } from "./wasdNpcCapsule";
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertIndex(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("resolutionIndex must be a non-negative safe integer");
}

function canonicalWorldSignals(signals: readonly WorldSignal[]): string {
  const normalized = signals.map(signal => ({
    id: signal.id,
    kind: signal.kind,
    regionId: signal.regionId,
    magnitude: signal.magnitude,
    sourceReceiptId: signal.sourceReceiptId,
    resolutionIndex: signal.resolutionIndex,
  })).sort((left,right) => left.resolutionIndex - right.resolutionIndex
    || compareText(left.regionId,right.regionId)
    || compareText(left.kind,right.kind)
    || compareText(left.sourceReceiptId,right.sourceReceiptId)
    || compareText(left.id,right.id));
  if (new Set(normalized.map(signal => signal.id)).size !== normalized.length) throw new Error("WORLD_DUPLICATE_SIGNAL_EVIDENCE");
  return JSON.stringify(normalized);
}

function storedWorldSignals(raw: string): string {
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) throw new Error("WORLD_STORED_CONTENT_CORRUPT");
    return canonicalWorldSignals(value as WorldSignal[]);
  } catch (error) {
    if (error instanceof Error && error.message === "WORLD_DUPLICATE_SIGNAL_EVIDENCE") throw new Error("WORLD_STORED_CONTENT_CORRUPT");
    if (error instanceof Error && error.message === "WORLD_STORED_CONTENT_CORRUPT") throw error;
    throw new Error("WORLD_STORED_CONTENT_CORRUPT");
  }
}

function worldResolutionRowId(regionId: string, resolutionIndex: number): string {
  return `world_${digestText(`${regionId}\u001f${resolutionIndex}`).slice(0,58)}`;
}

export type AurionWorldReadModel = {
  reaction: WorldReaction;
  source: "persisted" | "created";
};

type WorldResolutionRow = typeof aurionWorldResolutions.$inferSelect;

function verifiedWorldReadback(row: WorldResolutionRow, expected: { worldSeedDigest: string; signalsJson: string; reaction: WorldReaction }): WorldReaction {
  if (row.worldSeedDigest !== expected.worldSeedDigest || storedWorldSignals(row.signalsJson) !== expected.signalsJson) throw new Error("WORLD_RESOLUTION_INPUT_CONFLICT");
  if (row.ruleSetVersion !== expected.reaction.ruleSetVersion || row.contentVersion !== expected.reaction.contentVersion || row.reactionHash !== expected.reaction.deterministicHash) throw new Error("WORLD_STORED_CONTENT_CORRUPT");
  const stored = jsonParse<WorldReaction | null>(row.reactionJson,null);
  if (!stored || stored.deterministicHash !== row.reactionHash || npcHash(stored) !== npcHash(expected.reaction)) throw new Error("WORLD_STORED_CONTENT_CORRUPT");
  return stored;
}

/** Persists a pure resolver output once per region/index; retries must reproduce the exact same request. */
export async function resolveAndRecordWorld(input: {
  worldSeed: string;
  regionId: string;
  resolutionIndex: number;
  signals: readonly WorldSignal[];
}): Promise<AurionWorldReadModel> {
  assertIndex(input.resolutionIndex);
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  const reaction = resolveWorldReaction(input);
  const worldSeedDigest = buildWorldSeedDigest(input);
  const signalsJson = canonicalWorldSignals(input.signals);
  const expected = { worldSeedDigest, signalsJson, reaction };
  const prior = (await db.select().from(aurionWorldResolutions).where(eq(aurionWorldResolutions.regionId, input.regionId)))
    .find(row => row.resolutionIndex === input.resolutionIndex);
  if (prior) return { reaction: verifiedWorldReadback(prior,expected), source: "persisted" };

  const id = worldResolutionRowId(input.regionId,input.resolutionIndex);
  try {
    await db.insert(aurionWorldResolutions).values({
      id,
      regionId: input.regionId,
      worldSeedDigest,
      ruleSetVersion: reaction.ruleSetVersion,
      contentVersion: reaction.contentVersion,
      resolutionIndex: input.resolutionIndex,
      signalsJson,
      reactionJson: JSON.stringify(reaction),
      reactionHash: reaction.deterministicHash,
    });
  } catch (error) {
    const collided = (await db.select().from(aurionWorldResolutions).where(eq(aurionWorldResolutions.id,id)).limit(1))[0];
    if (!collided) throw error;
    return { reaction: verifiedWorldReadback(collided,expected), source: "persisted" };
  }
  const readback = (await db.select().from(aurionWorldResolutions).where(eq(aurionWorldResolutions.id,id)).limit(1))[0];
  if (!readback) throw new Error("World resolution readback failed");
  return { reaction: verifiedWorldReadback(readback,expected), source: "created" };
}

export type AurionNpcReadModel = NpcSnapshot & Readonly<{ source: "persisted" | "created"; multiMemory: NpcMemoryV4 | null }>;

function assertNpcStateMatchesReceipt(state: { npcId: string; regionId: string; needsJson: string; memoryJson: string; lastResolutionIndex: number }, snapshot: NpcSnapshot): void {
  if (snapshot.npcId !== state.npcId || snapshot.regionId !== state.regionId || snapshot.decision.resolutionIndex !== state.lastResolutionIndex || npcHash(snapshot.needs) !== npcHash(npcNeedsSchema.parse(parseNpcJson(state.needsJson))) || npcHash(snapshot.memoryState) !== npcHash(parseNpcMemory(state.memoryJson,state.lastResolutionIndex))) throw new Error("NPC_STORED_CONTENT_CORRUPT");
}

/** Read the exact latest confirmed NPC receipt. This is server-internal and never synthesizes a default state. */
export async function readConfirmedNpcState(npcId: string): Promise<NpcSnapshot | null> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(npcId)) throw new Error("NPC_ID_INVALID");
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  return db.transaction(async tx => {
    const state = (await tx.select().from(aurionNpcStates).where(eq(aurionNpcStates.npcId,npcId)).limit(1))[0];
    if (!state || state.lastResolutionIndex < 0) return null;
    const receipt = (await tx.select().from(aurionNpcDecisionReceipts).where(and(eq(aurionNpcDecisionReceipts.npcId,npcId),eq(aurionNpcDecisionReceipts.resolutionIndex,state.lastResolutionIndex))).limit(1))[0];
    if (!receipt) throw new Error("NPC_STATE_RECEIPT_REQUIRED");
    const snapshot = decodeNpcReceipt(receipt.observationIdsJson,receipt);
    assertNpcStateMatchesReceipt(state,snapshot);
    return snapshot;
  });
}

/** Applies bounded needs and stores exactly one versioned life decision per NPC and resolution. */
export async function resolveAndRecordNpc(raw: NpcRequest): Promise<AurionNpcReadModel> {
  const input = normalizeNpcRequest(raw);
  const v3RequestHash = npcRequestHash(input,NPC_LIFE_RECEIPT_VERSION);
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
      const version = npcReceiptVersion(prior.observationIdsJson);
      const snapshot = decodeNpcReceipt(prior.observationIdsJson, { ...prior, requestHash: npcRequestHash(input,version) });
      const multiMemory = (await readNpcMultiMemoryForDecision(tx,prior.id))?.memory ?? null;
      return Object.freeze({ ...snapshot, source: "persisted" as const, multiMemory });
    }
    if (input.resolutionIndex <= current.lastResolutionIndex) throw new Error("NPC_RESOLUTION_OUT_OF_ORDER");
    const previousMultiMemory = await readPreviousNpcMultiMemory(tx,input.npcId,current.lastResolutionIndex);
    const currentNeeds = npcNeedsSchema.parse(parseNpcJson(current.needsJson));
    const currentMemory = parseNpcMemory(current.memoryJson, current.lastResolutionIndex);
    let previousLifeState = undefined;
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
        assertNpcStateMatchesReceipt(current,proof);
        previousLifeState = "lifeState" in proof ? proof.lifeState : undefined;
      }
    }
    const needs = resolveNpcNeeds({ current: currentNeeds, events: input.needEvents });
    const memory = advanceNpcMemory(currentMemory, input.memory, input.resolutionIndex);
    const snapshot = createNpcLifeSnapshot({ ...input, needs, memoryState: memory, ...(previousLifeState ? { previousLifeState } : {}) });
    const id = "npc_" + npcHash([NPC_LIFE_RECEIPT_VERSION, input.npcId, input.resolutionIndex]).slice(0, 56);
    const envelope = encodeNpcLifeReceipt(v3RequestHash, snapshot);
    await tx.update(aurionNpcStates).set({ regionId: input.regionId, needsJson: JSON.stringify(needs), memoryJson: JSON.stringify(memory), languageProfileId: input.languageProfileId, lastResolutionIndex: input.resolutionIndex }).where(eq(aurionNpcStates.npcId, input.npcId));
    // observationIdsJson is a versioned receipt envelope. All life state is receipt-owned and replay-verifiable.
    await tx.insert(aurionNpcDecisionReceipts).values({ id, npcId: input.npcId, regionId: input.regionId, resolutionIndex: input.resolutionIndex, observationIdsJson: envelope, goal: snapshot.decision.goal, decisionHash: snapshot.decision.decisionHash });
    const row = (await tx.select().from(aurionNpcDecisionReceipts).where(eq(aurionNpcDecisionReceipts.id, id)).limit(1))[0];
    if (!row) throw new Error("NPC decision readback failed");
    const readback = decodeNpcReceipt(row.observationIdsJson, { ...row, requestHash: v3RequestHash });
    const multiMemory = (await appendNpcMultiMemory(tx,row,previousMultiMemory)).memory;
    return Object.freeze({ ...readback, source: "created" as const, multiMemory });
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

/** Read-only public projection. Raw NPC memories and observation text stay on the server. */
export async function readConfirmedNpcPacket(userId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("NPC_PACKET_OWNER_INVALID");
  const db = await getDb(); if(!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const states = await tx.select().from(aurionNpcStates).where(inArray(aurionNpcStates.npcId,["lyra","orun"])).limit(3);
    if(states.length>2) throw new Error("NPC_PACKET_COUNT_INVALID");
    const projection: PublicNpcSnapshot[]=[];
    for(const state of states) {
      if(state.lastResolutionIndex<0) continue;
      const receipt=(await tx.select().from(aurionNpcDecisionReceipts).where(and(eq(aurionNpcDecisionReceipts.npcId,state.npcId),eq(aurionNpcDecisionReceipts.resolutionIndex,state.lastResolutionIndex))).limit(1))[0];
      if(!receipt) throw new Error("NPC_STATE_RECEIPT_REQUIRED");
      const snapshot=decodeNpcReceipt(receipt.observationIdsJson,receipt);
      assertNpcStateMatchesReceipt(state,snapshot);
      projection.push({npcId:snapshot.npcId,regionId:snapshot.regionId,resolutionIndex:snapshot.decision.resolutionIndex,goal:snapshot.decision.goal,needs:snapshot.needs,memoryCount:snapshot.memory.length,decisionHash:snapshot.decision.decisionHash});
    }
    return Object.freeze({userId,format:"aurion-public-npc.v2" as const,data:Buffer.from(encodeNpcSnapshot(projection)).toString("base64")});
  });
}
