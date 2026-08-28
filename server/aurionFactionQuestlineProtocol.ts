import { createHash } from "node:crypto";
import {
  AURION_QUESTLINE_RULESET_VERSION,
  getQuestlineNode,
  questApproaches,
  resolveQuestDecision,
  resolveQuestline,
  type AurionFaction,
  type QuestApproach,
  type QuestDecision,
  type QuestNode,
  type AurionFactionStory,
} from "./aurionQuestlineProtocol";

export const AURION_FACTION_QUESTLINE_CONTENT_VERSION = "aurion-faction-questlines.v2-human-stories" as const;
export const AURION_FACTION_QUESTLINE_RULESET_VERSION = "aurion-faction-questline-state.v2-human-stories" as const;
export const permanentFactionChoices = ["sunward_concord", "ironwardens", "veiled_covenant", "wayfarer_compact"] as const;
export type PermanentAurionFaction = (typeof permanentFactionChoices)[number];
export type FactionQuestlineMode = "neutral" | "pledged";

const factionOathQuestIds = Object.freeze({
  sunward_concord: "concord.oath",
  ironwardens: "ironwardens.oath",
  veiled_covenant: "veiled_covenant.oath",
  wayfarer_compact: "wayfarer_compact.oath",
  free_haven: "free_haven.oath",
} as const satisfies Record<AurionFaction, string>);

export type FactionQuestlineOathReceipt = Readonly<{
  id: string;
  playerId: string;
  fromFaction: "free_haven";
  toFaction: PermanentAurionFaction;
  sourceQuestId: "free_haven.mainline";
  sourceReceiptId: string;
  resolutionIndex: number;
}>;

export type FactionQuestlineDecisionReceipt = Readonly<QuestDecision & {
  playerId: string;
  faction: AurionFaction;
  deterministicHash: string;
}>;

export type FactionQuestlineStateInput = Readonly<{
  playerId: string;
  pledgedFaction: AurionFaction;
  oathReceipt: FactionQuestlineOathReceipt | null;
  decisions: readonly FactionQuestlineDecisionReceipt[];
  lastResolutionIndex: number;
}>;

export type FactionQuestlineReadmodel = Readonly<{
  mode: FactionQuestlineMode;
  faction: AurionFaction;
  factionStory: AurionFactionStory;
  oathQuestId: string;
  completedQuestIds: readonly string[];
  availableQuestIds: readonly string[];
  availableObjectives: readonly Readonly<{
    questId: string;
    kind: QuestNode["kind"];
    title: string;
    region: string;
    objective: string;
    decisionKeys: readonly string[];
  }>[];
  preferredApproach: QuestApproach;
  warfront: Readonly<{ questId: string; bossKey: string; region: string; unlocked: boolean }> | null;
  lastResolutionIndex: number;
  deterministicHash: string;
}>;

type ResolvedDecisionState = Readonly<{
  completed: ReadonlySet<string>;
  approachScores: Readonly<Partial<Record<QuestApproach, number>>>;
  lastDecisionResolutionIndex: number;
}>;

const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const hash = (parts: readonly string[]): string => createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
const isResolutionIndex = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

export function getFactionOathQuestId(faction: AurionFaction): string {
  return factionOathQuestIds[faction];
}

function sortedDecisionReceipts(decisions: readonly FactionQuestlineDecisionReceipt[]): readonly FactionQuestlineDecisionReceipt[] {
  return decisions.slice().sort((left, right) => left.resolutionIndex - right.resolutionIndex || compare(left.receiptId, right.receiptId));
}

function canonicalDecisionEvidence(decision: FactionQuestlineDecisionReceipt): string {
  return [decision.playerId, decision.faction, decision.questId, decision.key, decision.approach, decision.receiptId, String(decision.resolutionIndex), decision.deterministicHash].join(":");
}

