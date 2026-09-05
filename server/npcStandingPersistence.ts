import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { aurionScopedMasteryEvents } from "../drizzle/professionPersistenceSchema";
import { aurionFactionQuestlineDecisionReceipts, aurionFactionQuestlineRewardReceipts, gameplayQuestProgress, gameplaySessions } from "../drizzle/schema";
import type { getDb } from "./db";
import { getEncounter, getQuest, type QuestKey, type EncounterKey } from "./gameplayProtocol";
import { canonicalScopedMasteryKey, masteryKeys, resolveCoupledMasteries, SCOPED_MASTERY_RULESET_VERSION, type ScopedMasteryEvent, type ScopedMasteryKey } from "./scopedMasteryProtocol";
import { stableCatalogStringify } from "./aurionAx1ContentCatalog";
import { socialMasteryEvidence } from "./ax1LivingWorldProtocol";
import { AURION_FACTION_QUESTLINE_REWARD_RULESET_VERSION, AURION_FACTION_QUESTLINE_REWARD_CONTENT_VERSION, getFactionQuestlineRewardDefinition } from "./aurionFactionQuestlineRewardProtocol";
import type { AurionFaction, QuestApproach } from "./aurionQuestlineProtocol";
import { standingReadbackSchema, standingTier } from "../shared/npcStanding";

const VERSION = "aurion-standing-receipts.v1";
type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Reader = Pick<Database, "select">;
type Writer = Pick<Database, "select" | "insert">;
const hash = (value: unknown) => createHash("sha256").update(stableCatalogStringify(value)).digest("hex");
const factions = ["sunward_concord", "ironwardens", "veiled_covenant", "wayfarer_compact", "free_haven"] as const;
const keys: readonly ScopedMasteryKey[] = [masteryKeys.social("friendship"), masteryKeys.social("diplomacy"), masteryKeys.npcRelation("lyra"), masteryKeys.npcRelation("orun"), ...factions.map(masteryKeys.faction)];

export function relationshipEvents(input: { userId: number; receiptId: string; resolutionIndex: number; kind: "npc_relation" | "faction"; targetId: string; sourceKind: "native_quest" | "faction_quest" }): readonly ScopedMasteryEvent[] {
  if (!Number.isSafeInteger(input.userId) || input.userId < 1 || !/^[A-Za-z0-9._:-]{8,64}$/.test(input.receiptId) || !Number.isSafeInteger(input.resolutionIndex) || input.resolutionIndex < 1 || input.resolutionIndex > 2147483647) throw new Error("RELATIONSHIP_SOURCE_INVALID");
  if (input.kind === "npc_relation" ? input.sourceKind !== "native_quest" || !["lyra", "orun"].includes(input.targetId) : input.sourceKind !== "faction_quest" || !(factions as readonly string[]).includes(input.targetId)) throw new Error("RELATIONSHIP_TARGET_INVALID");
  const socialAction = input.kind === "npc_relation" ? "friendship" : "diplomacy";
  const evidence = socialMasteryEvidence(socialAction, input.receiptId, input.resolutionIndex);
  return Object.freeze([masteryKeys.social(socialAction), input.kind === "npc_relation" ? masteryKeys.npcRelation(input.targetId) : masteryKeys.faction(input.targetId)].map(key => Object.freeze({
    receiptId: input.receiptId,
    idempotencyKey: `rel_${hash([VERSION, input.userId, input.receiptId, canonicalScopedMasteryKey(key)]).slice(0,56)}`,
    resolutionIndex: input.resolutionIndex, key, amountExact: evidence.amountExact,
    contextMetricsExact: Object.freeze<Record<string, string>>(key.scopeType === "social" ? {} : { standing_positive: String(evidence.reputationDelta) }),
    serverValidated: true, activeDurationTicks: 1, repetitionStreak: 0, distinctContextCount: 1,
    ruleSetVersion: SCOPED_MASTERY_RULESET_VERSION, contentVersion: VERSION,
  })));
}

async function persist(tx: Writer, userId: number, events: readonly ScopedMasteryEvent[]) {
  // Called within the owning quest transaction. There is no independently exposed grant endpoint.
  for (const event of events) {
    const existing = (await tx.select().from(aurionScopedMasteryEvents).where(eq(aurionScopedMasteryEvents.id,event.idempotencyKey)).limit(1))[0];
    if (existing) {
      if (existing.userId !== userId || existing.eventHash !== hash(event) || existing.eventJson !== stableCatalogStringify(event)) throw new Error("RELATIONSHIP_RECEIPT_CONFLICT");
      continue;
    }
    await tx.insert(aurionScopedMasteryEvents).values({ id: event.idempotencyKey, userId, scopeKey: canonicalScopedMasteryKey(event.key), professionReceiptId: event.receiptId, eventHash: hash(event), eventJson: stableCatalogStringify(event) });
  }
}
export async function commitNativeQuestRelationship(tx: Writer, input: { userId: number; questKey: QuestKey; sessionId: string; nextSequence: number }) {
  const quest = getQuest(input.questKey);
  await persist(tx,input.userId,relationshipEvents({ userId: input.userId, receiptId: input.sessionId, resolutionIndex: input.nextSequence - 1, kind: "npc_relation", targetId: quest.giver === "Lyra" ? "lyra" : "orun", sourceKind: "native_quest" }));
}
export async function commitFactionQuestRelationship(tx: Writer, input: { userId: number; receiptId: string; resolutionIndex: number; faction: string }) {
  await persist(tx,input.userId,relationshipEvents({ ...input, kind: "faction", targetId: input.faction, sourceKind: "faction_quest" }));
}

