import fs from "node:fs";
import path from "node:path";

export type DrizzleJournalEntry = Readonly<{
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
}>;

export type MigrationChainInspection = Readonly<{
  sqlTags: readonly string[];
  journalTags: readonly string[];
  unjournaledSqlTags: readonly string[];
  missingSqlTags: readonly string[];
  duplicateNumericPrefixes: readonly string[];
  duplicateJournalTags: readonly string[];
  journalIndicesSequential: boolean;
  ok: boolean;
}>;

function stable(values: Iterable<string>): string[] {
  return [...values].sort((left, right) => left.localeCompare(right, "en"));
}

export function inspectDrizzleMigrationChain(repositoryRoot: string): MigrationChainInspection {
  const drizzleDir = path.join(repositoryRoot, "drizzle");
  const journalPath = path.join(drizzleDir, "meta", "_journal.json");
  const sqlTags = stable(
    fs
      .readdirSync(drizzleDir, { withFileTypes: true })
      .filter(entry => entry.isFile() && /^\d{4}_.+\.sql$/u.test(entry.name))
      .map(entry => entry.name.replace(/\.sql$/u, ""))
  );

  const parsed = JSON.parse(fs.readFileSync(journalPath, "utf8")) as {
    entries?: DrizzleJournalEntry[];
  };
  const entries = [...(parsed.entries ?? [])].sort((left, right) => left.idx - right.idx);
  const journalTags = entries.map(entry => entry.tag);
  const sqlSet = new Set(sqlTags);
  const journalSet = new Set(journalTags);

  const unjournaledSqlTags = sqlTags.filter(tag => !journalSet.has(tag));
  const missingSqlTags = stable(journalTags.filter(tag => !sqlSet.has(tag)));

  const numericPrefixCounts = new Map<string, number>();
  for (const tag of sqlTags) {
    const prefix = tag.slice(0, 4);
    numericPrefixCounts.set(prefix, (numericPrefixCounts.get(prefix) ?? 0) + 1);
  }
  const duplicateNumericPrefixes = stable(
    [...numericPrefixCounts.entries()].filter(([, count]) => count > 1).map(([prefix]) => prefix)
  );

  const journalTagCounts = new Map<string, number>();
  for (const tag of journalTags) {
    journalTagCounts.set(tag, (journalTagCounts.get(tag) ?? 0) + 1);
  }
  const duplicateJournalTags = stable(
    [...journalTagCounts.entries()].filter(([, count]) => count > 1).map(([tag]) => tag)
  );

  const journalIndicesSequential = entries.every((entry, index) => entry.idx === index);
  const ok =
    unjournaledSqlTags.length === 0 &&
    missingSqlTags.length === 0 &&
    duplicateNumericPrefixes.length === 0 &&
    duplicateJournalTags.length === 0 &&
    journalIndicesSequential;

  return {
    sqlTags,
    journalTags,
    unjournaledSqlTags,
    missingSqlTags,
    duplicateNumericPrefixes,
    duplicateJournalTags,
    journalIndicesSequential,
    ok,
  };
}
