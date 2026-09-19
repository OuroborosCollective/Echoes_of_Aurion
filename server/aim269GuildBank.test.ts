import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildGuildBankPlan,
  buildGuildBankReceipt,
  deriveGuildBankGoals,
  guildBankHash,
  reconcileGuildBankReplay,
  resourceForItemDefinition,
  resolveGuildBuildingProjection,
  resolveGuildBuildingUpgrade,
} from "./guildBankProtocol";

describe("AIM-269 guild bank and state economy", () => {
  it("binds treasury transfers to exact player wallet, guild account, revision and operation", () => {
    const input = { actorUserId: 42, guildId: "guild_aether_guardians", role: "member" as const, operation: "deposit_points" as const, expectedRevisionExact: "4", idempotencyKey: "aim269-deposit-001", payload: { amountExact: "1250" } };
    const first = buildGuildBankPlan(input);
    const second = buildGuildBankPlan(input);
    expect(first).toEqual(second);
    expect(first.requiredCapability).toBe("bank_deposit");
    expect(first.resources).toEqual(["player-wallet:42", "guild-treasury:guild_aether_guardians"]);
    expect(first.confirmationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.payloadHash).toBe(guildBankHash(first.payload));
  });

  it("rejects client-selected balances, item objects and invalid point ranges", () => {
    expect(() => buildGuildBankPlan({ actorUserId: 42, guildId: "guild_a", role: "member", operation: "deposit_points", expectedRevisionExact: "0", idempotencyKey: "bad-balance", payload: { amountExact: "10", treasuryGold: 999999 } })).toThrow("client authority field rejected: treasuryGold");
    expect(() => buildGuildBankPlan({ actorUserId: 42, guildId: "guild_a", role: "member", operation: "deposit_item", expectedRevisionExact: "0", idempotencyKey: "bad-item", payload: { itemRecordVersion: "legacy", itemId: "item_1", item: { name: "forged" } } })).toThrow("client authority field rejected: item");
    expect(() => buildGuildBankPlan({ actorUserId: 42, guildId: "guild_a", role: "member", operation: "deposit_points", expectedRevisionExact: "0", idempotencyKey: "bad-range", payload: { amountExact: "2147483648" } })).toThrow("integer range");
  });

  it("uses real item-instance identities for exclusive custody and resources", () => {
    const plan = buildGuildBankPlan({ actorUserId: 42, guildId: "guild_a", role: "member", operation: "deposit_item", expectedRevisionExact: "0", idempotencyKey: "item-deposit-1", payload: { itemRecordVersion: "aurion_v2", itemId: "item_v2_abc" } });
    expect(plan.resources).toEqual(["item:aurion_v2:item_v2_abc", "guild-custody:guild_a"]);
    const resource = buildGuildBankPlan({ actorUserId: 42, guildId: "guild_a", role: "member", operation: "donate_resource_item", expectedRevisionExact: "0", idempotencyKey: "resource-donate-1", payload: { itemRecordVersion: "legacy", itemId: "item_legacy_abc", expectedResourceKey: "wood" } });
    expect(resource.resources).toContain("guild-resource:guild_a:wood");
    expect(resourceForItemDefinition("mat_wood_oak")).toBe("wood");
    expect(resourceForItemDefinition("mat_dust_aether")).toBe("aether");
    expect(resourceForItemDefinition("unmapped_item")).toBeNull();
  });

  it("scales source building costs by the next level while bounding all projections", () => {
    const first = resolveGuildBuildingUpgrade("bld_sovereign_academy", "0");
    const fifth = resolveGuildBuildingUpgrade("bld_sovereign_academy", "4");
    expect(first.costExact).toEqual({ points: "2200", wood: "500", stone: "450", aether: "350" });
    expect(fifth.costExact).toEqual({ points: "11000", wood: "2500", stone: "2250", aether: "1750" });
    expect(fifth.projection.bonusesBps).toEqual({ validatedMasteryXpBps: 1000, researchEfficiencyBps: 1200 });
    expect(resolveGuildBuildingProjection("bld_aether_wellspring", "5").bonusesBps).toEqual({ resourceRegenerationBps: 2000, territoryStabilityBps: 1500 });
    expect(resolveGuildBuildingProjection("bld_sovereign_auktionator", "1").bonusesBps.marketFeeDiscountBps).toBe(500);
    expect(() => resolveGuildBuildingUpgrade("bld_sovereign_auktionator", "1")).toThrow("maximum level");
  });

  it("derives goals from persisted exact readmodels instead of mutable source defaults", () => {
    const goals = deriveGuildBankGoals({ treasuryBalanceExact: "10000", activeTerritoriesExact: "6", heldItemsExact: "4", totalBuildingLevelsExact: "3" });
    expect(goals.find(goal => goal.id === "treasury_foundation")?.complete).toBe(true);
    expect(goals.find(goal => goal.id === "territory_union")?.complete).toBe(true);
    expect(goals.find(goal => goal.id === "bank_stewardship")?.complete).toBe(false);
    expect(goals.find(goal => goal.id === "construction_foundation")?.complete).toBe(true);
  });

  it("produces exact once-only receipts and rejects conflicting replay", () => {
    const plan = buildGuildBankPlan({ actorUserId: 42, guildId: "guild_a", role: "founder", operation: "withdraw_points", expectedRevisionExact: "8", idempotencyKey: "withdraw-001", payload: { amountExact: "500" } });
    const receipt = buildGuildBankReceipt({ plan, resultingRevisionExact: "9", result: { amountExact: "500", treasuryBeforeExact: "1000", treasuryAfterExact: "500" } });
    expect(reconcileGuildBankReplay(receipt, receipt)).toMatchObject({ replay: true, receipt });
    expect(() => reconcileGuildBankReplay(receipt, { ...receipt, resultHash: "0".repeat(64) })).toThrow("GUILD_BANK_IDEMPOTENCY_CONFLICT");
  });

  it("keeps runtime authority out of the browser and source JSON", () => {
    const store = readFileSync("server/guildBankStore.ts", "utf8");
    const routes = readFileSync("server/guildBankRoutes.ts", "utf8");
    const migration = readFileSync("drizzle/0030_aurion_guild_bank_economy.sql", "utf8");
    expect(routes).toContain("sdk.authenticateRequest");
    expect(store).toContain("playerProfiles");
    expect(store).toContain("aurionPoints");
    expect(store).toContain("FOR UPDATE");
    expect(store).not.toContain("Math.random");
    expect(store).not.toContain("guild_data_json");
    expect(store).not.toContain("playerName = 'Hero'");
    expect(migration).toContain("guild_custody");
    expect(migration).not.toContain("guild_data_json");
  });
});
