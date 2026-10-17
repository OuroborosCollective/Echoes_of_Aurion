import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { summarizeLiveSchemaObservation } from './aurion-live-schema-observation.mjs';

const sha = 'a'.repeat(40);
const old = 'b'.repeat(40);
const imageDigest = 'sha256:' + 'c'.repeat(64);
const receipt = {
  schemaVersion: 1, recordType: 'aurion_production_schema_reconciliation',
  sourceRevision: sha, readOnly: true, databaseCredentialReturned: false,
  overallState: 'PRESENT_SCHEMA_MATCH',
  summary: { migrationCount: 1, matchCount: 1, absentCount: 0, driftCount: 0 },
  migrations: [{ tag: '0075_aurion_native_auth_sessions', state: 'PRESENT_SCHEMA_MATCH' }],
  drizzleJournal: [{ tableName: '__drizzle_migrations', rowCount: 77, rowReadback: 'not-for-publication' }],
  execution: { mode: 'docker', network: 'echoes-of-aurion-internal', imageDigest,
    rootFilesystemReadOnly: true, releaseMountedReadOnly: true, environmentMountedReadOnly: true,
    containerExitStatus: 0 },
};
const p = { expectedSha: sha, installedSha: sha, runnerStatus: 0, runId: '777' };
const observe = (r = receipt, args = p) =>
  summarizeLiveSchemaObservation({ ...args, rawReceipt: JSON.stringify(r) });

test('accepts genuine read-only schema receipt and strips private journal fields', () => {
  const r = observe();
  assert.equal(r.verdict, 'SCHEMA_0075_MATCH');
  assert.equal(r.databaseReadbackVerified, true);
  assert.equal(r.productionApplyExecuted, false);
  assert.deepEqual(r.drizzleJournalTables, [{ tableName: '__drizzle_migrations', rowCount: 77 }]);
  assert.ok(!JSON.stringify(r).includes('not-for-publication'));
});
test('treats a valid older installed runtime as drift rather than migration truth', () => {
  const r = observe({ ...receipt, sourceRevision: old }, { ...p, installedSha: old });
  assert.equal(r.verdict, 'RUNTIME_NOT_AT_MAIN');
  assert.equal(r.migration0075State, 'UNVERIFIED');
});
test('never invents migration success without 0075 row', () => {
  const r = observe({ ...receipt, summary: { migrationCount: 0, matchCount: 0, absentCount: 0, driftCount: 0 }, migrations: [] });
  assert.equal(r.verdict, 'SCHEMA_0075_NOT_IN_RECEIPT');
});
test('reports pending 0075 without applying anything', () => {
  const r = observe({ ...receipt, overallState: 'RECONCILIATION_REQUIRED',
    migrations: [{ tag: '0075_aurion_native_auth_sessions', state: 'ABSENT_APPLY_REQUIRED' }],
    summary: { migrationCount: 1, matchCount: 0, absentCount: 1, driftCount: 0 } });
  assert.equal(r.verdict, 'SCHEMA_0075_PENDING');
  assert.equal(r.productionApplyExecuted, false);
});
test('rejects HTML, invalid JSON and tampered execution or secret flags', () => {
  for (const s of [
    '<html>do-not-emit-me</html>', '{invalid',
    JSON.stringify({ ...receipt, databaseCredentialReturned: true }),
    JSON.stringify({ ...receipt, execution: { ...receipt.execution, rootFilesystemReadOnly: false } }),
    JSON.stringify({ ...receipt, sourceRevision: old }),
    JSON.stringify({ ...receipt, summary: { migrationCount: 99, matchCount: 99, absentCount: 0, driftCount: 0 } }),
  ]) {
    const r = summarizeLiveSchemaObservation({ ...p, rawReceipt: s });
    assert.equal(r.verdict, 'READBACK_INVALID');
    assert.equal(r.databaseReadbackVerified, false);
    assert.ok(!JSON.stringify(r).includes('do-not-emit-me'));
  }
});
test('rejects missing receipt or failed runner without success verdict', () => {
  assert.equal(summarizeLiveSchemaObservation({ ...p, rawReceipt: '' }).verdict, 'READBACK_UNAVAILABLE');
  assert.equal(observe(receipt, { ...p, runnerStatus: 70 }).verdict, 'READBACK_FAILED');
});
test('passes only allowlisted report fields and never exposes unexpected credential values', () => {
  const r = observe({ ...receipt, databasePassword: 'db-private',
    migrations: [{ ...receipt.migrations[0], accessToken: 'access-private' }] });
  const s = JSON.stringify(r);
  assert.ok(!s.includes('db-private'));
  assert.ok(!s.includes('access-private'));
});
test('workflow is manual, owner-scoped, read-only and has no migration apply action', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/aurion-0075-live-readback.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /runs-on: \[self-hosted, Linux, X64, aurion-static\]/);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /sudo -n "\$runner" "\$OBSERVED_SHA"/);
  assert.doesNotMatch(workflow, /id-token: write|actions: write|workflow_call:|gh workflow run|schema-apply|promote-aurion-zone-runtime/);
});


test('completed Aurion dispatch automatically triggers read-only observation, not a new release', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/aurion-0075-live-readback.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_run:\s*\n\s*workflows:\s*\n\s*-\s*["']?Deploy Aurion Traefik runtime["']?/);
  assert.match(workflow, /types:\s*\[completed\]/);
  assert.match(workflow, /github\.event_name == 'workflow_run'/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'workflow_dispatch'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == 'OuroborosCollective\/Echoes_of_Aurion'/);
  assert.match(workflow, /EXPECTED_SHA: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.expected_sha \|\| github\.event_name == 'workflow_run' && github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/);
  assert.match(workflow, /GITHUB_EVENT_NAME/);
  assert.match(workflow, /GITHUB_SHA/);
  assert.doesNotMatch(workflow, /id-token: write|actions: write|gh workflow run/);
});


test('main-only diagnostic patch receives an immediate independent readback after merge', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/aurion-0075-live-readback.yml', import.meta.url), 'utf8');
  assert.match(workflow, /push:\s*\n\s*branches:\s*\[main\]/);
  assert.match(workflow, /paths:\s*\n\s*-\s*["']?\.github\/workflows\/aurion-0075-live-readback\.yml/);
  assert.match(workflow, /github\.event_name == 'push'/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'.*inputs\.expected_sha/);
  assert.match(workflow, /github\.event_name == 'workflow_run'.*github\.event\.workflow_run\.head_sha/);
  assert.match(workflow, /\[\[ "\$GITHUB_EVENT_NAME" == "push" \|\| "\$GITHUB_EVENT_NAME" == "workflow_dispatch" \]\]/);
  assert.doesNotMatch(workflow, /id-token: write|actions: write|gh workflow run/);
});