export async function readRelationshipStanding(reader: Reader, userId: number) {
  if (!Number.isSafeInteger(userId) || userId < 1) throw new Error("RELATIONSHIP_OWNER_INVALID");
  const rows = await reader.select().from(aurionScopedMasteryEvents).where(and(eq(aurionScopedMasteryEvents.userId,userId),inArray(aurionScopedMasteryEvents.scopeKey,keys.map(canonicalScopedMasteryKey)))).limit(4097);
  if (rows.length > 4096) throw new Error("RELATIONSHIP_CHECKPOINT_REQUIRED");
  const events: ScopedMasteryEvent[] = [];
  // Reconstruct each expected event from its actual owned completion, not from mutable event JSON.
  for (const row of rows) {
    let expected: readonly ScopedMasteryEvent[];
    const native = (await reader.select({ quest: gameplayQuestProgress, session: gameplaySessions }).from(gameplayQuestProgress)
      .innerJoin(gameplaySessions,eq(gameplayQuestProgress.completionSessionId,gameplaySessions.id))
      .where(and(eq(gameplayQuestProgress.userId,userId),eq(gameplayQuestProgress.state,"completed"),eq(gameplaySessions.id,row.professionReceiptId),eq(gameplaySessions.userId,userId),eq(gameplaySessions.status,"completed"))).limit(1))[0];
    if (native) {
      const quest = getQuest(native.quest.questKey as QuestKey);
      if (native.session.bossHp !== 0 || native.session.nextSequence < 2 || getEncounter(native.session.encounterKey as EncounterKey).questKey !== quest.key) throw new Error("RELATIONSHIP_SOURCE_CORRUPT");
      expected = relationshipEvents({ userId, receiptId: native.session.id, resolutionIndex: native.session.nextSequence - 1, kind: "npc_relation", targetId: quest.giver === "Lyra" ? "lyra" : "orun", sourceKind: "native_quest" });
    } else {
      const faction = (await reader.select().from(aurionFactionQuestlineRewardReceipts).where(and(eq(aurionFactionQuestlineRewardReceipts.id,row.professionReceiptId),eq(aurionFactionQuestlineRewardReceipts.userId,userId))).limit(1))[0];
      if (!faction) throw new Error("RELATIONSHIP_SOURCE_MISSING");
      const decision = (await reader.select().from(aurionFactionQuestlineDecisionReceipts).where(and(eq(aurionFactionQuestlineDecisionReceipts.id,faction.sourceDecisionReceiptId),eq(aurionFactionQuestlineDecisionReceipts.userId,userId))).limit(1))[0];
      const reward = getFactionQuestlineRewardDefinition({ faction: faction.faction as AurionFaction, questId: faction.questId, approach: faction.approach as QuestApproach });
      if (!decision || decision.questId !== faction.questId || decision.faction !== faction.faction || decision.approach !== faction.approach || faction.ruleSetVersion !== AURION_FACTION_QUESTLINE_REWARD_RULESET_VERSION || faction.contentVersion !== AURION_FACTION_QUESTLINE_REWARD_CONTENT_VERSION || faction.rewardKey !== reward.rewardKey || faction.xp !== reward.xp || faction.points !== reward.points || faction.victory !== reward.victory) throw new Error("RELATIONSHIP_SOURCE_CORRUPT");
      const digest = createHash("sha256").update([faction.ruleSetVersion,faction.contentVersion,String(userId),faction.id,String(faction.completionResolutionIndex),reward.rewardKey,String(reward.xp),String(reward.points),String(reward.victory),decision.id,String(decision.resolutionIndex)].join("\u001f")).digest("hex");
      if (digest !== faction.rewardDigest) throw new Error("RELATIONSHIP_SOURCE_CORRUPT");
      expected = relationshipEvents({ userId, receiptId: faction.id, resolutionIndex: faction.completionResolutionIndex, kind: "faction", targetId: faction.faction, sourceKind: "faction_quest" });
    }
    if (expected.some(e => !rows.some(candidate => candidate.id === e.idempotencyKey))) throw new Error("RELATIONSHIP_PAIR_INCOMPLETE");
    const event = expected.find(e => e.idempotencyKey === row.id);
    if (!event || row.eventHash !== hash(event) || row.eventJson !== stableCatalogStringify(event) || row.scopeKey !== canonicalScopedMasteryKey(event.key)) throw new Error("RELATIONSHIP_EVENT_CORRUPT");
    events.push(event);
  }
  const states = resolveCoupledMasteries({ actorId: `player:${userId}`, keys, events });
  return standingReadbackSchema.parse({ userId,
    entries: states.filter(s => s.key.scopeType !== "social").map(s => {
      const score = Number(BigInt(s.contextMetricsExact.standing_positive ?? "0") > 100n ? 100n : BigInt(s.contextMetricsExact.standing_positive ?? "0"));
      return { kind: s.key.scopeType, id: s.key.scopeId, score, tier: standingTier(score), sourceCount: s.appliedReceiptIds.length, xpExact: s.progression.totalXpExact, levelExact: s.progression.levelExact };
    }),
    social: states.filter(s => s.key.scopeType === "social").map(s => ({ id: s.key.scopeId, xpExact: s.progression.totalXpExact, levelExact: s.progression.levelExact, usesExact: s.lifetimeUsesExact })),
  });
}