export function factionQuestlineDecisionHash(input: Readonly<{
  playerId: string;
  faction: AurionFaction;
  questId: string;
  decisionKey: string;
  approach: QuestApproach;
  receiptId: string;
  resolutionIndex: number;
}>): string {
  return hash([
    AURION_FACTION_QUESTLINE_RULESET_VERSION,
    AURION_FACTION_QUESTLINE_CONTENT_VERSION,
    input.playerId,
    input.faction,
    input.questId,
    input.decisionKey,
    input.approach,
    input.receiptId,
    String(input.resolutionIndex),
  ]);
}

export function factionQuestlineOathHash(input: FactionQuestlineOathReceipt): string {
  return hash([
    AURION_FACTION_QUESTLINE_RULESET_VERSION,
    AURION_FACTION_QUESTLINE_CONTENT_VERSION,
    input.id,
    input.playerId,
    input.fromFaction,
    input.toFaction,
    input.sourceQuestId,
    input.sourceReceiptId,
    String(input.resolutionIndex),
  ]);
}

function verifyDecisionReceipt(playerId: string, faction: AurionFaction, decision: FactionQuestlineDecisionReceipt, seenReceiptIds: Set<string>): void {
  if (decision.playerId !== playerId || decision.faction !== faction || !decision.receiptId || seenReceiptIds.has(decision.receiptId)) {
    throw new Error("Faction questline decision receipt is not owned or unique");
  }
  const node = getQuestlineNode(decision.questId);
  if (node.faction !== faction) throw new Error("Faction questline decision crosses faction boundary");
  const expectedHash = factionQuestlineDecisionHash({
    playerId: decision.playerId,
    faction: decision.faction,
    questId: decision.questId,
    decisionKey: decision.key,
    approach: decision.approach,
    receiptId: decision.receiptId,
    resolutionIndex: decision.resolutionIndex,
  });
  if (decision.deterministicHash !== expectedHash) throw new Error("Faction questline decision receipt hash is not valid");
  resolveQuestDecision({
    playerId: decision.playerId,
    nodeId: decision.questId,
    decisionKey: decision.key,
    approach: decision.approach,
    receiptId: decision.receiptId,
    resolutionIndex: decision.resolutionIndex,
  });
  seenReceiptIds.add(decision.receiptId);
}

function resolveDecisionSlice(input: Readonly<{
  playerId: string;
  faction: AurionFaction;
  decisions: readonly FactionQuestlineDecisionReceipt[];
  initialCompletedQuestIds: readonly string[];
  initialApproachScores: Readonly<Partial<Record<QuestApproach, number>>>;
  afterResolutionIndex: number;
  seenReceiptIds: Set<string>;
}>): ResolvedDecisionState {
  const completed = new Set(input.initialCompletedQuestIds);
  const approachScores: Partial<Record<QuestApproach, number>> = { ...input.initialApproachScores };
  let previousResolutionIndex = input.afterResolutionIndex;
  for (const decision of input.decisions) {
    if (!isResolutionIndex(decision.resolutionIndex) || decision.resolutionIndex <= previousResolutionIndex) {
      throw new Error("Faction questline decision resolution index is not monotonic");
    }
    verifyDecisionReceipt(input.playerId, input.faction, decision, input.seenReceiptIds);
    const before = resolveQuestline({
      playerId: input.playerId,
      faction: input.faction,
      completedQuestIds: Array.from(completed).sort(compare),
      decisions: [],
      approachScores,
      resolutionIndex: previousResolutionIndex,
    });
    const available = [...before.availableOathQuestIds, ...before.availableMainQuestIds, ...before.availableSideQuestIds];
    if (!available.includes(decision.questId)) throw new Error("Faction questline decision is not currently available");
    completed.add(decision.questId);
    approachScores[decision.approach] = (approachScores[decision.approach] ?? 0) + 1;
    previousResolutionIndex = decision.resolutionIndex;
  }
  return Object.freeze({ completed, approachScores, lastDecisionResolutionIndex: previousResolutionIndex });
}

