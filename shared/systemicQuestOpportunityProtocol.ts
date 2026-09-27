import { canonicalSha256 } from "./aurionCanonicalHash";
import type { WorldDirectorDecision, WorldIntentKind } from "./worldPressureProtocol";

export const AURION_SYSTEMIC_QUEST_OPPORTUNITY_VERSION = "aurion.systemic-quest-opportunity.v1" as const;
export const SYSTEMIC_QUEST_OPPORTUNITY_MAX = 32;
export const SYSTEMIC_QUEST_EXPIRATION_POLICY = "aurion.quest.opportunity.expire.16-ticks.v1" as const;
export const SYSTEMIC_QUEST_REWARD_POLICY = "aurion.quest.opportunity.reward.v1" as const;

export const SYSTEMIC_QUEST_TYPES = [
  "ESCORT_CARAVAN",
  "LOCATE_SUPPLIER",
  "DELIVER_RESOURCE",
  "INVESTIGATE_SHORTAGE",
  "NEGOTIATE_ROUTE_ACCESS",
  "SUPPORT_MIGRATION",
] as const;
export type SystemicQuestType = (typeof SYSTEMIC_QUEST_TYPES)[number];

export type ConfirmedSystemicQuestActor = Readonly<{
  actorId: string;
  regionId: string;
}>;

export type QuestOpportunity = Readonly<{
  version: typeof AURION_SYSTEMIC_QUEST_OPPORTUNITY_VERSION;
  opportunityId: string;
  sourceReceiptIds: readonly string[];
  originTick: number;
  actorIds: readonly string[];
  type: SystemicQuestType;
  sourceRegionId: string;
  targetRegionId: string | null;
  magnitudeBps: number;
  prerequisiteHash: string;
  expirationPolicyVersion: typeof SYSTEMIC_QUEST_EXPIRATION_POLICY;
  expirationTick: number;
  rewardIntentHash: string;
  questTemplateId: string;
  opportunityHash: string;
}>;

export type SystemicQuestOpportunitySet = Readonly<{
  version: typeof AURION_SYSTEMIC_QUEST_OPPORTUNITY_VERSION;
  worldId: string;
  sourceRevision: string;
  originTick: number;
  sourceCausalReceiptHash: string;
  opportunities: readonly QuestOpportunity[];
  candidateSetHash: string;
}>;

const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REVISION_RE = /^[a-f0-9]{40}$/;
const RECEIPT_HASH_RE = /^sha256:[a-f0-9]{64}$/;

function id(value: string, label: string): string {
  const normalized = value.trim();
  if (!IDENTIFIER_RE.test(normalized)) throw new Error(`SYSTEMIC_QUEST_${label.toUpperCase()}_INVALID`);
  return normalized;
}

function nonNegativeInt(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`SYSTEMIC_QUEST_${label.toUpperCase()}_INVALID`);
  return value;
}

function bps(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) throw new Error("SYSTEMIC_QUEST_MAGNITUDE_INVALID");
  return value;
}

function revision(value: string): string {
  const normalized = value.trim();
  if (!REVISION_RE.test(normalized)) throw new Error("SYSTEMIC_QUEST_SOURCE_REVISION_INVALID");
  return normalized;
}

function receipt(value: string): string {
  const normalized = value.trim();
  if (!RECEIPT_HASH_RE.test(normalized)) throw new Error("SYSTEMIC_QUEST_SOURCE_RECEIPT_INVALID");
  return normalized;
}

function mapIntent(kind: WorldIntentKind): SystemicQuestType {
  switch (kind) {
    case "caravan": return "ESCORT_CARAVAN";
    case "supply_intervention": return "DELIVER_RESOURCE";
    case "migration": return "SUPPORT_MIGRATION";
    case "regional_defense": return "NEGOTIATE_ROUTE_ACCESS";
    case "pressure_escalation": return "INVESTIGATE_SHORTAGE";
    case "event_opportunity": return "LOCATE_SUPPLIER";
  }
}

function templateFor(type: SystemicQuestType): string {
  return `tpl_systemic_${type.toLowerCase()}`;
}

