import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { readProductionSchemaContracts } from "../scripts/aurionProductionSchemaContracts";
import { buildSchemaRepairPlan, REPAIR_POLICY, sqlHash, type JournalIdentity, type RepairObservation } from "../scripts/aurionSchemaRepairPlan";
import { classifyMigrationContracts, type ExpectedMigration, type ObservedTable } from "../scripts/aurionProductionSchemaReconciliation";

let contracts: ExpectedMigration[], sources: Record<string, string>, journal: JournalIdentity[];
const sourceRevision = "a".repeat(40), ledgerPlanSha256 = "b".repeat(64), nowMs = Date.parse("2026-10-09T10:00:00Z");
beforeAll(async () => {
  contracts = await readProductionSchemaContracts(process.cwd());
  const entries = JSON.parse(await readFile("drizzle/meta/_journal.json", "utf8")).entries;
  sources = Object.fromEntries(await Promise.all(entries.map(async ({ tag }: { tag: string }) => [tag, await readFile(path.join("drizzle", `${tag}.sql`), "utf8")])));
  journal = entries.map(({ tag, when }: { tag: string; when: number }) => ({ tag, when, hash: sqlHash(sources[tag]) }));
});
function full(): RepairObservation {
  const tables = new Map<string, ObservedTable>();
  for (const m of contracts) for (const t of m.tables) tables.set(t.name, { ...t,
    columns: t.columns.map(c => ({ name: c.name, columnType: c.sqlType, nullable: c.nullable })),
    indexes: t.indexes.map(i => ({ ...i, name: i.name.replace(/^inline_unique:/, "") })),
  });
  return { sourceRevision, readOnly: true, observedAt: new Date(nowMs).toISOString(), observedTables: [...tables.values()],
    migrations: contracts.map(m => ({ tag: m.tag, state: "PRESENT_SCHEMA_MATCH" })),
    drizzleJournal: [{ tableName: "__drizzle_migrations", rows: journal.map(e => ({ hash: e.hash, createdAt: String(e.when) })) }],
  };
}
function classify(observation: RepairObservation) {
  observation.migrations = classifyMigrationContracts(contracts, new Map(observation.observedTables.map(t => [t.name, t]))).map(({ tag, state }) => ({ tag, state }));
  return observation;
}
const plan = (observation: RepairObservation, at = nowMs) => buildSchemaRepairPlan({ sourceRevision, ledgerPlanSha256, nowMs: at, observation, contracts, sources, journal });
function missingTables() {
  const o = full();
  const migrations = contracts.filter(m => (REPAIR_POLICY.absent as readonly string[]).includes(m.tag));
  const names = migrations.flatMap(m => m.createdTableNames ?? []);
  o.observedTables = o.observedTables.filter(t => !names.includes(t.name));
  const hashes = migrations.map(m => journal.find(e => e.tag === m.tag)!.hash);
  o.drizzleJournal[0].rows = o.drizzleJournal[0].rows!.filter(r => !hashes.includes(r.hash));
  return classify(o);
}
describe("bounded Aurion schema repair plan", () => {
  it("is deterministic and requires no operation for a complete canonical database", () => {
    const a = plan(full()), b = plan(full());
    expect(a).toEqual(b);
    expect(a.decision).toBe("ALREADY_MATCHED");
    expect(a.operations).toEqual([]);
    expect(a.journalInsertions).toEqual([]);
  });
  it("reconstructs missing non-contiguous 0067/0069/0071/0072 only from their pinned canonical SQL", () => {
    const p = plan(missingTables());
    expect(p.blockers).toEqual([]);
    expect(p.decision).toBe("ADDITIVE_REPAIR_READY");
    expect(p.operations.filter(o => o.kind === "CREATE_TABLE")).toHaveLength(6);
    expect(p.journalInsertions.map(e => e.tag)).toEqual(REPAIR_POLICY.absent);
    for (const op of p.operations) {
      expect(op.sql).toBe(sources[op.tag].split("--> statement-breakpoint").map(x => x.trim()).filter(Boolean)[op.statementIndex]);
      expect(op.sqlSha256).toBe(sqlHash(op.sql));
    }
  });
  it("plans the missing world-join column and its index without rerunning 0068's DROP statements", () => {
    const o = full(), table = o.observedTables.find(t => t.name === "aurionItemInstancesV2")!;
    o.observedTables = o.observedTables.map(t => t !== table ? t : { ...t,
      columns: t.columns.filter(c => c.name !== "craftingReceiptId"), indexes: t.indexes.filter(i => i.name !== "aurionItemInstancesV2_crafting_receipt_uq"),
    });
    const p = plan(classify(o));
    expect(p.blockers).toEqual([]);
    expect(p.operations.map(op => op.kind)).toEqual(["ADD_COLUMN", "ADD_INDEX"]);
    expect(p.operations.every(op => !/\b(?:DROP|MODIFY|UPDATE|DELETE)\b/i.test(op.sql))).toBe(true);
  });
  it("blocks the whole plan if old provenance or unique constraints require a non-additive transition", () => {
    const o = missingTables();
    o.observedTables = o.observedTables.map(t => t.name !== "aurionItemInstancesV2" ? t : { ...t,
      checks: t.checks?.map(c => c.name !== "aurionItemInstancesV2_exactly_one_provenance_ck" ? c : { ...c, expression: "lootReceiptId IS NOT NULL" }),
    });
    const p = plan(classify(o));
    expect(p.decision).toBe("BLOCKED_OPERATOR_REVIEW");
    expect(p.blockers.some(b => b.includes("check_expression"))).toBe(true);
  });
  it("does not recreate a missing table whose migration is already journaled", () => {
    const o = missingTables(); o.drizzleJournal = full().drizzleJournal;
    expect(plan(o).blockers.some(b => b.startsWith("RECORDED_MIGRATION_TABLE_MISSING"))).toBe(true);
  });
  it("blocks unknown columns, wrong types, unapproved migrations and conflicting history", () => {
    const o = full(); o.observedTables[0] = { ...o.observedTables[0], columns: [...o.observedTables[0].columns, { name: "foreignState", columnType: "text", nullable: true }] };
    expect(plan(classify(o)).decision).toBe("BLOCKED_OPERATOR_REVIEW");
    const j = full(); j.drizzleJournal[0].rows!.push({ hash: "f".repeat(64), createdAt: "1" });
    expect(plan(j).blockers).toContain("JOURNAL_IDENTITY_CONFLICT");
  });
  it("rejects stale, future and wrong-revision readbacks", () => {
    expect(() => plan(full(), nowMs + 900001)).toThrow("REPAIR_READBACK_STALE");
    expect(() => plan(full(), nowMs - 1)).toThrow("REPAIR_READBACK_STALE");
    expect(() => plan({ ...full(), sourceRevision: "c".repeat(40) })).toThrow("REPAIR_READBACK_IDENTITY_MISMATCH");
  });
  it("does not certify incorrect defaults or unknown generated/extra column behavior", () => {
    const o = full();
    o.observedTables = o.observedTables.map(t => t.name !== "aurionItemInstancesV2" ? t : { ...t,
      columns: t.columns.map(c => c.name !== "socketCount" ? c : { ...c, defaultSql: "5", extra: "STORED GENERATED" }),
    });
    const p = plan(classify(o));
    expect(p.decision).toBe("BLOCKED_OPERATOR_REVIEW");
    expect(p.blockers.some(b => b.includes(":default:socketCount"))).toBe(true);
    expect(p.blockers.some(b => b.includes(":extra:socketCount"))).toBe(true);
  });
});
