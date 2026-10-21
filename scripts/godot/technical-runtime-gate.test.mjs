import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildTechnicalRuntimeGateReceipt } from './technical-runtime-gate.mjs';

const revision = 'a'.repeat(40);
const digest = c => 'sha256:' + c.repeat(64);
const tags = ['0049_aurion_causal_receipt_v2', '0075_aurion_native_auth_sessions'];
const authority = { ruleset: 'aurion-zone-v3', tickHz: 10, causalReceipts: true };
const digests = {
  buildInputDigest: digest('a'), artifactDigest: digest('b'),
  runtimeImageDigest: digest('c'), releaseArchiveDigest: digest('d'),
};
const input = () => ({
  revision, sourceRunId: 39556580684,
  identity: {sourceRevision: revision, mergeSha: revision, ...digests},
  installed: {recordType: 'aurion_traefik_runtime_readback', revision,
    databaseConnectivity: 'authenticated_select_1', authority, ...digests},
  attestation: {gateId: 'AURION-M21-B2-ATTESTATION', sourceRevision: revision,
    status: 'PASS', checks: [{name:'source-bound', pass:true}]},
  schema: {sourceRevision: revision, state: 'PRESENT_SCHEMA_MATCH', readOnly: true,
    databaseCredentialReturned: false, migrations: tags.map(tag => ({tag, state:'PRESENT_SCHEMA_MATCH'})),
    summary: {migrationCount:2, matchCount:2, absentCount:0, driftCount:0}},
  manifest: {migrations: tags.map(tag => ({tag, source:'aurion'}))},
  health: {status:'ok', service:'echoes-of-aurion', revision,
    authority, ...digests,
    gameDevelopmentStudio: {available: true, version: '1.0.2'},
    causalAssurance: {schema:'aurion.causal-assurance.v1', worldId:'echoes-of-aurion-global',mutationAuthority:'none'}},
});

test('technical backend receipt succeeds without gameplay, NPC, guild or session approval', () => {
  const ready = buildTechnicalRuntimeGateReceipt(input());
  assert.equal(ready.status, 'PASS');
  assert.equal(ready.scope, 'technical_godot_runtime_only');
  assert.equal(ready.sourceRunId, 39556580684);
  assert.equal(ready.gameplayAcceptance, 'NOT_ASSESSED');
  assert.equal(ready.loginE2E, 'NOT_ASSESSED');
  assert.equal(ready.androidApkSigning, 'NOT_ASSESSED');
  assert.equal(ready.mutationAuthority, 'none');
  assert.match(ready.receiptHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(buildTechnicalRuntimeGateReceipt(input()), ready);
});

test('rejects mismatched source run, revision, signer attestation and missing proof', () => {
  for (const change of [
    x => {x.sourceRunId = 0},
    x => {x.revision = 'z'.repeat(40)},
    x => {x.identity.mergeSha = 'b'.repeat(40)},
    x => {x.installed.revision = 'b'.repeat(40)},
    x => {x.attestation.sourceRevision = 'b'.repeat(40)},
    x => {x.attestation.status = 'FAIL'},
    x => {x.attestation.checks[0].pass = false},
    x => {x.installed.databaseConnectivity = 'UNVERIFIED'},
    x => {x.health.revision = 'b'.repeat(40)},
    x => {x.health.gameDevelopmentStudio.available = false},
    x => {x.health.causalAssurance.mutationAuthority = 'client'},
    x => {x.health.releaseArchiveDigest = digest('f')},
    x => {x.installed.runtimeImageDigest = digest('e')},
    x => {x.schema.readOnly = false},
    x => {x.schema.state = 'RECONCILIATION_REQUIRED'},
    x => {x.schema.summary.driftCount = 1},
    x => {x.schema.migrations[0].state = 'ABSENT'},
    x => {x.manifest.migrations[0].tag = '0049_different'},
    x => {x.manifest.migrations.splice(0,1);x.schema.migrations.splice(0,1);x.schema.summary.migrationCount = 1;x.schema.summary.matchCount = 1},
  ]) {
    const candidate = input(); change(candidate);
    assert.throws(() => buildTechnicalRuntimeGateReceipt(candidate));
  }
});

test('standalone workflow reads a previous production run without executing gameplay or DDL', () => {
  const workflow = readFileSync('.github/workflows/aurion-godot-technical-runtime-gate.yml','utf8');
  for (const required of [
    'workflow_dispatch:', 'source_run_id:', 'source_sha:',
    'git merge-base --is-ancestor', 'git show',
    'gh attestation verify runtime-artifact/aurion-traefik-runtime-release.tgz',
    'gh attestation verify runtime-attestation/aurion-runtime-release-identity.json',
    'technical-runtime-gate.mjs',
    'actions/download-artifact@', 'actions/upload-artifact@',
  ]) assert.ok(workflow.includes(required), 'missing technical proof contract: ' + required);
  for (const forbidden of [
    'scripts/verify-aurion-production-gameplay.ts',
    'aurion-production-gameplay-readback-$' + '{',
    'gh workflow run .github/workflows/aurion-production-schema-apply.yml',
  ]) assert.ok(!workflow.includes(forbidden),'gameplay or schema action leaked into technical proof');
});