export function createQuestOpportunity(input: Omit<QuestOpportunity, "version"|"opportunityHash">): QuestOpportunity {
  const sourceReceiptIds = [...input.sourceReceiptIds].map(value => receipt(value)).sort();
  if (sourceReceiptIds.length < 1 || new Set(sourceReceiptIds).size !== sourceReceiptIds.length) {
    throw new Error("SYSTEMIC_QUEST_SOURCE_RECEIPTS_INVALID");
  }
  const actorIds = [...input.actorIds].map(value => id(value, "ACTOR_ID")).sort();
  if (new Set(actorIds).size !== actorIds.length) throw new Error("SYSTEMIC_QUEST_ACTORS_DUPLICATE");
  const normalized = Object.freeze({
    version: AURION_SYSTEMIC_QUEST_OPPORTUNITY_VERSION,
    opportunityId: id(input.opportunityId, "OPPORTUNITY_ID"),
    sourceReceiptIds: Object.freeze(sourceReceiptIds),
    originTick: nonNegativeInt(input.originTick, "ORIGIN_TICK"),
    actorIds: Object.freeze(actorIds),
    type: input.type,
    sourceRegionId: id(input.sourceRegionId, "SOURCE_REGION_ID"),
    targetRegionId: input.targetRegionId === null ? null : id(input.targetRegionId, "TARGET_REGION_ID"),
    magnitudeBps: bps(input.magnitudeBps),
    prerequisiteHash: receipt(input.prerequisiteHash),
    expirationPolicyVersion: SYSTEMIC_QUEST_EXPIRATION_POLICY,
    expirationTick: nonNegativeInt(input.expirationTick, "EXPIRATION_TICK"),
    rewardIntentHash: receipt(input.rewardIntentHash),
    questTemplateId: id(input.questTemplateId, "QUEST_TEMPLATE_ID"),
  });
  if (normalized.expirationTick < normalized.originTick) throw new Error("SYSTEMIC_QUEST_EXPIRATION_INVALID");
  return Object.freeze({
    ...normalized,
    opportunityHash: canonicalSha256({
      domain: AURION_SYSTEMIC_QUEST_OPPORTUNITY_VERSION,
      opportunity: normalized,
    }),
  });
}

