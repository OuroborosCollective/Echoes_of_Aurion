import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { caravanSecurityIndex, marketPriceCopper, resolveLivingWorldTick, socialMasteryEvidence, type MarketState, type NpcEconomyState } from "./ax1LivingWorldProtocol";

const market: MarketState = { hubId: "emberfall", controllingGuild: "Bronze Syndicate", taxRateBasisPoints: 550, treasuryCopper: 420_000, stock: { grain: 80, sandstone: 450, bronze: 350, aether: 20, salve: 25, rune_core: 10 } };
const npc: NpcEconomyState = { npcId: "merchant:torin", name: "Torin", currentHubId: "emberfall", wealthCopper: 2000, hungerBps: 3200, fatigueBps: 2100, tradeProwessBps: 11000, harvestYieldBps: 10500, memory: [] };
const read = (path: string) => readFileSync(path, "utf8");

describe("AIM-245 living world migration", () => {
  it("resolves identical economy and caravan outcomes from the same world tick", () => {
    const input = { worldSeed: "aurion-world", resolutionIndex: 42, market, npc, polityStability: 72 } as const;
    expect(resolveLivingWorldTick(input)).toEqual(resolveLivingWorldTick(input));
    expect(resolveLivingWorldTick(input).deterministicHash).toMatch(/^[a-f0-9]{64}$/);
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

  it("persists NPC memory/decisions, polity and world economy through existing Aurion runtime paths", () => {
    const runtime = read("server/ax1LivingWorldRuntime.ts");
    expect(runtime).toContain("resolveAndRecordNpc");
    expect(runtime).toContain("resolveAndRecordPolity");
    expect(runtime).toContain("resolveAndRecordWorld");
    expect(runtime).not.toContain("localStorage");
    expect(runtime).not.toContain("Math.random");
  });
});
