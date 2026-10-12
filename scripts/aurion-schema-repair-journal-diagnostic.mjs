import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function journalDiagnostic(receipt, history, revision, imageDigest, runnerStatus) {
  if (!/^[a-f0-9]{40}$/.test(revision) || !/^sha256:[a-f0-9]{64}$/.test(imageDigest)
    || receipt?.recordType !== 'aurion_production_schema_reconciliation' || receipt.schemaVersion !== 1
    || receipt.sourceRevision !== revision || receipt.readOnly !== true || receipt.databaseCredentialReturned !== false
    || !['PRESENT_SCHEMA_MATCH', 'PRESENT_SCHEMA_DRIFT', 'RECONCILIATION_REQUIRED'].includes(receipt.overallState)
    || ![0, 3].includes(runnerStatus) || receipt.execution?.containerExitStatus !== runnerStatus
    || receipt.execution.mode !== 'docker' || receipt.execution.network !== 'echoes-of-aurion-internal'
    || receipt.execution.imageDigest !== imageDigest || receipt.execution.rootFilesystemReadOnly !== true
    || receipt.execution.releaseMountedReadOnly !== true || receipt.execution.environmentMountedReadOnly !== true) throw new Error('DIAGNOSTIC_READBACK_IDENTITY_INVALID');
  if (!Array.isArray(history) || history.some(e => !/^[a-f0-9]{64}$/.test(e.hash ?? '') || !/^[0-9]{4}_[a-z0-9_]{1,96}$/.test(e.tag ?? '') || !Number.isSafeInteger(e.when) || e.when < 0)
    || new Set(history.map(e => e.hash)).size !== history.length) throw new Error('DIAGNOSTIC_SOURCE_HISTORY_INVALID');
  const journals = receipt.drizzleJournal;
  if (!Array.isArray(journals) || journals.length !== 1 || journals[0].tableName !== '__drizzle_migrations'
    || !Array.isArray(journals[0].rows) || journals[0].rows.length > 10000) throw new Error('DIAGNOSTIC_JOURNAL_SCOPE_INVALID');
  const byHash = new Map(history.map(e => [e.hash, e]));
  const seen = new Set();
  const conflicts = [];
  let invalidRowCount = 0;
  journals[0].rows.forEach((row, position) => {
    // Only migration digests and numeric migration timestamps can leave this
    // boundary. Malformed rows, SQL and arbitrary driver values are omitted.
    if (!/^[a-f0-9]{64}$/.test(row?.hash ?? '') || typeof row.createdAt !== 'string'
      || !/^[0-9]{1,16}$/.test(row.createdAt) || !Number.isSafeInteger(Number(row.createdAt))) { invalidRowCount++; return; }
    const identity = byHash.get(row.hash);
    const reason = !identity ? 'UNRECOGNIZED_HASH' : seen.has(row.hash) ? 'DUPLICATE_HASH'
      : Number(row.createdAt) !== identity.when ? 'TIMESTAMP_MISMATCH' : null;
    seen.add(row.hash);
    if (reason) conflicts.push({ position, hash: row.hash, createdAt: row.createdAt, reason,
      ...(identity ? { migration: identity.tag, expectedWhen: identity.when } : {}) });
  });
  return { schemaVersion: 1, recordType: 'aurion_schema_repair_journal_diagnostic', sourceRevision: revision,
    observedAt: new Date().toISOString(), readOnly: true, databaseCredentialReturned: false,
    schemaState: receipt.overallState, runnerStatus, rowCount: journals[0].rows.length,
    invalidRowCount, conflicts, unrecordedSourceTags: history.filter(e => !seen.has(e.hash)).map(e => e.tag) };
}

async function main() {
  const [rawPath, revision, imageDigest, status, outputPath] = process.argv.slice(2);
  const raw = await readFile(rawPath, 'utf8');
  if (Buffer.byteLength(raw) > 4 * 1024 * 1024) throw new Error('DIAGNOSTIC_READBACK_TOO_LARGE');
  const journal = JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8'));
  const history = await Promise.all(journal.entries.map(async e => {
    if (!/^[0-9]{4}_[a-z0-9_]{1,96}$/.test(e.tag ?? '')) throw new Error('DIAGNOSTIC_SOURCE_HISTORY_INVALID');
    return { tag: e.tag, when: e.when, hash: createHash('sha256').update(await readFile(path.join('drizzle', e.tag + '.sql'))).digest('hex') };
  }));
  const result = journalDiagnostic(JSON.parse(raw), history, revision, imageDigest, Number(status));
  await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(result) + '\n');
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  process.stderr.write(/^(DIAGNOSTIC_[A-Z_]+)$/.test(error.message) ? error.message + '\n' : 'DIAGNOSTIC_EXECUTION_FAILED\n');
  process.exitCode = 1;
});
