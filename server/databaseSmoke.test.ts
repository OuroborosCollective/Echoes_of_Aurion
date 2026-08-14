import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createMarketListing, getActiveExpeditionTeam, getGatewaySessionForUser, listActiveMarketListings, listPublicGlbCatalog, reviewPlayerGlbSubmission } from "./db";
import { getDb } from "./db";

type QueryRow = Record<string, unknown>;

function rowsFrom(result: unknown): QueryRow[] {
  if (!Array.isArray(result)) return [];
  const candidate = Array.isArray(result[0]) ? result[0] : result;
  return candidate.filter((row): row is QueryRow => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase("database smoke", () => {
  it("reads the central market, asset and team tables without mutating game data", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const result = await db.execute(sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name IN ('itemInstances', 'marketListings', 'marketTransactionReceipts', 'glbAssetSubmissions', 'glbAssets', 'expeditionTeams', 'expeditionTeamMembers', 'gatewaySessions')
    `);
    const tables = new Set(rowsFrom(result).map(row => String(row.table_name)));
    ["itemInstances", "marketListings", "marketTransactionReceipts", "glbAssetSubmissions", "glbAssets", "expeditionTeams", "expeditionTeamMembers", "gatewaySessions"].forEach(table => expect(tables).toContain(table));
  }, 20_000);

  it("verifies the indexes that protect active markets, pending reviews and active teams", async () => {
    const db = await getDb();
    expect(db).not.toBeNull();
    if (!db) return;

    const result = await db.execute(sql`
      SELECT DISTINCT index_name
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND index_name IN ('marketListings_status_created_idx', 'glbAssetSubmissions_status_created_idx', 'expeditionTeamMembers_active_user_uq')
    `);
    const indexes = new Set(rowsFrom(result).map(row => String(row.index_name)));
    ["marketListings_status_created_idx", "glbAssetSubmissions_status_created_idx", "expeditionTeamMembers_active_user_uq"].forEach(index => expect(indexes).toContain(index));
  }, 20_000);

  it("executes central market, asset, team and gateway server paths without writing smoke data", async () => {
    const reservedSmokeUserId = 2_147_000_000;
    const [market, catalog, team, gateway] = await Promise.all([
      listActiveMarketListings(5),
      listPublicGlbCatalog(),
      getActiveExpeditionTeam(reservedSmokeUserId),
      getGatewaySessionForUser("smoke-unknown-session", reservedSmokeUserId),
    ]);

    expect(Array.isArray(market)).toBe(true);
    expect(Array.isArray(catalog)).toBe(true);
    expect(team).toBeUndefined();
    expect(gateway).toBeUndefined();
    await expect(createMarketListing({ itemId: "smoke-missing-item", sellerUserId: reservedSmokeUserId, askingPrice: 1 })).rejects.toThrow("Dieser Gegenstand kann nicht angeboten werden.");
    await expect(reviewPlayerGlbSubmission({ submissionId: "smoke-missing-submission", reviewedByUserId: reservedSmokeUserId, decision: "approved" })).rejects.toThrow("Diese Einreichung ist nicht mehr offen.");
  }, 20_000);
});
