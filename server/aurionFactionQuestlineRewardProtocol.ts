import { createHash } from "node:crypto";
import { getFactionStory, getQuestlineNode, questApproaches, type AurionFaction, type QuestApproach } from "./aurionQuestlineProtocol";
import { resolveFactionQuestline, type FactionQuestlineDecisionReceipt, type FactionQuestlineStateInput, type FactionQuestlineCompletionReceipt } from "./aurionFactionQuestlineProtocol";

export const AURION_FACTION_QUESTLINE_REWARD_CONTENT_VERSION = "aurion-faction-questline-rewards.v1" as const;
export const AURION_FACTION_QUESTLINE_REWARD_RULESET_VERSION = "aurion-faction-questline-rewards.v1" as const;

export type FactionQuestlineReward = Readonly<{
  rewardKey: string;
  faction: AurionFaction;
  questId: string;
  approach: QuestApproach;
  xp: number;
  points: number;
  victory: number;
  reason: string;
}>;

export type FactionQuestlineCompletionResolution = Readonly<{
  completionReceiptId: string;
  reward: FactionQuestlineReward;
  completionResolutionIndex: number;
  rewardDigest: string;
}>;

const compare = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const digest = (parts: readonly string[]): string => createHash("sha256").update(parts.join("\u001f"), "utf8").digest("hex");
const rewardableKinds = new Set(["main", "side", "warfront"] as const);
const approachBonus: Readonly<Record<QuestApproach, number>> = Object.freeze({ trade: 0, craft: 2, combat: 4, espionage: 3, exploration: 1 });

function assertSafePositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
}

function authoredApproach(questId: string, approach: QuestApproach): void {
  const node = getQuestlineNode(questId);
  if (!node.preferredApproaches.includes(approach)) throw new Error("Questline reward approach is not authored for this quest");
  if (!node.objectiveByApproach[approach]?.trim()) throw new Error("Questline reward objective is missing for this approach");
}

export function getFactionQuestlineRewardDefinition(input: Readonly<{ faction: AurionFaction; questId: string; approach: QuestApproach }>): FactionQuestlineReward {
  const node = getQuestlineNode(input.questId);
  if (node.faction !== input.faction) throw new Error("Questline reward crosses faction boundary");
  if (!rewardableKinds.has(node.kind as "main" | "side" | "warfront")) throw new Error("This quest node cannot issue a completion reward");
  authoredApproach(input.questId, input.approach);
  const story = getFactionStory(input.faction);
  const kindBase = node.kind === "warfront" ? { xp: 260, points: 120, victory: 1 } : node.kind === "main" ? { xp: 180, points: 70, victory: 1 } : { xp: 90, points: 30, victory: 0 };
  return Object.freeze({
    rewardKey: `faction-questline:${input.faction}:${input.questId}:${input.approach}`,
    faction: input.faction,
    questId: input.questId,
    approach: input.approach,
    xp: kindBase.xp + approachBonus[input.approach],
    points: kindBase.points,
    victory: kindBase.victory,
    reason: `${story.title}: ${node.title}`,
  });
}

function decisionForQuest(input: FactionQuestlineStateInput, questId: string): FactionQuestlineDecisionReceipt {
  const decisions = input.decisions.filter(decision => decision.questId === questId).sort((left, right) => right.resolutionIndex - left.resolutionIndex || compare(right.receiptId, left.receiptId));
  const decision = decisions[0];
  if (!decision) throw new Error("Questline completion requires an authored decision receipt");
  return decision;
}

export function resolveFactionQuestlineCompletion(input: Readonly<{
  state: FactionQuestlineStateInput;
  questId: string;
  completionReceiptId: string;
  completionResolutionIndex: number;
}>): FactionQuestlineCompletionResolution {
  if (!input.completionReceiptId.trim()) throw new Error("Questline completion receipt id is required");
  assertSafePositiveInteger(input.completionResolutionIndex, "completionResolutionIndex");
  if (input.completionResolutionIndex <= input.state.lastResolutionIndex) throw new Error("Questline completion resolution index must advance the state");
  const readmodel = resolveFactionQuestline(input.state);
  if (!readmodel.completedQuestIds.includes(input.questId)) throw new Error("Questline completion requires a confirmed completed quest decision");
  const decision = decisionForQuest(input.state, input.questId);
  if (decision.faction !== readmodel.faction) throw new Error("Questline completion decision is not owned by the pledged faction");
  const reward = getFactionQuestlineRewardDefinition({ faction: readmodel.faction, questId: input.questId, approach: decision.approach });
  const rewardDigest = digest([
    AURION_FACTION_QUESTLINE_REWARD_RULESET_VERSION,
    AURION_FACTION_QUESTLINE_REWARD_CONTENT_VERSION,
    input.state.playerId,
    input.completionReceiptId,
    String(input.completionResolutionIndex),
    reward.rewardKey,
    String(reward.xp),
    String(reward.points),
    String(reward.victory),
    decision.receiptId,
    String(decision.resolutionIndex),
  ]);
  return Object.freeze({ completionReceiptId: input.completionReceiptId, reward, completionResolutionIndex: input.completionResolutionIndex, rewardDigest });
}

export function factionQuestlineRewardApproaches(): readonly QuestApproach[] {
  return questApproaches.slice();
}

/** Rebuilds immutable completion evidence from the actual owned authored reward and decision. */
export function verifiedFactionCompletion(row: { id: string; userId: number; faction: string; questId: string; approach: string; sourceDecisionReceiptId: string; completionResolutionIndex: number; rewardKey: string; xp: number; points: number; victory: number; rewardDigest: string; contentVersion: string; ruleSetVersion: string }, playerId: string, decisions: readonly FactionQuestlineDecisionReceipt[]): FactionQuestlineCompletionReceipt {
  const source = decisions.find(d => d.receiptId === row.sourceDecisionReceiptId);
  if (String(row.userId) !== playerId || !source || source.playerId !== playerId || source.faction !== row.faction || source.questId !== row.questId || source.approach !== row.approach || row.ruleSetVersion !== AURION_FACTION_QUESTLINE_REWARD_RULESET_VERSION || row.contentVersion !== AURION_FACTION_QUESTLINE_REWARD_CONTENT_VERSION) throw new Error("FACTION_COMPLETION_EVIDENCE_INVALID");
  const reward = getFactionQuestlineRewardDefinition({ faction: source.faction, questId: source.questId, approach: source.approach });
  const expected = digest([row.ruleSetVersion,row.contentVersion,playerId,row.id,String(row.completionResolutionIndex),reward.rewardKey,String(reward.xp),String(reward.points),String(reward.victory),source.receiptId,String(source.resolutionIndex)]);
  if (row.rewardKey !== reward.rewardKey || row.xp !== reward.xp || row.points !== reward.points || row.victory !== reward.victory || row.rewardDigest !== expected) throw new Error("FACTION_COMPLETION_EVIDENCE_INVALID");
  return Object.freeze({ id: row.id, playerId, faction: source.faction, questId: source.questId, sourceDecisionReceiptId: source.receiptId, resolutionIndex: row.completionResolutionIndex, rewardDigest: row.rewardDigest });
}
