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
} from "./aurionQuestlineProtocol";

export const AURION_FACTION_QUESTLINE_CONTENT_VERSION = "aurion-faction-questlines.v1" as const;
export const AURION_FACTION_QUESTLINE_RULESET_VERSION = "aurion-faction-questline-state.v1" as const;
export const permanentFactionChoices = ["sunward_concord", "ironwardens", "veiled_covenant", "wayfarer_compact"] as const;
export type PermanentAurionFaction = (typeof permanentFactionChoices)[number];
export type FactionQuestlineMode = "neutral" | "pledged";

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

const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const hash = (parts: readonly string[]): string => createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
const isResolutionIndex = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

export function getFactionOathQuestId(faction: AurionFaction): string {
  const oath = ["sunward_concord", "ironwardens", "veiled_covenant", "wayfarer_compact", "free_haven"]
    .map(candidate => candidate as AurionFaction)
    .flatMap(candidate => candidate === faction ? [candidate] : [])
    .flatMap(candidate => {
      const matching = [
        "concord.oath",
        "ironwardens.oath",
        "veiled_covenant.oath",
        "wayfarer_compact.oath",
        "free_haven.oath",
      ].filter(id => getQuestlineNode(id).faction === candidate);
      return matching;
    })[0];
  if (!oath) throw new Error("Aurion faction lacks an authored oath quest");
  return oath;
}

function sortedDecisionReceipts(decisions: readonly FactionQuestlineDecisionReceipt[]): readonly FactionQuestlineDecisionReceipt[] {
  return decisions.slice().sort((left, right) => left.resolutionIndex - right.resolutionIndex || compare(left.receiptId, right.receiptId));
}

function assertOath(input: FactionQuestlineStateInput): void {
  if (input.pledgedFaction === "free_haven") {
    if (input.oathReceipt !== null) throw new Error("Neutral faction state cannot contain a permanent oath receipt");
    return;
  }
  if (!input.oathReceipt || input.oathReceipt.playerId !== input.playerId || input.oathReceipt.toFaction !== input.pledgedFaction) {
    throw new Error("Pledged faction state requires its owned permanent oath receipt");
  }
  if (!input.oathReceipt.id || !input.oathReceipt.sourceReceiptId || !isResolutionIndex(input.oathReceipt.resolutionIndex)) {
    throw new Error("Permanent oath receipt is not valid");
  }
}

function canonicalDecisionEvidence(decision: FactionQuestlineDecisionReceipt): string {
  return [
    decision.playerId,
    decision.faction,
    decision.questId,
    decision.key,
    decision.approach,
    decision.receiptId,
    String(decision.resolutionIndex),
    decision.deterministicHash,
  ].join(":");
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

export function resolveFactionQuestline(input: FactionQuestlineStateInput): FactionQuestlineReadmodel {
  if (!input.playerId || !isResolutionIndex(input.lastResolutionIndex)) throw new Error("Faction questline state is not valid");
  assertOath(input);

  const ordered = sortedDecisionReceipts(input.decisions);
  const receiptIds = new Set<string>();
  const completed = new Set<string>();
  const approachScores: Partial<Record<QuestApproach, number>> = {};
  let faction: AurionFaction = input.oathReceipt ? input.oathReceipt.toFaction : "free_haven";
  let previousResolutionIndex = input.oathReceipt?.resolutionIndex ?? 0;
  if (input.oathReceipt) completed.add(getFactionOathQuestId(input.oathReceipt.toFaction));

  for (const decision of ordered) {
    if (decision.playerId !== input.playerId || decision.faction !== faction || !decision.receiptId || receiptIds.has(decision.receiptId)) {
      throw new Error("Faction questline decision receipt is not owned or unique");
    }
    if (!isResolutionIndex(decision.resolutionIndex) || decision.resolutionIndex <= previousResolutionIndex || decision.resolutionIndex > input.lastResolutionIndex) {
      throw new Error("Faction questline decision resolution index is not monotonic");
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
    const before = resolveQuestline({
      playerId: input.playerId,
      faction,
      completedQuestIds: Array.from(completed).sort(compare),
      decisions: [],
      approachScores,
      resolutionIndex: previousResolutionIndex,
    });
    const available = [...before.availableOathQuestIds, ...before.availableMainQuestIds, ...before.availableSideQuestIds];
    if (!available.includes(node.id)) throw new Error("Faction questline decision is not currently available");
    receiptIds.add(decision.receiptId);
    completed.add(node.id);
    approachScores[decision.approach] = (approachScores[decision.approach] ?? 0) + 1;
    previousResolutionIndex = decision.resolutionIndex;
  }

  if (previousResolutionIndex !== input.lastResolutionIndex) throw new Error("Faction questline state must end at its newest receipt index");
  const base = resolveQuestline({
    playerId: input.playerId,
    faction,
    completedQuestIds: Array.from(completed).sort(compare),
    decisions: [],
    approachScores,
    resolutionIndex: input.lastResolutionIndex,
  });
  const availableQuestIds = [...base.availableOathQuestIds, ...base.availableMainQuestIds, ...base.availableSideQuestIds].sort(compare);
  const availableObjectives = availableQuestIds.map(questId => {
    const node = getQuestlineNode(questId);
    return Object.freeze({
      questId: node.id,
      kind: node.kind,
      title: node.title,
      region: node.region,
      objective: node.objectiveByApproach[base.preferredApproach],
      decisionKeys: node.decisionKeys,
    });
  });
  const warfrontNode = ["warfront.concord", "warfront.ironwardens", "warfront.veiled_covenant", "warfront.wayfarer_compact", "warfront.free_haven"]
    .map(getQuestlineNode)
    .find(node => node.faction === faction);
  const warfront = warfrontNode?.warfrontBossKey
    ? Object.freeze({
      questId: warfrontNode.id,
      bossKey: warfrontNode.warfrontBossKey,
      region: warfrontNode.region,
      unlocked: warfrontNode.requires.every(required => completed.has(required)),
    })
    : null;
  const canonicalCompleted = Array.from(completed).sort(compare);
  return Object.freeze({
    mode: input.oathReceipt ? "pledged" : "neutral",
    faction,
    oathQuestId: getFactionOathQuestId(faction),
    completedQuestIds: canonicalCompleted,
    availableQuestIds,
    availableObjectives,
    preferredApproach: base.preferredApproach,
    warfront,
    lastResolutionIndex: input.lastResolutionIndex,
    deterministicHash: hash([
      AURION_FACTION_QUESTLINE_RULESET_VERSION,
      AURION_FACTION_QUESTLINE_CONTENT_VERSION,
      input.playerId,
      faction,
      String(input.lastResolutionIndex),
      input.oathReceipt ? factionQuestlineOathHash(input.oathReceipt) : "no-permanent-oath",
      ...canonicalCompleted,
      ...ordered.map(canonicalDecisionEvidence),
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
  if (!sourceReceiptId || input.pledgedFaction !== "free_haven" || input.oathReceipt !== null) return false;
  const resolved = resolveFactionQuestline(input);
  return resolved.completedQuestIds.includes("free_haven.mainline")
    && input.decisions.some(decision => decision.receiptId === sourceReceiptId && decision.questId === "free_haven.mainline")
    && permanentFactionChoices.includes(targetFaction);
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
