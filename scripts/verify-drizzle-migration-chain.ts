import path from "node:path";
import { inspectDrizzleMigrationChain } from "./drizzleMigrationChain";

const repositoryRoot = path.resolve(process.cwd());
const inspection = inspectDrizzleMigrationChain(repositoryRoot);

console.log(
  JSON.stringify(
    {
      recordType: "aurion_drizzle_migration_chain_check",
      ok: inspection.ok,
      sqlCount: inspection.sqlTags.length,
      journalCount: inspection.journalTags.length,
      unjournaledSqlTags: inspection.unjournaledSqlTags,
      missingSqlTags: inspection.missingSqlTags,
      duplicateNumericPrefixes: inspection.duplicateNumericPrefixes,
      duplicateJournalTags: inspection.duplicateJournalTags,
      journalIndicesSequential: inspection.journalIndicesSequential,
    },
    null,
    2
  )
);

if (!inspection.ok) {
  console.error(
    "Drizzle migration chain is not authoritative. Refusing migration apply until every SQL migration is represented exactly once in drizzle/meta/_journal.json and the production schema has been reconciled."
  );
  process.exit(1);
}
