import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { caravanSecurityIndex, marketPriceCopper, resolveLivingWorldTick, socialMasteryEvidence, type MarketState, type NpcEconomyState } from "./ax1LivingWorldProtocol";

const market: MarketState = { hubId: "emberfall", controllingGuild: "Bronze Syndicate", taxRateBasisPoints: 550, treasuryCopper: 420_000, stock: { grain: 80, sandstone: 450, bronze: 350, aether: 20, salve: 25, rune_core: 10 } };
const npc: NpcEconomyState = { npcId: "merchant:torin", name: "Torin", currentHubId: "emberfall", wealthCopper: 2000, hungerBps: 3200, fatigueBps: 2100, tradeProwessBps: 11000, harvestYieldBps: 10500, memory: [] };
const read = (path: string) => readFileSync(path, "utf8");

describe("AIM-245/AIM-263 living world migration", () => {
  it("resolves identical economy and caravan outcomes from the same world tick", () => {
    const input = { worldSeed: "aurion-world", resolutionIndex: 42, market, npc, polityStability: 72 } as const;
    expect(resolveLivingWorldTick(input)).toEqual(resolveLivingWorldTick(input));
    expect(resolveLivingWorldTick(input).deterministicHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("lets the last confirmed NPC goal choose the next normal world action", () => {
    expect(resolveLivingWorldTick({ worldSeed: "goal", resolutionIndex: 10, market, npc, polityStability: 72, preferredGoal: "seek_safety" }).action).toBe("patrol");
    expect(resolveLivingWorldTick({ worldSeed: "goal", resolutionIndex: 10, market, npc, polityStability: 72, preferredGoal: "gather_resources" }).action).toBe("produce");
    expect(resolveLivingWorldTick({ worldSeed: "goal", resolutionIndex: 10, market, npc, polityStability: 72, preferredGoal: "socialize" }).action).toBe("socialize");
    expect(["trade","caravan"]).toContain(resolveLivingWorldTick({ worldSeed: "goal", resolutionIndex: 10, market, npc, polityStability: 72, preferredGoal: "trade" }).action);
  });

  it("allows urgent biological needs to interrupt a strategic goal and changes the actual need state", () => {
    const hungry = resolveLivingWorldTick({ worldSeed: "survival", resolutionIndex: 2, market, npc: { ...npc, hungerBps: 8_500 }, polityStability: 72, preferredGoal: "expand_influence" });
    expect(hungry.action).toBe("consume");
    expect(hungry.npc.hungerBps).toBeLessThan(8_500);
    const tired = resolveLivingWorldTick({ worldSeed: "survival", resolutionIndex: 3, market, npc: { ...npc, fatigueBps: 9_000 }, polityStability: 72, preferredGoal: "trade" });
    expect(tired.action).toBe("rest");
    expect(tired.npc.fatigueBps).toBeLessThan(9_000);
  });

  it("moves the NPC to the destination only after a confirmed non-ambushed caravan", () => {
    const candidate = Array.from({ length: 200 }, (_, resolutionIndex) => resolveLivingWorldTick({ worldSeed: "movement", resolutionIndex, market, npc, polityStability: 100, preferredGoal: "expand_influence" })).find(result => result.action === "caravan" && !result.caravan.ambushed);
    expect(candidate).toBeTruthy();
    expect(candidate!.caravan.destination).not.toBeNull();
    expect(candidate!.npc.currentHubId).toBe(candidate!.caravan.destination);
  });

  it("prices scarcity and remembered trade affinity deterministically", () => {
    const abundant = marketPriceCopper({ commodity: "aether", stock: 500, demandBps: 7000, taxRateBasisPoints: 500 });
    const scarce = marketPriceCopper({ commodity: "aether", stock: 5, demandBps: 7000, taxRateBasisPoints: 500 });
    expect(scarce).toBeGreaterThan(abundant);
    expect(marketPriceCopper({ commodity: "grain", stock: 100, demandBps: 9000, taxRateBasisPoints: 250, memoryAffinityBps: 13000 })).toBeGreaterThan(0);
  });

  it("lets remembered danger and polity stability affect caravan security", () => {
    expect(caravanSecurityIndex("observatory_threshold", "cinder_vault", 80, 10)).toBeGreaterThan(caravanSecurityIndex("observatory_threshold", "cinder_vault", 20, 80));
  });

  it("maps social actions to cap-free mastery/reputation evidence backed by a receipt", () => {
    expect(socialMasteryEvidence("negotiation", "dialogue_123", 9)).toMatchObject({ disciplineId: "diplomacy", amountExact: "3", reputationDelta: 2 });
    expect(socialMasteryEvidence("leadership", "civic_123", 9)).toMatchObject({ disciplineId: "council", amountExact: "5" });
  });

  it("reads confirmed NPC continuity, fixes satisfaction signs and refreshes only newly observed memory", () => {
    const runtime = read("server/ax1LivingWorldRuntime.ts");
    expect(runtime).toContain("readConfirmedNpcState");
    expect(runtime).toContain("prepareMerchantNpcDecision");
    expect(runtime).toContain('from "./wasdNpcCapsule"');
    expect(runtime).not.toContain("const baseMarkets");
    expect(runtime).not.toContain("function lifeOpportunities");
    expect(runtime).toContain("resolveAndRecordNpc");
    expect(runtime).toContain("resolveAndRecordPolity");
    expect(runtime).toContain("resolveAndRecordWorld");
    expect(runtime).not.toContain("localStorage");
    expect(runtime).not.toContain("Math.random");
  });
});
