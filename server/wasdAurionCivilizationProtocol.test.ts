import { describe, expect, it } from "vitest";
import { getTerritoryChunkKey, resolveAggressionHazard, resolveCaravanMissions, resolveCraft, resolveGuild, resolveGuildTerritoryEffect, resolveMarketPrices, resolveScarcityForecast, resolveSettlement } from "./wasdAurionCivilizationProtocol";

describe("wasdAurionCivilizationProtocol", () => {
  it("binds settlements to stable identity and resolution rather than wall time", () => {
    const first = resolveSettlement({ id: "windhollow", kind: "village", ownerId: "asterion", regionId: "windhollow", foundedResolutionIndex: 9, prosperity: 0.62, stability: 0.81 });
    const second = resolveSettlement({ id: "windhollow", kind: "village", ownerId: "asterion", regionId: "windhollow", foundedResolutionIndex: 9, prosperity: 0.62, stability: 0.81 });
    expect(first).toEqual(second);
    expect(first.receiptHash).toHaveLength(64);
  });

  it("resolves scarcity and weather prices deterministically", () => {
    const input = { regionId: "windhollow", weatherTone: "storm" as const, resolutionIndex: 7, listings: [{ itemId: "iron_bar", basePrice: 20, category: "material" as const }], scarcity: [{ regionId: "windhollow", itemId: "iron_bar", shiftPercentage: 0.2, x: 0, y: 0, z: 0, resolutionIndex: 7, sourceReceiptId: "scarcity-a" }] };
    const first = resolveMarketPrices(input);
    const second = resolveMarketPrices({ ...input, scarcity: input.scarcity.slice().reverse() });
    expect(first).toEqual(second);
    expect(first[0]?.price).toBe(26);
  });

  it("predicts scarcity and bounded NPC priorities from explicit market deltas", () => {
    const forecast = resolveScarcityForecast({ resourceId: "iron_bar", regionId: "windhollow", referencePrice: 100, currentPrice: 160, referenceStock: 100, currentStock: 65, affectedNpcIds: ["merchant-b", "merchant-a"], receiptId: "forecast-1" });
    expect(forecast).toMatchObject({ state: "predicted", severity: 10, recommendedAction: "HOARD" });
    expect(Object.keys(forecast.npcPriorities)).toEqual(["merchant-a", "merchant-b"]);
  });

  it("derives aggressive world hazard from stable samples without a runtime tick", () => {
    const first = resolveAggressionHazard({ samples: [0.2, 0.4, 0.65, 0.8], receiptId: "hazard-1" });
    const second = resolveAggressionHazard({ samples: [0.2, 0.4, 0.65, 0.8], receiptId: "hazard-1" });
    expect(first).toEqual(second);
    expect(first.hazardIndex).toBeGreaterThan(0);
    expect(first.aggressionTrend).toBeGreaterThan(0);
  });

  it("only assigns trade missions above the bounded scarcity threshold", () => {
    const missions = resolveCaravanMissions({ traders: [{ npcId: "merchant-b" }, { npcId: "merchant-a" }], signals: [{ regionId: "windhollow", itemId: "iron_bar", shiftPercentage: 0.2, x: 3, y: 4, z: 5, resolutionIndex: 3, sourceReceiptId: "market-a" }, { regionId: "windhollow", itemId: "cloth", shiftPercentage: 0.1, x: 1, y: 1, z: 1, resolutionIndex: 2, sourceReceiptId: "market-b" }] });
    expect(missions).toHaveLength(2);
    expect(missions.map(mission => mission.npcId)).toEqual(["merchant-a", "merchant-b"]);
    expect(missions.every(mission => mission.objectiveType === "scarcity_response")).toBe(true);
  });

  it("crafts only after verified level and ingredient checks", () => {
    const recipe = { id: "iron_sword", requiredLevel: 2, ingredients: [{ itemId: "iron_bar", amount: 2 }], result: { itemId: "iron_sword", amount: 1 }, xp: 15 } as const;
    expect(resolveCraft({ playerLevel: 1, inventory: [{ itemId: "iron_bar", amount: 2 }], recipe, receiptId: "craft-1" }).state).toBe("rejected");
    const crafted = resolveCraft({ playerLevel: 2, inventory: [{ itemId: "iron_bar", amount: 2 }], recipe, receiptId: "craft-2" });
    expect(crafted).toMatchObject({ state: "crafted", xpDelta: 15, result: { itemId: "iron_sword", amount: 1 } });
    expect(crafted.inventory).toEqual([{ itemId: "iron_sword", amount: 1 }]);
  });

  it("keeps guild membership sorted and applies sovereignty only inside owned chunks", () => {
    const guild = resolveGuild({ id: "starwardens", name: "Star Wardens", founderId: "lyra", members: ["borin", "lyra"], treasury: 5 });
    expect(guild.members).toEqual(["borin", "lyra"]);
    expect(guild.ranks.lyra).toBe("founder");
    const chunk = getTerritoryChunkKey(127, 65);
    expect(chunk).toBe("1:1");
    const effect = resolveGuildTerritoryEffect({ npcGuildId: "starwardens", x: 127, y: 65, territoryOwners: { [chunk]: "starwardens" } });
    expect(effect).toMatchObject({ faithDelta: 0.05, aggressionDelta: -0.02 });
  });
});
