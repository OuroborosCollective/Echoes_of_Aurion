import { beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { readProductionSchemaContracts } from "../scripts/aurionProductionSchemaContracts";
import { buildSchemaRepairPlan, REPAIR_POLICY, sqlHash, type RepairObservation, type JournalIdentity } from "../scripts/aurionSchemaRepairPlan";
import { REVIEWED_JOURNAL, reviewedDialogueTable, type ReviewedJournalContract } from "../scripts/aurionSchemaReviewedJournal";
import { classifyMigrationContracts, type ExpectedMigration, type ExpectedTable, type ObservedTable } from "../scripts/aurionProductionSchemaReconciliation";

const sourceRevision = "a".repeat(40), ledgerPlanSha256 = "b".repeat(64), nowMs = Date.parse("2026-10-12T22:00:00Z");
let contracts: ExpectedMigration[], sources: Record<string,string>, journal: JournalIdentity[], reviewedJournalContract: ReviewedJournalContract;
const observe = (t: ExpectedTable): ObservedTable => ({ ...t,
  columns: t.columns.map(c => ({ name: c.name, columnType: c.sqlType, nullable: c.nullable, defaultSql: c.defaultSql, extra: c.extra })),
  indexes: t.indexes.map(i => ({ ...i, name: i.name.replace(/^inline_unique:/, "") })),
});
beforeAll(async () => {
  contracts = await readProductionSchemaContracts(process.cwd());
  const entries = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")).entries;
  sources = Object.fromEntries(await Promise.all(entries.map(async e => [e.tag, await readFile(`drizzle/${e.tag}.sql`, "utf8")])));
  journal = entries.map(e => ({ tag:e.tag, when:e.when, hash:sqlHash(sources[e.tag]) }));
  const dialogueSql = sources[REVIEWED_JOURNAL[0].tag];
  reviewedJournalContract = { dialogueSql, table: reviewedDialogueTable(dialogueSql),
    historicalInventorySql: await readFile("config/schema-repair-provenance/0066-dc6dfe393fb52c47d517f2ce56f8c302737274b7.sql", "utf8") };
});
function full(): RepairObservation {
  const tables = new Map(contracts.flatMap(m => m.tables.map(t => [t.name,observe(t)] as const)));
  tables.set(reviewedJournalContract.table.name, observe(reviewedJournalContract.table));
  return { sourceRevision, observedAt:new Date(nowMs).toISOString(), readOnly:true, observedTables:[...tables.values()],
    migrations:contracts.map(m => ({ tag:m.tag,state:"PRESENT_SCHEMA_MATCH" })),
    drizzleJournal:[{ tableName:"__drizzle_migrations",rows:journal.map(e => ({ hash:e.hash,createdAt:String(e.when) })) }] };
}
const plan = (observation: RepairObservation, reviewed = reviewedJournalContract) => buildSchemaRepairPlan({ sourceRevision,ledgerPlanSha256,nowMs,observation,contracts,sources,journal,reviewedJournalContract:reviewed });
function legacyJournal(o = full()) {
  o.drizzleJournal[0].rows = o.drizzleJournal[0].rows!.filter(r => !REVIEWED_JOURNAL.some(e => r.hash===e.canonicalHash));
  o.drizzleJournal[0].rows!.push(...REVIEWED_JOURNAL.map(e => ({hash:e.hash,createdAt:String(e.when)})));
  return o;
}
function sparse() {
  const o = legacyJournal(), migration = contracts.find(m => m.tag === "0068_aurion_item_manipulation_runtime")!;
  const prior = new Map(migration.priorTables!.map(t => [t.name,observe(t)] as const));
  o.observedTables = o.observedTables.map(t => prior.get(t.name) ?? t);
  const missing = contracts.filter(m => (REPAIR_POLICY.absent as readonly string[]).includes(m.tag));
  const names = missing.flatMap(m => m.createdTableNames ?? []);
  o.observedTables = o.observedTables.filter(t => !names.includes(t.name));
  const remove = new Set([...missing.map(m => m.tag), migration.tag].map(tag => journal.find(e => e.tag===tag)!.hash));
  o.drizzleJournal[0].rows = o.drizzleJournal[0].rows!.filter(r => !remove.has(r.hash));
  o.migrations = classifyMigrationContracts(contracts,new Map(o.observedTables.map(t => [t.name,t]))).map(({tag,state}) => ({tag,state}));
  return o;
}
describe("reviewed recovery preserves provenance and requires canonical postflight", () => {
  it("appends canonical identities for precisely the two reviewed deviations without changing old rows", () => {
    const o=legacyJournal(), before=structuredClone(o.drizzleJournal), p=plan(o);
    expect(p.blockers).toEqual([]);
    expect(p.schemaVersion).toBe("aurion.schema-repair-plan.v2");
    expect(p.decision).toBe("REVIEWED_REPAIR_READY");
    expect(p.journalInsertions.map(e=>e.tag)).toEqual(REVIEWED_JOURNAL.map(e=>e.tag));
    expect(p.reviewedRecovery!.preservedJournalRows).toEqual(REVIEWED_JOURNAL);
    expect(o.drizzleJournal).toEqual(before);
    expect(p.operations).toEqual([]);
  });
  it("plans the real sparse 0068 prestate with atomic check replacement and replacement-index-before-drop", () => {
    const o=sparse(), p=plan(o);
    expect(o.drizzleJournal[0].rows).toHaveLength(67);
    expect(p.blockers).toEqual([]);
    const replacement=p.operations.findIndex(o=>o.kind==="REPLACE_CHECK_ATOMIC");
    expect(replacement).toBeGreaterThan(p.operations.findIndex(o=>o.sql.includes("ADD `craftingReceiptId`")));
    expect(p.operations[replacement].sourceStatementIndexes).toEqual([4,5]);
    expect(p.operations.findIndex(o=>o.kind==="DROP_REVIEWED_INDEX")).toBeGreaterThan(p.operations.findIndex(o=>o.sql.includes("CREATE INDEX `craftingReceipts_input_item_idx`")));
    expect(p.journalInsertions).toHaveLength(9);
  });
  it("requires all canonical journal identities while retaining both original provenance rows", () => {
    const o=full();o.drizzleJournal[0].rows!.push(...REVIEWED_JOURNAL.map(e=>({hash:e.hash,createdAt:String(e.when)})));
    const p=plan(o);
    expect(o.drizzleJournal[0].rows).toHaveLength(76);
    expect(p.decision).toBe("ALREADY_MATCHED");
    expect(p.journalInsertions).toEqual([]);
    expect(p.reviewedRecovery!.preservedJournalRows).toHaveLength(2);
  });
  it("rejects any other timestamp, unknown hash or duplicate exact historical/canonical pair", () => {
    for (const row of [{hash:REVIEWED_JOURNAL[0].hash,createdAt:String(REVIEWED_JOURNAL[0].when+1)},
      {hash:"f".repeat(64),createdAt:"1"}, {hash:REVIEWED_JOURNAL[1].hash,createdAt:String(REVIEWED_JOURNAL[1].when)},
      {hash:journal[0].hash,createdAt:String(journal[0].when)}]) {
      const o=legacyJournal();o.drizzleJournal[0].rows!.push(row);
      expect(plan(o).blockers).toContain("JOURNAL_IDENTITY_CONFLICT");
    }
  });
  it("blocks metadata correction when the independently read dialogue schema is incomplete", () => {
    const o=legacyJournal();o.observedTables=o.observedTables.filter(t=>t.name!==reviewedJournalContract.table.name);
    expect(plan(o).decision).toBe("BLOCKED_OPERATOR_REVIEW");
  });
  it("rejects changed historical source bytes and changed dialogue contract sources", () => {
    expect(()=>plan(legacyJournal(),{...reviewedJournalContract,historicalInventorySql:reviewedJournalContract.historicalInventorySql+"\n"})).toThrow("REVIEWED_JOURNAL_SOURCE_CHANGED");
    expect(()=>plan(legacyJournal(),{...reviewedJournalContract,dialogueSql:"CREATE TABLE other ();"})).toThrow("REVIEWED_JOURNAL_SOURCE_CHANGED");
  });
  it("blocks unknown provenance and crafting index definitions across the whole sparse repair", () => {
    for (const kind of ["check","index"]) {
      const o=sparse();o.observedTables=o.observedTables.map(t=>kind==="check"&&t.name==="aurionItemInstancesV2" ? {...t,checks:t.checks!.map(c=>c.name==="aurionItemInstancesV2_exactly_one_provenance_ck"?{...c,expression:"1=1"}:c)}
        :kind==="index"&&t.name==="craftingReceipts"?{...t,indexes:t.indexes.map(i=>i.name==="craftingReceipts_inputItemId_unique"?{...i,columns:["userId"]}:i)}:t);
      expect(plan(o).decision).toBe("BLOCKED_OPERATOR_REVIEW");
    }
  });
});
