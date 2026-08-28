import { describe, expect, it } from "vitest";
import {
  factionQuestlineDecisionHash,
  factionQuestlineNextResolutionIndex,
  getFactionOathQuestId,
  isFactionQuestDecisionAvailable,
  mayPledgeFaction,
  resolveFactionQuestline,
  type FactionQuestlineDecisionReceipt,
  type FactionQuestlineStateInput,
} from "./aurionFactionQuestlineProtocol";

const neutralState = (): FactionQuestlineStateInput => ({
  playerId: "player-42",
  pledgedFaction: "free_haven",
  oathReceipt: null,
  decisions: [],
  lastResolutionIndex: 0,
});

function decision(input: Omit<FactionQuestlineDecisionReceipt, "deterministicHash">): FactionQuestlineDecisionReceipt {
  return {
    ...input,
    deterministicHash: factionQuestlineDecisionHash({
      playerId: input.playerId,
      faction: input.faction,
      questId: input.questId,
      decisionKey: input.key,
      approach: input.approach,
      receiptId: input.receiptId,
      resolutionIndex: input.resolutionIndex,
    }),
  };
}

const freeHavenOath = decision({
  playerId: "player-42",
  faction: "free_haven",
  questId: "free_haven.oath",
  key: "pledge",
  approach: "trade",
  receiptId: "fqdec-free-oath",
  resolutionIndex: 1,
});

const freeHavenMainline = decision({
  playerId: "player-42",
  faction: "free_haven",
  questId: "free_haven.mainline",
  key: "mediate",
  approach: "trade",
  receiptId: "fqdec-free-main",
  resolutionIndex: 2,
});

const ironwardenOath = {
  id: "fqoath-iron",
  playerId: "player-42",
  fromFaction: "free_haven" as const,
  toFaction: "ironwardens" as const,
  sourceQuestId: "free_haven.mainline" as const,
  sourceReceiptId: "fqdec-free-main",
  resolutionIndex: 3,
};

function pledgedIronState(decisions: readonly FactionQuestlineDecisionReceipt[] = [], lastResolutionIndex = 3): FactionQuestlineStateInput {
  return {
    playerId: "player-42",
    pledgedFaction: "ironwardens",
    oathReceipt: ironwardenOath,
    decisions: [freeHavenOath, freeHavenMainline, ...decisions],
    lastResolutionIndex,
  };
}

describe("aurion faction questline protocol", () => {
  it("offers the neutral oath first and keeps its initial state deterministic", () => {
    const resolved = resolveFactionQuestline(neutralState());
    expect(resolved).toMatchObject({
      mode: "neutral",
      faction: "free_haven",
      oathQuestId: "free_haven.oath",
      lastResolutionIndex: 0,
    });
    expect(resolved.availableQuestIds).toEqual(["free_haven.oath"]);
    expect(resolved.warfront?.unlocked).toBe(false);
    expect(getFactionOathQuestId("sunward_concord")).toBe("concord.oath");
    expect(factionQuestlineNextResolutionIndex(neutralState())).toBe(1);
  });

  it("requires completion of the neutral route before a permanent faction oath", () => {
    const afterNeutralOath = { ...neutralState(), decisions: [freeHavenOath], lastResolutionIndex: 1 } as const;
    expect(resolveFactionQuestline(afterNeutralOath).availableQuestIds).toEqual(["free_haven.mainline"]);
    expect(mayPledgeFaction(afterNeutralOath, "ironwardens", "fqdec-free-oath")).toBe(false);

    const afterNeutralMain = { ...neutralState(), decisions: [freeHavenOath, freeHavenMainline], lastResolutionIndex: 2 } as const;
    expect(mayPledgeFaction(afterNeutralMain, "ironwardens", "fqdec-free-main")).toBe(true);
    expect(mayPledgeFaction(afterNeutralMain, "ironwardens", "foreign-receipt")).toBe(false);
  });

  it("keeps permanent faction routes isolated and unlocks only their owned Warfront", () => {
    const pledged = pledgedIronState();
    const first = resolveFactionQuestline(pledged);
    expect(first).toMatchObject({ mode: "pledged", faction: "ironwardens", oathQuestId: "ironwardens.oath" });
    expect(first.availableQuestIds).toEqual(["ironwardens.mainline", "ironwardens.side-forge"]);
    expect(first.availableQuestIds.some(id => id.startsWith("free_haven."))).toBe(false);
    expect(first.warfront).toMatchObject({ questId: "warfront.ironwardens", bossKey: "boss.bannerbreaker", unlocked: false });

    const mainline = decision({
      playerId: "player-42",
      faction: "ironwardens",
      questId: "ironwardens.mainline",
      key: "charge",
      approach: "combat",
      receiptId: "fqdec-iron-main",
      resolutionIndex: 4,
    });
    const afterMainline = resolveFactionQuestline(pledgedIronState([mainline], 4));
    expect(afterMainline.warfront).toMatchObject({ questId: "warfront.ironwardens", unlocked: true });
    expect(isFactionQuestDecisionAvailable(pledgedIronState(), "ironwardens.mainline")).toBe(true);
  });

  it("canonicalizes stored decision order and rejects foreign, tampered, or unavailable decisions", () => {
    const first = decision({
      playerId: "player-42",
      faction: "ironwardens",
      questId: "ironwardens.mainline",
      key: "charge",
      approach: "combat",
      receiptId: "fqdec-iron-main-a",
      resolutionIndex: 4,
    });
    const second = decision({
      playerId: "player-42",
      faction: "ironwardens",
      questId: "ironwardens.side-forge",
      key: "forge",
      approach: "craft",
      receiptId: "fqdec-iron-side-b",
      resolutionIndex: 5,
    });
    const ordered = pledgedIronState([first, second], 5);
    const permuted = pledgedIronState([second, first], 5);
    expect(resolveFactionQuestline(permuted)).toEqual(resolveFactionQuestline(ordered));

    const foreign = { ...first, faction: "free_haven" as const, deterministicHash: factionQuestlineDecisionHash({ ...first, faction: "free_haven" as const, decisionKey: first.key }) };
    expect(() => resolveFactionQuestline(pledgedIronState([foreign], 4))).toThrow(/not owned or unique/);
    expect(() => resolveFactionQuestline(pledgedIronState([{ ...first, deterministicHash: "0".repeat(64) }], 4))).toThrow(/hash is not valid/);
    const lockedWarfront = decision({ playerId: "player-42", faction: "ironwardens", questId: "warfront.ironwardens", key: "converge", approach: "combat", receiptId: "fqdec-locked-warfront", resolutionIndex: 4 });
    expect(() => resolveFactionQuestline(pledgedIronState([lockedWarfront], 4))).toThrow(/not currently available/);
  });
});