function assertOathReceipt(input: FactionQuestlineStateInput): FactionQuestlineOathReceipt | null {
  const oath = input.oathReceipt;
  if (input.pledgedFaction === "free_haven") {
    if (oath !== null) throw new Error("Neutral faction state cannot contain a permanent oath receipt");
    return null;
  }
  if (!oath || oath.playerId !== input.playerId || oath.toFaction !== input.pledgedFaction || oath.fromFaction !== "free_haven" || oath.sourceQuestId !== "free_haven.mainline") {
    throw new Error("Pledged faction state requires its owned permanent oath receipt");
  }
  if (!oath.id || !oath.sourceReceiptId || !isResolutionIndex(oath.resolutionIndex)) throw new Error("Permanent oath receipt is not valid");
  return oath;
}

export function resolveFactionQuestline(input: FactionQuestlineStateInput): FactionQuestlineReadmodel {
  if (!input.playerId || !isResolutionIndex(input.lastResolutionIndex)) throw new Error("Faction questline state is not valid");
  const oath = assertOathReceipt(input);
  const ordered = sortedDecisionReceipts(input.decisions);
  const seenReceiptIds = new Set<string>();

  const beforeOath = oath ? ordered.filter(decision => decision.resolutionIndex < oath.resolutionIndex) : ordered;
  const afterOath = oath ? ordered.filter(decision => decision.resolutionIndex > oath.resolutionIndex) : [];
  if (oath && ordered.some(decision => decision.resolutionIndex === oath.resolutionIndex)) {
    throw new Error("Faction questline oath and decision cannot share a resolution index");
  }

  const neutral = resolveDecisionSlice({
    playerId: input.playerId,
    faction: "free_haven",
    decisions: beforeOath,
    initialCompletedQuestIds: [],
    initialApproachScores: {},
    afterResolutionIndex: 0,
    seenReceiptIds,
  });

  if (!oath) {
    if (neutral.lastDecisionResolutionIndex !== input.lastResolutionIndex) throw new Error("Faction questline state must end at its newest receipt index");
    return renderFactionQuestline({
      playerId: input.playerId,
      faction: "free_haven",
      mode: "neutral",
      completed: neutral.completed,
      approachScores: neutral.approachScores,
      decisions: ordered,
      oath: null,
      lastResolutionIndex: input.lastResolutionIndex,
    });
  }

  if (neutral.lastDecisionResolutionIndex >= oath.resolutionIndex || !neutral.completed.has("free_haven.mainline") || !beforeOath.some(decision => decision.receiptId === oath.sourceReceiptId && decision.questId === "free_haven.mainline")) {
    throw new Error("Permanent faction oath lacks its completed neutral route receipt");
  }

  const pledged = resolveDecisionSlice({
    playerId: input.playerId,
    faction: oath.toFaction,
    decisions: afterOath,
    initialCompletedQuestIds: [getFactionOathQuestId(oath.toFaction)],
    initialApproachScores: neutral.approachScores,
    afterResolutionIndex: oath.resolutionIndex,
    seenReceiptIds,
  });
  if (pledged.lastDecisionResolutionIndex !== input.lastResolutionIndex) throw new Error("Faction questline state must end at its newest receipt index");
  return renderFactionQuestline({
    playerId: input.playerId,
    faction: oath.toFaction,
    mode: "pledged",
    completed: new Set([...Array.from(neutral.completed), ...Array.from(pledged.completed)]),
    approachScores: pledged.approachScores,
    decisions: ordered,
    oath,
    lastResolutionIndex: input.lastResolutionIndex,
  });
}

