#!/usr/bin/env node
// Sanitize output of Aurion's installed, read-only root reconciler.
// No database connections or schema mutations occur in this process.
import fs from 'node:fs';

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
const MIGRATION = /^[0-9]{4}_[a-z0-9_]+$/;
const TABLE = /^__[a-z0-9_]+$/;
const STATES = new Set(['PRESENT_SCHEMA_MATCH', 'RECONCILIATION_REQUIRED', 'PRESENT_SCHEMA_DRIFT', 'UNREADABLE_FAIL_CLOSED']);
const MIGRATION_STATES = new Set(['PRESENT_SCHEMA_MATCH', 'ABSENT_APPLY_REQUIRED', 'PRESENT_SCHEMA_DRIFT']);
const MIGRATION_0075 = '0075_aurion_native_auth_sessions';

// The root-owned reconciler emits fixed, non-secret preflight diagnostics.
// Match the entire line, never emit or interpolate the original stderr.
const ROOT_PRECONDITION_FAILURES = new Map([
  ['reconciliation release is not installed', 'RECONCILE_RELEASE_MISSING'],
  ['production environment file is absent', 'PRODUCTION_ENV_MISSING'],
  ['runtime image contract is absent', 'RUNTIME_IMAGE_CONTRACT_MISSING'],
  ['runtime network contract is absent', 'RUNTIME_NETWORK_CONTRACT_MISSING'],
  ['pinned runtime image is not available locally', 'PINNED_RUNTIME_IMAGE_MISSING'],
  ['runtime database network is unavailable', 'RUNTIME_DB_NETWORK_MISSING'],
]);

export function classifyRootRunnerFailure(runnerStderr, runnerStatus) {
  if (runnerStatus === 0) return null;
  if (runnerStatus !== 69 || typeof runnerStderr !== 'string' || runnerStderr.length > 4096)
    return 'UNCLASSIFIED_RUNNER_FAILURE';
  return ROOT_PRECONDITION_FAILURES.get(runnerStderr.trim()) ?? 'UNCLASSIFIED_RUNNER_FAILURE';
}

