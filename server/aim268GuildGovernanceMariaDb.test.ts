import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GuildGovernanceStore } from "./guildGovernanceStore";
import { ownedGuildGovernance } from "../shared/guildGovernanceView";

const databaseUrl = process.env.DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite("AIM-268 MariaDB guild governance transaction", () => {
  const guildId = "guild_aim268_integration";
  const founderUserId = 9268001;
  const otherUserId = 9268002;
  let pool: Pool;
  let store: GuildGovernanceStore;
  let isolated = false;

  beforeAll(async () => {
    if (!databaseUrl) return;
    const target = new URL(databaseUrl);
    if (target.hostname !== "127.0.0.1" || !target.pathname.endsWith("_test")) throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool = createPool(databaseUrl);
    const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    if (database[0]?.name !== target.pathname.slice(1)) throw Error("ISOLATED_TEST_DATABASE_REQUIRED");
    isolated = true;
    store = GuildGovernanceStore.fromDatabaseUrl(databaseUrl);
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
    if (!isolated || !pool || !store) { if (pool) await pool.end(); return; }
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

    expect(territoryIds).toHaveLength(6);
    const owned = await store.read(founderUserId, guildId);
    expect(owned.territories.map(territory => territory.territoryId).sort()).toEqual([...territoryIds].sort());
    const kingdomPlan = await store.plan(founderUserId, { operation: "consolidate_kingdom", expectedRevisionExact: expected.toString(), idempotencyKey: "aim268-kingdom", payload: { kingdomName: "AIM 268 Testreich", capitalTerritoryId: territoryIds[0], territoryIds } });
    const first = await store.apply(founderUserId, kingdomPlan.plan.confirmationHash);
    expect(first.replay).toBe(false);
    expect(first.readback.kingdom).toMatchObject({ name: "AIM 268 Testreich", capitalTerritoryId: territoryIds[0] });
    expect(first.readback.territories).toHaveLength(6);
    expect(ownedGuildGovernance(first.readback, founderUserId, guildId).kingdom?.name).toBe("AIM 268 Testreich");
    const replay = await store.apply(founderUserId, kingdomPlan.plan.confirmationHash);
    expect(replay.replay).toBe(true);
    expect(replay.receipt.receiptId).toBe(first.receipt.receiptId);
    expect(replay.readback.revisionExact).toBe(first.readback.revisionExact);
  });

  it("does not let a normal member plan a territory mutation", async () => {
    const current = await store.read(otherUserId, guildId);
    await expect(store.plan(otherUserId, { operation: "claim_territory", expectedRevisionExact: current.revisionExact, idempotencyKey: "aim268-member-claim", payload: { worldId: "aim268-world", chunkX: 10, chunkZ: 10 } })).rejects.toThrow("GUILD_CAPABILITY_REQUIRED");
  });

  it("rejects contradictory kingdom rows and recovers after the stored link is restored", async () => {
    const before = await store.read(founderUserId, guildId);
    expect(before.kingdom).not.toBeNull();
    await pool.query("UPDATE aurionGuildGovernanceStates SET capitalTerritoryId = 'contradicted-capital' WHERE guildId = ?", [guildId]);
    try {
      await expect(store.read(founderUserId, guildId)).rejects.toThrow("GUILD_GOVERNANCE_KINGDOM_READBACK_DRIFT");
    } finally {
      await pool.query("UPDATE aurionGuildGovernanceStates SET capitalTerritoryId = ? WHERE guildId = ?", [before.kingdom!.capitalTerritoryId, guildId]);
    }
    expect(await store.read(founderUserId, guildId)).toEqual(before);
    await expect(store.read(founderUserId, "foreign-guild")).rejects.toThrow("ACTIVE_GUILD_MEMBERSHIP_REQUIRED");
  });

  it("reads one database snapshot when a territory changes between its component queries", async () => {
    const before = await store.read(founderUserId, guildId);
    const territory = before.territories[0];
    const reader = await pool.getConnection();
    const writer = await pool.getConnection();
    let changed = false;
    // Instrument only the interleaving: every query still executes against real MariaDB.
    const observedReader = new Proxy(reader, {
      get(target, property) {
        if (property === "release") return () => {};
        if (property === "query") return async (...args: unknown[]) => {
          const result = await Reflect.apply(target.query, target, args);
          if (!changed && String(args[0]).startsWith("SELECT guildId, revision, kingdomId")) {
            changed = true;
            await writer.beginTransaction();
            await writer.query("UPDATE aurionGuildTerritories SET state = 'contested' WHERE territoryId = ?", [territory.territoryId]);
            await writer.query("UPDATE aurionGuildGovernanceStates SET revision = revision + 1 WHERE guildId = ?", [guildId]);
            await writer.commit();
          }
          return result;
        };
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const instrumented = new GuildGovernanceStore(new Proxy(pool, {
      get(target, property) {
        if (property === "getConnection") return async () => observedReader;
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }));
    try {
      expect(await instrumented.read(founderUserId, guildId)).toEqual(before);
      expect(changed).toBe(true);
      const after = await store.read(founderUserId, guildId);
      expect(after.revisionExact).toBe((BigInt(before.revisionExact) + 1n).toString());
      expect(after.territories.find(item => item.territoryId === territory.territoryId)?.state).toBe("contested");
    } finally {
      await writer.rollback();
      await writer.beginTransaction();
      await writer.query("UPDATE aurionGuildTerritories SET state = ? WHERE territoryId = ?", [territory.state, territory.territoryId]);
      await writer.query("UPDATE aurionGuildGovernanceStates SET revision = ? WHERE guildId = ?", [before.revisionExact, guildId]);
      await writer.commit();
      reader.release(); writer.release();
    }
  });
});