export function deriveSystemicQuestOpportunities(input: Readonly<{
  worldId: string;
  sourceRevision: string;
  decision: WorldDirectorDecision;
  confirmedActors: readonly ConfirmedSystemicQuestActor[];
  maxCandidates?: number;
}>): SystemicQuestOpportunitySet {
  if (!id(input.worldId, "WORLD_ID")) throw new Error("SYSTEMIC_QUEST_WORLD_ID_INVALID");
  const sourceRevision = revision(input.sourceRevision);
  const decision = input.decision;
  if (decision.worldId !== input.worldId || decision.sourceRevision !== sourceRevision) {
    throw new Error("SYSTEMIC_QUEST_WORLD_SCOPE_MISMATCH");
  }
  const causalReceiptHash = receipt(decision.causalReceiptHash);
  const sourceActors = [...input.confirmedActors].map(actor => ({
    actorId: id(actor.actorId, "ACTOR_ID"),
    regionId: id(actor.regionId, "ACTOR_REGION_ID"),
  })).sort((a,b) => a.regionId.localeCompare(b.regionId) || a.actorId.localeCompare(b.actorId));
  const actorIdsByRegion = new Map<string, string[]>();
  for (const actor of sourceActors) {
    const list = actorIdsByRegion.get(actor.regionId) ?? [];
    list.push(actor.actorId);
    actorIdsByRegion.set(actor.regionId, list);
  }

  const maxCandidates = input.maxCandidates ?? SYSTEMIC_QUEST_OPPORTUNITY_MAX;
  if (!Number.isSafeInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > SYSTEMIC_QUEST_OPPORTUNITY_MAX) {
    throw new Error("SYSTEMIC_QUEST_MAX_CANDIDATES_INVALID");
  }

  const rawIntents = [...decision.intents].sort((a,b) =>
    a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind) || a.sourceRegionId.localeCompare(b.sourceRegionId)
  );
  if (rawIntents.length > maxCandidates) throw new Error("SYSTEMIC_QUEST_CANDIDATE_BOUND_EXCEEDED");

  const opportunities = rawIntents.map(intent => {
    const actors = [
      ...(actorIdsByRegion.get(intent.sourceRegionId) ?? []),
      ...(intent.targetRegionId ? actorIdsByRegion.get(intent.targetRegionId) ?? [] : []),
    ].sort();
    const uniqueActors = [...new Set(actors)];
    const type = mapIntent(intent.kind);
    const opportunityId = `sqo_${canonicalSha256({
      domain: "aurion.systemic-quest-opportunity.identity.v1",
      worldId: input.worldId,
      sourceRevision,
      causalReceiptHash,
      intentId: intent.id,
      decisionHash: decision.decisionHash,
    }).slice("sha256:".length, "sha256:".length + 40)}`;
    const prerequisiteHash = canonicalSha256({
      domain: "aurion.systemic-quest-opportunity.prerequisite.v1",
      worldId: input.worldId,
      sourceRevision,
      sourceCausalReceiptHash: causalReceiptHash,
      candidateId: intent.candidateId,
      decisionHash: decision.decisionHash,
      sourceRegionId: intent.sourceRegionId,
      targetRegionId: intent.targetRegionId,
      kind: intent.kind,
      magnitudeBps: intent.magnitudeBps,
      actors: uniqueActors,
    });
    const rewardIntentHash = canonicalSha256({
      domain: SYSTEMIC_QUEST_REWARD_POLICY,
      opportunityType: type,
      magnitudeBps: intent.magnitudeBps,
      sourceRegionId: intent.sourceRegionId,
      targetRegionId: intent.targetRegionId,
    });
    return createQuestOpportunity({
      opportunityId,
      sourceReceiptIds: [causalReceiptHash],
      originTick: decision.logicalTick,
      actorIds: uniqueActors,
      type,
      sourceRegionId: intent.sourceRegionId,
      targetRegionId: intent.targetRegionId,
      magnitudeBps: intent.magnitudeBps,
      prerequisiteHash,
      expirationTick: decision.logicalTick + 16,
      rewardIntentHash,
      questTemplateId: templateFor(type),
    });
  });

  const candidateSetHash = canonicalSha256({
    domain: "aurion.systemic-quest-opportunity.candidate-set.v1",
    worldId: input.worldId,
    sourceRevision,
    sourceCausalReceiptHash: causalReceiptHash,
    opportunities,
  });

  return Object.freeze({
    version: AURION_SYSTEMIC_QUEST_OPPORTUNITY_VERSION,
    worldId: input.worldId,
    sourceRevision,
    originTick: decision.logicalTick,
    sourceCausalReceiptHash: causalReceiptHash,
    opportunities: Object.freeze(opportunities),
    candidateSetHash,
  });
}

export function opportunityToWorldEvent(opportunity: QuestOpportunity) {
  return Object.freeze({
    id: `evt_systemic_quest_${opportunity.opportunityId.slice(4)}`,
    sequence: opportunity.originTick,
    type: "SYSTEMIC_QUEST_OPPORTUNITY",
    source: "aurion_systemic_quest_derivation",
    data: Object.freeze({
      schema: AURION_SYSTEMIC_QUEST_OPPORTUNITY_VERSION,
      opportunityId: opportunity.opportunityId,
      sourceReceiptIds: opportunity.sourceReceiptIds,
      originTick: opportunity.originTick,
      actorIds: opportunity.actorIds,
      type: opportunity.type,
      sourceRegionId: opportunity.sourceRegionId,
      targetRegionId: opportunity.targetRegionId,
      magnitudeBps: opportunity.magnitudeBps,
      prerequisiteHash: opportunity.prerequisiteHash,
      expirationPolicyVersion: opportunity.expirationPolicyVersion,
      expirationTick: opportunity.expirationTick,
      rewardIntentHash: opportunity.rewardIntentHash,
      questTemplateId: opportunity.questTemplateId,
      opportunityHash: opportunity.opportunityHash,
    }),
  });
}
