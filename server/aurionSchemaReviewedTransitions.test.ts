import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { readProductionSchemaContracts } from "../scripts/aurionProductionSchemaContracts";
import { proposeReviewed0068Transitions } from "../scripts/aurionSchemaReviewedTransitions";
import type { ExpectedMigration, ExpectedTable, ObservedTable } from "../scripts/aurionProductionSchemaReconciliation";

let migration: ExpectedMigration, sourceSql: string;
const observed = (table: ExpectedTable): ObservedTable => ({ ...table,
  columns: table.columns.map(c => ({ name: c.name, columnType: c.sqlType, nullable: c.nullable })),
  indexes: table.indexes.map(i => ({ ...i, name: i.name.replace(/^inline_unique:/, "") })),
});
beforeAll(async () => {
  migration = (await readProductionSchemaContracts(process.cwd())).find(m => m.tag === "0068_aurion_item_manipulation_runtime")!;
  sourceSql = await readFile("drizzle/0068_aurion_item_manipulation_runtime.sql", "utf8");
});
const propose = (tables: ObservedTable[], sql = sourceSql) => proposeReviewed0068Transitions({ sourceSql: sql,
  priorTables: migration.priorTables!, finalTables: migration.tables, observedTables: tables });
describe("review proposals for the exact canonical 0068 transitions", () => {
  it("proposes one atomic check replacement and adds the replacement index before removing the legacy index", () => {
    const p = propose(migration.priorTables!.map(observed));
    expect(p.reviewRequired).toBe(true);
    expect(p.blockers).toEqual([]);
    expect(p.operations.map(o => o.kind)).toEqual(["REPLACE_CHECK_ATOMIC", "ADD_INDEX", "DROP_REVIEWED_INDEX"]);
    expect(p.operations[0].sql).toContain("DROP CONSTRAINT `aurionItemInstancesV2_exactly_one_provenance_ck`, ADD CONSTRAINT");
    expect(p.operations[0].sql.match(/;/g)).toHaveLength(1);
    expect(p.operations[0].sourceStatementIndexes).toEqual([4, 5]);
    expect(p.operations[2].sourceStatementIndexes).toEqual([10]);
  });
  it("proposes no changes when the canonical transition has already been applied", () => {
    expect(propose(migration.tables.map(observed)).operations).toEqual([]);
  });
  it("blocks an unknown provenance predicate and emits no partial proposal", () => {
    const tables = migration.priorTables!.map(observed).map(t => t.name !== "aurionItemInstancesV2" ? t : {
      ...t, checks: t.checks!.map(c => c.name !== "aurionItemInstancesV2_exactly_one_provenance_ck" ? c : { ...c, expression: "1=1" }),
    });
    const p = propose(tables);
    expect(p.blockers).toContain("REVIEWED_PROVENANCE_PRESTATE_UNKNOWN");
    expect(p.operations).toEqual([]);
  });
  it("blocks a legacy index with different columns or uniqueness", () => {
    for (const change of [{ columns: ["userId"] }, { unique: false }]) {
      const tables = migration.priorTables!.map(observed).map(t => t.name !== "craftingReceipts" ? t : { ...t,
        indexes: t.indexes.map(i => i.name !== "craftingReceipts_inputItemId_unique" ? i : { ...i, ...change }) });
      const p = propose(tables);
      expect(p.blockers).toContain("REVIEWED_CRAFTING_INDEX_PRESTATE_UNKNOWN");
      expect(p.operations).toEqual([]);
    }
  });
  it("rejects modified canonical source statements", () => {
    expect(() => propose(migration.priorTables!.map(observed), sourceSql.replace("= 1);", "= 0);"))).toThrow("REVIEWED_TRANSITION_SOURCE_CHANGED");
  });
});
