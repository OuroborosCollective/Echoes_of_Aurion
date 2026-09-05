import { createPool } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GuildGovernanceStore } from "./guildGovernanceStore";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("AIM-268 MariaDB guild governance transaction", () => {
  const guildId = "guild_aim268_integration";
  const founderUserId = 9268001;
  const otherUserId = 9268002;
  const pool = createPool(databaseUrl!);
  const store = GuildGovernanceStore.fromDatabaseUrl(databaseUrl!);

  beforeAll(async () => {
    await pool.query("DELETE FROM aurionGuildGovernanceReceipts WHERE guildId = ?", [guildId]);
    await pool.query("DELETE FROM aurionGuildMutationPlans WHERE guildId = ?", [guildId]);
    await pool.query("DELETE FROM aurionGuildDiplomacyPacts WHERE sourceGuildId = ? OR targetGuildId = ?", [guildId, guildId]);
    await pool.query("DELETE FROM aurionGuildKingdoms WHERE guildId = ?", [guildId]);
    await pool.query("DELETE FROM aurionGuildTerritories WHERE guildId = ? OR territoryId LIKE 'aim268-world:%'", [guildId]);
    await pool.query("DELETE FROM aurionGuildCapabilityGrants WHERE guildId = ?", [guildId]);
    await pool.query("DELETE FROM aurionGuildGovernanceStates WHERE guildId = ?", [guildId]);
    await pool.query("DELETE FROM guildMemberships WHERE guildId = ?", [guildId]);
    await pool.query("DELETE FROM guilds WHERE id = ?", [guildId]);
    await pool.query("INSERT INTO guilds (id, name, tag, founderUserId) VALUES (?, 'AIM 268 Integration', 'A268', ?)", [guildId, founderUserId]);
    await pool.query("INSERT INTO guildMemberships (id, guildId, userId, role, status) VALUES ('gm_aim268_founder', ?, ?, 'founder', 'active'), ('gm_aim268_member', ?, ?, 'member', 'active')", [guildId, founderUserId, guildId, otherUserId]);
  });

  afterAll(async () => {
    await pool.query("DELETE FROM aurionGuildGovernanceReceipts WHERE guildId = ?", [guildId]);
    await pool.query("DELETE FROM aurionGuildMutationPlans WHERE guildId = ?", [guildId]);
    await pool.query("DELETE FROM aurionGuildDiplomacyPacts WHERE sourceGuildId = ? OR targetGuildId = ?", [guildId, guildId]);
    await pool.query("DELETE FROM aurionGuildKingdoms WHERE guildId = ?", [guildId]);
    await pool.query("DELETE FROM aurionGuildTerritories WHERE guildId = ? OR territoryId LIKE 'aim268-world:%'", [guildId]);
    await pool.query("DELETE FROM aurionGuildCapabilityGrants WHERE guildId = ?", [guildId]);
    await pool.query("DELETE FROM aurionGuildGovernanceStates WHERE guildId = ?", [guildId]);
    await pool.query("DELETE FROM guildMemberships WHERE guildId = ?", [guildId]);
    await pool.query("DELETE FROM guilds WHERE id = ?", [guildId]);
    await store.close();
    await pool.end();
  });

  it("claims six connected territories, consolidates once, and replays the exact receipt", async () => {
    let expected = 0n;
    const territoryIds: string[] = [];
    for (const [chunkX, chunkZ] of [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]] as const) {
      const planned = await store.plan(founderUserId, { operation: "claim_territory", expectedRevisionExact: expected.toString(), idempotencyKey: `aim268-claim-${chunkX}-${chunkZ}`, payload: { worldId: "aim268-world", chunkX, chunkZ } });
      const applied = await store.apply(founderUserId, planned.plan.confirmationHash);
      expected += 1n;
      expect(applied.readback.revisionExact).toBe(expected.toString());
      territoryIds.push(String(applied.receipt.result.territoryId));
    }

    const kingdomPlan = await store.plan(founderUserId, { operation: "consolidate_kingdom", expectedRevisionExact: expected.toString(), idempotencyKey: "aim268-kingdom", payload: { kingdomName: "AIM 268 Testreich", capitalTerritoryId: territoryIds[0], territoryIds } });
    const first = await store.apply(founderUserId, kingdomPlan.plan.confirmationHash);
    expect(first.replay).toBe(false);
    expect(first.readback.kingdom).toMatchObject({ name: "AIM 268 Testreich", capitalTerritoryId: territoryIds[0] });
    expect(first.readback.territories).toHaveLength(6);
    const replay = await store.apply(founderUserId, kingdomPlan.plan.confirmationHash);
    expect(replay.replay).toBe(true);
    expect(replay.receipt.receiptId).toBe(first.receipt.receiptId);
    expect(replay.readback.revisionExact).toBe(first.readback.revisionExact);
  });

  it("does not let a normal member plan a territory mutation", async () => {
    const current = await store.read(otherUserId, guildId);
    await expect(store.plan(otherUserId, { operation: "claim_territory", expectedRevisionExact: current.revisionExact, idempotencyKey: "aim268-member-claim", payload: { worldId: "aim268-world", chunkX: 3, chunkZ: 1 } })).rejects.toThrow("GUILD_CAPABILITY_REQUIRED");
  });
});
