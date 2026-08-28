import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyMigrationContract,
  compareTableContract,
  lateAurionMigrationTags,
  parseLateMigrationSql,
  type ObservedTable,
} from "../scripts/aurionProductionSchemaReconciliation";

async function parse(tag: (typeof lateAurionMigrationTags)[number]) {
  const sql = await readFile(path.resolve(process.cwd(), "drizzle", `${tag}.sql`), "utf8");
  return parseLateMigrationSql(tag, sql);
}

function observedFromExpected(table: Awaited<ReturnType<typeof parse>>["tables"][number]): ObservedTable {
  return {
    name: table.name,
    columns: table.columns.map(column => ({
      name: column.name,
      columnType: column.sqlType === "int" ? "int(11)" : column.sqlType,
      nullable: column.nullable,
    })),
    indexes: table.indexes.map(index => ({
      name: index.name.startsWith("inline_unique:") ? index.name.slice("inline_unique:".length) : index.name,
      unique: index.unique,
      columns: [...index.columns],
    })),
  };
}

describe("Aurion production schema reconciliation", () => {
  it("parses all seven unjournaled SQL migrations from their real repository contracts", async () => {
    const migrations = await Promise.all(lateAurionMigrationTags.map(parse));
    expect(migrations).toHaveLength(7);
    expect(migrations.every(migration => migration.tables.length > 0)).toBe(true);
    const tableNames = migrations.flatMap(migration => migration.tables.map(table => table.name));
    expect(tableNames).toContain("aurionGlobalWorldStates");
    expect(tableNames).toContain("aurionWorldChunkDeltas");
    expect(tableNames).toContain("aurionWorldPresenceLeases");
    expect(tableNames).toContain("aurionWorldEpochReactions");
    expect(tableNames).toContain("aurionLootDropReceiptsV2");
    expect(tableNames).toContain("aurionFactionQuestlineStates");
    expect(tableNames).toContain("aurionFactionQuestlineRewardReceipts");
  });

  it("does not mistake enum string literals such as 'unique' for UNIQUE constraints", async () => {
    const migration = await parse("0025_aurion_loot_mastery_ethos");
    for (const tableName of ["aurionLootDropReceiptsV2", "aurionItemInstancesV2"]) {
      const table = migration.tables.find(candidate => candidate.name === tableName);
      expect(table).toBeDefined();
      expect(table?.columns.find(column => column.name === "quality")?.sqlType).toContain("'unique'");
      expect(table?.indexes.some(index => index.columns.length === 1 && index.columns[0] === "quality")).toBe(false);
    }
  });

  it("classifies a migration with no target tables as ABSENT_APPLY_REQUIRED", async () => {
    const migration = await parse("0027_aurion_faction_questline_rewards");
    const result = classifyMigrationContract(migration, new Map());
    expect(result.state).toBe("ABSENT_APPLY_REQUIRED");
    expect(result.missingTables).toEqual(["aurionFactionQuestlineRewardReceipts"]);
    expect(result.drift).toEqual([]);
  });

  it("accepts an exact observed schema including MariaDB integer display width", async () => {
    const migration = await parse("0026_aurion_faction_questline_state");
    const observed = new Map(migration.tables.map(table => [table.name, observedFromExpected(table)]));
    const result = classifyMigrationContract(migration, observed);
    expect(result.state).toBe("PRESENT_SCHEMA_MATCH");
    expect(result.drift).toEqual([]);
  });

  it("classifies a partial or structurally changed schema as PRESENT_SCHEMA_DRIFT", async () => {
    const migration = await parse("0027_aurion_faction_questline_rewards");
    const expected = migration.tables[0];
    const observed = observedFromExpected(expected);
    const changed: ObservedTable = {
      ...observed,
      columns: observed.columns.map(column => column.name === "xp" ? { ...column, columnType: "bigint(20)" } : column),
      indexes: observed.indexes.filter(index => index.name !== "aurionFactionQuestlineRewardReceipts_digest_uq"),
    };
    const result = classifyMigrationContract(migration, new Map([[changed.name, changed]]));
    expect(result.state).toBe("PRESENT_SCHEMA_DRIFT");
    expect(result.drift.some(item => item.includes("type:xp"))).toBe(true);
    expect(result.drift.some(item => item.includes("missing_index:aurionFactionQuestlineRewardReceipts_digest_uq"))).toBe(true);
  });

  it("treats unexpected columns and indexes as drift rather than silently accepting them", async () => {
    const migration = await parse("0022_aurion_world_chunk_deltas");
    const expected = migration.tables[0];
    const observed = observedFromExpected(expected);
    const drift = compareTableContract(expected, {
      ...observed,
      columns: [...observed.columns, { name: "shadowAuthority", columnType: "int(11)", nullable: true }],
      indexes: [...observed.indexes, { name: "unexpected_shadow_idx", unique: false, columns: ["shadowAuthority"] }],
    });
    expect(drift).toContain("aurionWorldChunkDeltas:unexpected_column:shadowAuthority");
    expect(drift).toContain("aurionWorldChunkDeltas:unexpected_index:unexpected_shadow_idx");
  });
});
