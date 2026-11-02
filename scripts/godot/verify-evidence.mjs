import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { digest, repo, run, executable } from './toolchain.mjs';

export function validateEvidence(evidence, revision, toolchainHash) {
  assert.equal(evidence.schemaVersion, 1);
  assert.match(evidence.sourceRevision, /^[a-f0-9]{40}$/);
  assert.equal(evidence.sourceRevision, revision, 'evidence belongs to another checkout');
  assert.equal(evidence.toolchainHash, toolchainHash, 'toolchain lock changed');
  assert.match(evidence.editorHash, /^[a-f0-9]{64}$/);
  assert.equal(evidence.result, 'passed');
  const required = { doctor: 'static', import: 'headless', parity: 'static', 'world-chunk-coordinates': 'static', contract: 'headless', startup: 'headless', boot: 'headless', 'native-auth-start-runtime': 'headless', 'world-design-projection': 'headless', 'world-glb-structure': 'headless', 'world-design-active-scene': 'headless', 'world-design-large-readback': 'headless', 'world-design-http': 'headless', 'world-asset-http': 'headless', 'world-authoring-state': 'headless', 'world-authoring-scene': 'headless', 'world-editor-draft': 'headless', 'knowledge-doc-index': 'headless', 'world-authoring-http': 'headless', 'world-authoring-wire': 'headless', 'negative-broken-scene': 'headless', 'negative-missing-asset': 'headless', 'negative-wrong-contract': 'static' };
  assert.ok(Array.isArray(evidence.testRuns));
  assert.equal(new Set(evidence.testRuns.map(run => run.id)).size, evidence.testRuns.length);
  for (const [id, layer] of Object.entries(required)) {
    const test = evidence.testRuns.find(run => run.id === id);
    assert.ok(test, `missing test ${id}`);
    assert.equal(test.layer, layer);
  }
  assert.ok(evidence.testRuns.some(run => run.id.startsWith('parse-')), 'no parse checks');
  assert.ok(Object.keys(evidence.artifactHashes).length >= evidence.testRuns.length);
  for (const test of evidence.testRuns) {
    assert.equal(test.passed, true, `failed test ${test.id}`);
    assert.ok(['static', 'headless'].includes(test.layer));
    assert.match(evidence.artifactHashes[test.log] || '', /^[a-f0-9]{64}$/);
    assert.equal(test.expectedFailure, test.id.startsWith('negative-'));
    assert.equal(typeof test.observedPassed, 'boolean');
    assert.equal(test.observedPassed, !test.expectedFailure);
  }
  for (const name of Object.keys(evidence.artifactHashes)) assert.match(name, /^[a-zA-Z0-9_.-]+\.log$/);
}

export async function verifyEvidence(file) {
  const evidence = JSON.parse(await readFile(file, 'utf8'));
  const revision = run('git', ['-C', repo, 'rev-parse', 'HEAD']);
  run('git', ['-C', repo, 'diff', '--exit-code', 'HEAD']);
  assert.equal(run('git', ['-C', repo, 'ls-files', '--others', '--exclude-standard', 'godot-client', 'scripts/godot']), '', 'untracked source files');
  assert.equal(evidence.editorHash, await digest(executable), 'editor binary changed');
  validateEvidence(evidence, revision, await digest(resolve(repo, 'config/godot-toolchain.lock.json')));
  const scripts = run('git', ['-C', repo, 'ls-files', 'godot-client']).split('\n').filter(path => path.endsWith('.gd'));
  for (const path of scripts) {
    const id = `parse-${path.slice('godot-client/'.length).replaceAll('/', '-').replace(/\.gd$/, '')}`;
    assert.ok(evidence.testRuns.some(test => test.id === id && test.layer === 'static'), `missing parse check: ${path}`);
  }
  for (const [name, hash] of Object.entries(evidence.artifactHashes)) assert.equal(await digest(resolve(dirname(file), name)), hash, `artifact changed: ${name}`);
  console.log(`Godot evidence verified for ${revision} (static/headless only)`);
  return evidence;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await verifyEvidence(resolve(process.argv[2]));
}
