import { parseLateMigrationSql, lateAurionMigrationTags, type ExpectedTable } from "./aurionProductionSchemaReconciliation";
import { createHash } from "node:crypto";

// These are provenance identities, never an alternate gameplay/schema owner.
// The inventory bytes are preserved from this repository's dc6dfe3 revision.
// The dialogue timestamp is an observed deviation, NOT a historical source timestamp.
export const REVIEWED_JOURNAL = [
  { tag: "0020_wasd_aurion_dialogue_quest_intents", hash: "918952d05fe420da9c3d8876d07cfaa73c78a7fbc2d3d16083d50afc4ee0064a",
    when: 1787843338567, canonicalHash: "918952d05fe420da9c3d8876d07cfaa73c78a7fbc2d3d16083d50afc4ee0064a", canonicalWhen: 1787841103616,
    reason: "OBSERVED_TIMESTAMP_DEVIATION", sourceRevision: "7c93f70fec0bb89ff0d584a7cd39a9eae075d80e" },
  { tag: "0066_aurion_inventory_transaction_kernel", hash: "42ba1655995dc5ac0fcd47bd7ee4aca7dd025a8edf7602fccaa68d8dae83341f",
    when: 1790816583000, canonicalHash: "b7d744b2a3c05ff141e4aa36cd5d375b4b1b0a4c3b457c5c071fd0d97d0175db", canonicalWhen: 1790816583000,
    reason: "HISTORICAL_SQL_REVISION", sourceRevision: "dc6dfe393fb52c47d517f2ce56f8c302737274b7" },
] as const;
export const historicalInventorySourcePath = "drizzle/provenance/0066-dc6dfe393fb52c47d517f2ce56f8c302737274b7.sql";
export type ReviewedJournalContract = { table: ExpectedTable; dialogueSql: string; historicalInventorySql: string };
export function reviewedDialogueTable(sql: string): ExpectedTable {
  if (createHash("sha256").update(sql).digest("hex") !== REVIEWED_JOURNAL[0].canonicalHash) throw new Error("REVIEWED_JOURNAL_SOURCE_CHANGED");
  const tables = parseLateMigrationSql(lateAurionMigrationTags[0], sql).tables;
  if (tables.length !== 1 || tables[0].name !== "aurionDialogueCommandReceipts") throw new Error("REVIEWED_JOURNAL_SOURCE_CHANGED");
  return tables[0];
}
