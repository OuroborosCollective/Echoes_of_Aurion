import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AURION_KINGDOM_MINIMUM_TERRITORIES, guildCapabilities, type GuildTerritoryCoordinate } from "@shared/guildGovernanceContract";
import {
  areGuildTerritoriesConnected,
  buildGuildGovernanceReceipt,
  buildGuildMutationPlan,
  hasGuildCapability,
  reconcileGuildGovernanceReplay,
  validateKingdomConsolidation,
} from "./guildGovernanceProtocol";

const territories = (guildId = "guild_aether_guardians"): GuildTerritoryCoordinate[] => [
  [0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1],
].map(([chunkX, chunkZ]) => ({ territoryId: `aurion:global:${chunkX}:${chunkZ}`, worldId: "aurion:global", chunkX, chunkZ, guildId, state: "active" }));

describe("AIM-268 guild and kingdom authority", () => {
  it("keeps least-privilege role defaults and exact scoped grant overrides", () => {
    for (const capability of guildCapabilities) expect(hasGuildCapability({ role: "founder", required: capability, guildId: "guild_a", scopeKind: "guild", scopeId: "guild_a", explicit: [] })).toBe(true);
    expect(hasGuildCapability({ role: "member", required: "bank_deposit", guildId: "guild_a", scopeKind: "bank", scopeId: "guild_a", explicit: [] })).toBe(true);
    expect(hasGuildCapability({ role: "member", required: "bank_withdraw", guildId: "guild_a", scopeKind: "bank", scopeId: "guild_a", explicit: [] })).toBe(false);
    expect(hasGuildCapability({ role: "officer", required: "territory_manage", guildId: "guild_a", scopeKind: "territory", scopeId: "aurion:0:0", explicit: [{ capability: "territory_manage", scopeKind: "territory", scopeId: "aurion:0:0", status: "revoked" }] })).toBe(false);
  });

  it("requires six unique connected territories and an owned capital", () => {
    const owned = territories();
    expect(owned).toHaveLength(AURION_KINGDOM_MINIMUM_TERRITORIES);
    expect(areGuildTerritoriesConnected(owned)).toBe(true);
    expect(areGuildTerritoriesConnected([...owned.slice(0, 5), { ...owned[5]!, chunkX: 20, territoryId: "aurion:global:20:1" }])).toBe(false);

    const plan = buildGuildMutationPlan({ actorUserId: 42, guildId: "guild_aether_guardians", role: "founder", operation: "consolidate_kingdom", expectedRevisionExact: "6", idempotencyKey: "aim268-kingdom-001", payload: { kingdomName: "Großkönigreich Aurion", capitalTerritoryId: owned[0]!.territoryId, territoryIds: owned.map(entry => entry.territoryId) } });
    const result = validateKingdomConsolidation({ guildId: "guild_aether_guardians", plan, territories: owned });
    expect(result.territoryIds).toHaveLength(6);
    expect(result.capitalTerritoryId).toBe(owned[0]!.territoryId);
    expect(result.territoryDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(() => validateKingdomConsolidation({ guildId: "guild_aether_guardians", plan, territories: owned.map((entry, index) => index === 5 ? { ...entry, guildId: "guild_other" } : entry) })).toThrow("actively owned");
  });

  it("builds deterministic operation/resource/revision-bound plans and receipts", () => {
    const input = { actorUserId: 42, guildId: "guild_aether_guardians", role: "founder" as const, operation: "claim_territory" as const, expectedRevisionExact: "0", idempotencyKey: "aim268-claim-001", payload: { worldId: "aurion", chunkX: 0, chunkZ: 0 } };
    const first = buildGuildMutationPlan(input);
    const second = buildGuildMutationPlan(input);
    expect(first).toEqual(second);
    expect(first.resources).toEqual(["aurion:0:0"]);
    expect(first.confirmationHash).toMatch(/^[a-f0-9]{64}$/);
    const receipt = buildGuildGovernanceReceipt({ plan: first, resultingRevisionExact: "1", result: { territoryId: "aurion:0:0", guildId: first.guildId, state: "active" } });
    expect(receipt.resultingRevisionExact).toBe("1");
    expect(reconcileGuildGovernanceReplay(receipt, receipt)).toMatchObject({ replay: true, receipt });
    expect(() => reconcileGuildGovernanceReplay(receipt, { ...receipt, resultHash: "0".repeat(64) })).toThrow("GUILD_GOVERNANCE_IDEMPOTENCY_CONFLICT");
  });

  it.each([
    [{ kingdomName: "Aurion" }, "capitalTerritoryId must be a canonical token"],
    [{ kingdomName: "Aurion", capitalTerritoryId: "aurion:0:0" }, "territoryIds must be an array"],
  ])("rejects incomplete consolidation proposals before generating a confirmation", (payload, message) => {
    expect(() => buildGuildMutationPlan({ actorUserId: 42, guildId: "guild_a", role: "founder", operation: "consolidate_kingdom", expectedRevisionExact: "6", idempotencyKey: "kingdom-incomplete", payload })).toThrow(message);
  });

  it("rejects client-selected ownership and malformed high-impact inputs", () => {
    expect(() => buildGuildMutationPlan({ actorUserId: 42, guildId: "guild_a", role: "founder", operation: "claim_territory", expectedRevisionExact: "0", idempotencyKey: "claim-002", payload: { worldId: "aurion", chunkX: 0, chunkZ: 0, guildId: "guild_evil" } })).toThrow("client authority field rejected: guildId");
    expect(() => buildGuildMutationPlan({ actorUserId: 42, guildId: "guild_a", role: "founder", operation: "consolidate_kingdom", expectedRevisionExact: "0", idempotencyKey: "kingdom-002", payload: { kingdomName: "Aurion", capitalTerritoryId: "aurion:0:0", territoryIds: ["aurion:0:0", "aurion:0:0", "aurion:1:0", "aurion:2:0", "aurion:0:1", "aurion:1:1"] } })).toThrow("duplicate territories");
  });

  it("keeps the runtime free of raw source guild authority", () => {
    const store = readFileSync("server/guildGovernanceStore.ts", "utf8");
    const routes = readFileSync("server/guildGovernanceRoutes.ts", "utf8");
    const migration = readFileSync("drizzle/0029_aurion_guild_kingdom_authority.sql", "utf8");
    expect(routes).toContain("sdk.authenticateRequest");
    expect(routes).not.toContain("playerName = 'Hero'");
    expect(store).toContain("FOR UPDATE");
    expect(store).toContain("GUILD_REVISION_CONFLICT");
    expect(store).not.toContain("Math.random");
    expect(migration).not.toContain("guild_data_json");
  });
});