export function summarizeLiveSchemaObservation({ rawReceipt, expectedSha, installedSha, runnerStatus, runId, runnerStderr }) {
  const basic = {
    recordType: 'aurion_live_schema_observation',
    schemaVersion: 1,
    requestedRevision: expectedSha,
    installedRevision: installedSha,
    workflowRunId: runId,
    runnerStatus,
    runnerFailureClass: classifyRootRunnerFailure(runnerStderr, runnerStatus),
    databaseReadbackVerified: false,
    productionApplyExecuted: false,
    migration0075State: 'UNVERIFIED',
    verdict: 'READBACK_INVALID',
  };
  const invalid = () => ({ ...basic });
  if (!SHA.test(expectedSha || '') || !SHA.test(installedSha || '') ||
      !Number.isInteger(runnerStatus) || runnerStatus < 0 || runnerStatus > 255 ||
      !/^[0-9]+$/.test(String(runId ?? ''))) return invalid();
  if (typeof rawReceipt !== 'string' || rawReceipt.trim() === '')
    return { ...basic, verdict: 'READBACK_UNAVAILABLE' };

  let receipt;
  try { receipt = JSON.parse(rawReceipt); } catch { return invalid(); }
  if (!receipt || Array.isArray(receipt) || typeof receipt !== 'object' ||
      receipt.recordType !== 'aurion_production_schema_reconciliation' || receipt.schemaVersion !== 1 ||
      receipt.sourceRevision !== installedSha || receipt.readOnly !== true ||
      receipt.databaseCredentialReturned !== false || !STATES.has(receipt.overallState)) return invalid();
  const x = receipt.execution;
  if (!x || x.mode !== 'docker' || x.network !== 'echoes-of-aurion-internal' ||
      !DIGEST.test(x.imageDigest || '') || x.rootFilesystemReadOnly !== true ||
      x.releaseMountedReadOnly !== true || x.environmentMountedReadOnly !== true ||
      !Number.isInteger(x.containerExitStatus) || x.containerExitStatus < 0) return invalid();
  if (!Array.isArray(receipt.migrations)) return invalid();
  const migrations = [];
  const seen = new Set();
  for (const m of receipt.migrations) {
    if (!m || !MIGRATION.test(m.tag || '') || !MIGRATION_STATES.has(m.state) || seen.has(m.tag)) return invalid();
    seen.add(m.tag);
    migrations.push({ tag: m.tag, state: m.state });
  }
  const journal = [];
  if (receipt.drizzleJournal !== undefined) {
    if (!Array.isArray(receipt.drizzleJournal)) return invalid();
    for (const entry of receipt.drizzleJournal) {
      if (!TABLE.test(entry?.tableName || '') ||
          ((entry.rowCount !== null && entry.rowCount !== undefined) &&
            (!Number.isInteger(entry.rowCount) || entry.rowCount < 0))) return invalid();
      journal.push({ tableName: entry.tableName, rowCount: entry.rowCount ?? null });
    }
  }
  if (receipt.overallState !== 'UNREADABLE_FAIL_CLOSED') {
    const s = receipt.summary;
    const counts = {
      migrationCount: migrations.length,
      matchCount: migrations.filter(m => m.state === 'PRESENT_SCHEMA_MATCH').length,
      absentCount: migrations.filter(m => m.state === 'ABSENT_APPLY_REQUIRED').length,
      driftCount: migrations.filter(m => m.state === 'PRESENT_SCHEMA_DRIFT').length,
    };
    if (!s || Object.entries(counts).some(([key, value]) => s[key] !== value)) return invalid();
    if (receipt.overallState === 'PRESENT_SCHEMA_MATCH' && (counts.absentCount || counts.driftCount)) return invalid();
    if (receipt.overallState === 'RECONCILIATION_REQUIRED' && (!counts.absentCount || counts.driftCount)) return invalid();
    if (receipt.overallState === 'PRESENT_SCHEMA_DRIFT' && !counts.driftCount) return invalid();
    if (runnerStatus === 0 && x.containerExitStatus !== 0) return invalid();
  }
  const readbackVerified = runnerStatus === 0 && x.containerExitStatus === 0 && receipt.overallState !== 'UNREADABLE_FAIL_CLOSED';
  const tag0075 = migrations.find(m => m.tag === MIGRATION_0075);
  let verdict = 'READBACK_UNAVAILABLE';
  if (runnerStatus !== 0 || x.containerExitStatus !== 0) verdict = 'READBACK_FAILED';
  else if (receipt.overallState === 'UNREADABLE_FAIL_CLOSED') verdict = 'READBACK_UNAVAILABLE';
  else if (installedSha !== expectedSha) verdict = 'RUNTIME_NOT_AT_MAIN';
  else if (receipt.overallState === 'PRESENT_SCHEMA_DRIFT') verdict = 'SCHEMA_DRIFT';
  else if (!tag0075) verdict = 'SCHEMA_0075_NOT_IN_RECEIPT';
  else if (tag0075.state === 'PRESENT_SCHEMA_DRIFT') verdict = 'SCHEMA_DRIFT';
  else if (tag0075.state === 'ABSENT_APPLY_REQUIRED') verdict = 'SCHEMA_0075_PENDING';
  else if (receipt.overallState !== 'PRESENT_SCHEMA_MATCH') verdict = 'SCHEMA_RECONCILIATION_REQUIRED';
  else verdict = 'SCHEMA_0075_MATCH';
  return {
    ...basic,
    verdict,
    databaseReadbackVerified: readbackVerified,
    migration0075State: installedSha === expectedSha ? tag0075?.state ?? 'UNVERIFIED' : 'UNVERIFIED',
    observedContractState: receipt.overallState,
    execution: { mode: 'docker', network: x.network, imageDigest: x.imageDigest,
      rootFilesystemReadOnly: true, releaseMountedReadOnly: true,
      environmentMountedReadOnly: true, containerExitStatus: x.containerExitStatus },
    summary: receipt.overallState === 'UNREADABLE_FAIL_CLOSED' ? null : {
      migrationCount: migrations.length,
      matchCount: migrations.filter(m => m.state === 'PRESENT_SCHEMA_MATCH').length,
      absentCount: migrations.filter(m => m.state === 'ABSENT_APPLY_REQUIRED').length,
      driftCount: migrations.filter(m => m.state === 'PRESENT_SCHEMA_DRIFT').length,
    },
    migrations,
    drizzleJournalTables: journal,
  };
}

if (process.argv[1]?.endsWith('/aurion-live-schema-observation.mjs')) {
  const [inputFile, expectedSha, installedSha, statusText, runId, stderrFile] = process.argv.slice(2);
  const runnerStatus = Number(statusText);
  let rawReceipt = '';
  try { rawReceipt = fs.readFileSync(inputFile, 'utf8'); } catch { /* Explicit no-receipt state. */ }
  let runnerStderr = '';
  if (stderrFile) {
    try {
      if (fs.statSync(stderrFile).size <= 4096) runnerStderr = fs.readFileSync(stderrFile, 'utf8');
    } catch { /* Inaccessible stderr is an unclassified failure, never a success. */ }
  }
  const summary = summarizeLiveSchemaObservation({ rawReceipt, expectedSha, installedSha, runnerStatus, runId, runnerStderr });
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  if (!summary.databaseReadbackVerified || summary.verdict !== 'SCHEMA_0075_MATCH') process.exitCode = 1;
}