function renderFactionQuestline(input: Readonly<{
  playerId: string;
  faction: AurionFaction;
  mode: FactionQuestlineMode;
  completed: ReadonlySet<string>;
  approachScores: Readonly<Partial<Record<QuestApproach, number>>>;
  decisions: readonly FactionQuestlineDecisionReceipt[];
  oath: FactionQuestlineOathReceipt | null;
  lastResolutionIndex: number;
}>): FactionQuestlineReadmodel {
  const completedQuestIds = Array.from(input.completed).sort(compare);
  const base = resolveQuestline({
    playerId: input.playerId,
    faction: input.faction,
    completedQuestIds,
    decisions: [],
    approachScores: input.approachScores,
    resolutionIndex: input.lastResolutionIndex,
  });
  const availableQuestIds = [...base.availableOathQuestIds, ...base.availableMainQuestIds, ...base.availableSideQuestIds].sort(compare);
  const availableObjectives = availableQuestIds.map(questId => {
    const node = getQuestlineNode(questId);
    return Object.freeze({ questId: node.id, kind: node.kind, title: node.title, region: node.region, objective: node.objectiveByApproach[base.preferredApproach], decisionKeys: node.decisionKeys });
  });
  const warfrontNode = ["warfront.concord", "warfront.ironwardens", "warfront.veiled_covenant", "warfront.wayfarer_compact", "warfront.free_haven"]
    .map(getQuestlineNode)
    .find(node => node.faction === input.faction);
  const warfront = warfrontNode?.warfrontBossKey
    ? Object.freeze({ questId: warfrontNode.id, bossKey: warfrontNode.warfrontBossKey, region: warfrontNode.region, unlocked: warfrontNode.requires.every(required => input.completed.has(required)) })
    : null;
  return Object.freeze({
    mode: input.mode,
    faction: input.faction,
    factionStory: base.factionStory,
    oathQuestId: getFactionOathQuestId(input.faction),
    completedQuestIds,
    availableQuestIds,
    availableObjectives,
    preferredApproach: base.preferredApproach,
    warfront,
    lastResolutionIndex: input.lastResolutionIndex,
    deterministicHash: hash([
      AURION_FACTION_QUESTLINE_RULESET_VERSION,
      AURION_FACTION_QUESTLINE_CONTENT_VERSION,
      input.playerId,
      input.faction,
      base.factionStory.title,
      base.factionStory.humanTruth,
      base.factionStory.coreQuestline,
      String(input.lastResolutionIndex),
      input.oath ? factionQuestlineOathHash(input.oath) : "no-permanent-oath",
      ...completedQuestIds,
      ...input.decisions.map(canonicalDecisionEvidence),
      ...availableQuestIds,
      base.preferredApproach,
      warfront?.questId ?? "no-warfront",
      warfront?.bossKey ?? "no-boss",
      warfront?.unlocked ? "warfront-unlocked" : "warfront-locked",
      AURION_QUESTLINE_RULESET_VERSION,
    ]),
  });
}

export function mayPledgeFaction(input: FactionQuestlineStateInput, targetFaction: PermanentAurionFaction, sourceReceiptId: string): boolean {
  if (!sourceReceiptId || input.pledgedFaction !== "free_haven" || input.oathReceipt !== null || !permanentFactionChoices.includes(targetFaction)) return false;
  const resolved = resolveFactionQuestline(input);
  return resolved.completedQuestIds.includes("free_haven.mainline") && input.decisions.some(decision => decision.receiptId === sourceReceiptId && decision.questId === "free_haven.mainline");
}

export function isFactionQuestDecisionAvailable(input: FactionQuestlineStateInput, questId: string): boolean {
  return resolveFactionQuestline(input).availableQuestIds.includes(questId);
}

export function factionQuestlineNextResolutionIndex(input: FactionQuestlineStateInput): number {
  if (!isResolutionIndex(input.lastResolutionIndex) || input.lastResolutionIndex >= Number.MAX_SAFE_INTEGER) throw new Error("Faction questline resolution index is exhausted");
  return input.lastResolutionIndex + 1;
}

export function factionQuestlineApproachScoreTemplate(): Readonly<Record<QuestApproach, number>> {
  return Object.freeze(Object.fromEntries(questApproaches.map(approach => [approach, 0])) as Record<QuestApproach, number>);
}
