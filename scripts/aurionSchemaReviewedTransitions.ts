import { createHash } from "node:crypto";
import { compareTableContract, type ExpectedTable, type ObservedTable } from "./aurionProductionSchemaReconciliation";

const itemTable = "aurionItemInstancesV2";
const checkName = "aurionItemInstancesV2_exactly_one_provenance_ck";
const oldIndex = "craftingReceipts_inputItemId_unique";
const inputIndex = "craftingReceipts_input_item_idx";
const dropCheck = "ALTER TABLE `aurionItemInstancesV2` DROP CONSTRAINT `aurionItemInstancesV2_exactly_one_provenance_ck`;";
const addCheck = "ALTER TABLE `aurionItemInstancesV2` ADD CONSTRAINT `aurionItemInstancesV2_exactly_one_provenance_ck` CHECK ((`lootReceiptId` IS NOT NULL) + (`inventoryReceiptId` IS NOT NULL) + (`craftingReceiptId` IS NOT NULL) = 1);";
const dropIndex = "ALTER TABLE `craftingReceipts` DROP INDEX `craftingReceipts_inputItemId_unique`;";
const addIndex = "CREATE INDEX `craftingReceipts_input_item_idx` ON `craftingReceipts` (`inputItemId`);";
const hash = (sql: string) => createHash("sha256").update(sql).digest("hex");
type TransitionOperation = { kind: "REPLACE_CHECK_ATOMIC" | "ADD_INDEX" | "DROP_REVIEWED_INDEX"; sql: string; sqlSha256: string; sourceStatementIndexes: number[]; sourceSqlSha256: string[] };

/** A proposal only. Callers must retain explicit review, snapshot binding,
 * backup, isolated rehearsal and complete postflight before execution. */
export function proposeReviewed0068Transitions(input: {
  sourceSql: string; priorTables: readonly ExpectedTable[]; finalTables: readonly ExpectedTable[]; observedTables: readonly ObservedTable[];
}) {
  const statements = input.sourceSql.split("--> statement-breakpoint").map(sql => sql.trim()).filter(Boolean);
  const required = [dropCheck, addCheck, dropIndex, addIndex];
  if (required.some(sql => !statements.includes(sql))) throw new Error("REVIEWED_TRANSITION_SOURCE_CHANGED");
  const operations: TransitionOperation[] = [], blockers: string[] = [];
  const operation = (kind: TransitionOperation["kind"], sql: string, source: string[]) => operations.push({ kind, sql, sqlSha256: hash(sql),
    sourceStatementIndexes: source.map(s => statements.indexOf(s)), sourceSqlSha256: source.map(hash) });
  const actual = input.observedTables.find(t => t.name === itemTable);
  const observedCheck = actual?.checks?.find(c => c.name === checkName);
  const prior = input.priorTables.find(t => t.name === itemTable)?.checks?.find(c => c.name === checkName);
  const final = input.finalTables.find(t => t.name === itemTable)?.checks?.find(c => c.name === checkName);
  if (!prior || !final) throw new Error("REVIEWED_TRANSITION_CONTRACT_MISSING");
  const sameCheck = (expected: typeof prior, observed: typeof observedCheck) => !!observed && compareTableContract(
    { name: itemTable, columns: [], indexes: [], checks: [expected] },
    { name: itemTable, columns: [], indexes: [], checks: [observed] },
  ).length === 0;
  if (observedCheck && !sameCheck(final, observedCheck)) {
    if (!sameCheck(prior, observedCheck)) blockers.push("REVIEWED_PROVENANCE_PRESTATE_UNKNOWN");
    else operation("REPLACE_CHECK_ATOMIC", dropCheck.slice(0, -1) + ", " + addCheck.replace(/^ALTER TABLE `aurionItemInstancesV2` /, ""), [dropCheck, addCheck]);
  }
  const crafting = input.observedTables.find(t => t.name === "craftingReceipts");
  const legacy = crafting?.indexes.find(i => i.name === oldIndex);
  if (legacy) {
    const priorIndex = input.priorTables.find(t => t.name === "craftingReceipts")?.indexes.find(i => i.name.replace(/^inline_unique:/, "") === oldIndex);
    if (!priorIndex?.unique || !legacy.unique || priorIndex.columns.join() !== "inputItemId" || legacy.columns.join() !== "inputItemId") blockers.push("REVIEWED_CRAFTING_INDEX_PRESTATE_UNKNOWN");
    else {
      const replacement = crafting!.indexes.find(i => i.name === inputIndex);
      if (replacement && (replacement.unique || replacement.columns.join() !== "inputItemId")) blockers.push("REVIEWED_CRAFTING_REPLACEMENT_INDEX_INVALID");
      else {
        if (!replacement) operation("ADD_INDEX", addIndex, [addIndex]);
        operation("DROP_REVIEWED_INDEX", dropIndex, [dropIndex]);
      }
    }
  }
  return { registryId: "aurion.schema-reviewed-0068.v1", reviewRequired: true as const, blockers,
    operations: blockers.length ? [] : operations };
}
