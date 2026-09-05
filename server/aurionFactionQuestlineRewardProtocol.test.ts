import { describe, expect, it } from "vitest";
import { resolveFactionQuestline, factionQuestlineDecisionHash, type FactionQuestlineDecisionReceipt, type FactionQuestlineStateInput } from "./aurionFactionQuestlineProtocol";
import { getFactionQuestlineRewardDefinition, resolveFactionQuestlineCompletion } from "./aurionFactionQuestlineRewardProtocol";

function decision(input: Readonly<{
  faction: FactionQuestlineDecisionReceipt["faction"];
  questId: string;
  key: string;
  approach: FactionQuestlineDecisionReceipt["approach"];
  receiptId: string;
  resolutionIndex: number;
}>): FactionQuestlineDecisionReceipt {
  return {
    playerId: "reward-player",
    faction: input.faction,
    questId: input.questId,
    key: input.key,
    approach: input.approach,
    receiptId: input.receiptId,
    resolutionIndex: input.resolutionIndex,
    deterministicHash: factionQuestlineDecisionHash({
      playerId: "reward-player",
      faction: input.faction,
      questId: input.questId,
      decisionKey: input.key,
      approach: input.approach,
      receiptId: input.receiptId,
      resolutionIndex: input.resolutionIndex,
    }),
  };
}

const neutralCompletedState: FactionQuestlineStateInput = {
  playerId: "reward-player",
  pledgedFaction: "free_haven",
  oathReceipt: null,
  decisions: [
    decision({ faction: "free_haven", questId: "free_haven.oath", key: "pledge", approach: "trade", receiptId: "reward-oath", resolutionIndex: 1 }),
    decision({ faction: "free_haven", questId: "free_haven.mainline", key: "mediate", approach: "trade", receiptId: "reward-main", resolutionIndex: 2 }),
  ],
  lastResolutionIndex: 2,
};

describe("aurion faction questline reward protocol", () => {
  it("rehydrates a real reward resolution without relaxing receipt-index validation", () => {
    const resolved = resolveFactionQuestlineCompletion({ state: neutralCompletedState, questId: "free_haven.mainline", completionReceiptId: "completion-1", completionResolutionIndex: 3 });
    const completion = { id: resolved.completionReceiptId, playerId: "reward-player", faction: "free_haven" as const, questId: "free_haven.mainline", sourceDecisionReceiptId: "reward-main", resolutionIndex: 3, rewardDigest: resolved.rewardDigest };
    const state = { ...neutralCompletedState, completions: [completion], lastResolutionIndex: 3 };
    const readback = resolveFactionQuestline(state);
    expect(readback.lastResolutionIndex).toBe(3);
    expect(readback.completedQuestIds).toContain("free_haven.mainline");
    expect(resolveFactionQuestline(state)).toEqual(readback);
    expect(() => resolveFactionQuestline({ ...state, completions: [] })).toThrow("newest receipt");
    expect(() => resolveFactionQuestline({ ...state, completions: [completion, completion] })).toThrow("unique");
    expect(() => resolveFactionQuestline({ ...state, completions: [{ ...completion, playerId: "foreign" }] })).toThrow("owned");
    expect(() => resolveFactionQuestline({ ...state, completions: [{ ...completion, resolutionIndex: 2 }] })).toThrow("ordered");
    const next = decision({ faction: "free_haven", questId: "free_haven.water-list", key: "publish", approach: "trade", receiptId: "after-reward", resolutionIndex: 4 });
    expect(resolveFactionQuestline({ ...state, decisions: [...state.decisions,next], lastResolutionIndex: 4 }).completedQuestIds).toContain("free_haven.water-list");
  });

  it("resolves a deterministic authored mainline reward from a confirmed decision", () => {
    const first = resolveFactionQuestlineCompletion({ state: neutralCompletedState, questId: "free_haven.mainline", completionReceiptId: "completion-1", completionResolutionIndex: 3 });
    const replay = resolveFactionQuestlineCompletion({ state: neutralCompletedState, questId: "free_haven.mainline", completionReceiptId: "completion-1", completionResolutionIndex: 3 });
    expect(first).toEqual(replay);
    expect(first.reward).toMatchObject({ faction: "free_haven", questId: "free_haven.mainline", approach: "trade", xp: 180, points: 70, victory: 1 });
    expect(first.rewardDigest).toHaveLength(64);
  });

  it("keeps the reward matrix authored and faction-isolated", () => {
    expect(getFactionQuestlineRewardDefinition({ faction: "sunward_concord", questId: "concord.mainline", approach: "craft" })).toMatchObject({ xp: 182, points: 70, victory: 1 });
    expect(getFactionQuestlineRewardDefinition({ faction: "ironwardens", questId: "ironwardens.side-forge", approach: "combat" })).toMatchObject({ xp: 94, points: 30, victory: 0 });
    expect(getFactionQuestlineRewardDefinition({ faction: "veiled_covenant", questId: "veiled_covenant.mainline", approach: "espionage" })).toMatchObject({ xp: 183, points: 70, victory: 1 });
    expect(getFactionQuestlineRewardDefinition({ faction: "wayfarer_compact", questId: "wayfarer_compact.mainline", approach: "exploration" })).toMatchObject({ xp: 181, points: 70, victory: 1 });
    expect(() => getFactionQuestlineRewardDefinition({ faction: "sunward_concord", questId: "ironwardens.mainline", approach: "combat" })).toThrow(/faction boundary/);
    expect(() => getFactionQuestlineRewardDefinition({ faction: "sunward_concord", questId: "concord.gate-seal", approach: "espionage" })).toThrow(/not authored/);
  });

  it("rejects completion without a confirmed decision or without a fresh resolution index", () => {
    expect(() => resolveFactionQuestlineCompletion({ state: { ...neutralCompletedState, decisions: neutralCompletedState.decisions.slice(0, 1), lastResolutionIndex: 1 }, questId: "free_haven.mainline", completionReceiptId: "completion-2", completionResolutionIndex: 2 })).toThrow(/confirmed completed quest/);
    expect(() => resolveFactionQuestlineCompletion({ state: neutralCompletedState, questId: "free_haven.mainline", completionReceiptId: "completion-3", completionResolutionIndex: 2 })).toThrow(/must advance/);
  });

  it("rejects an oath node and preserves the one-time completion domain", () => {
    expect(() => getFactionQuestlineRewardDefinition({ faction: "free_haven", questId: "free_haven.oath", approach: "trade" })).toThrow(/cannot issue/);
    expect(() => resolveFactionQuestlineCompletion({ state: neutralCompletedState, questId: "free_haven.mainline", completionReceiptId: "completion-4", completionResolutionIndex: 3 })).not.toThrow();
  });
});
