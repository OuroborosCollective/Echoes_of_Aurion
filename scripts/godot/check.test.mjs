import test from 'node:test';
import assert from 'node:assert/strict';
import { execute } from './check-runtime.mjs';
import { validateEvidence } from './verify-evidence.mjs';

test('zero exit cannot hide Godot errors, missing marker, or timeout', () => {
  for (const text of ['SCRIPT ERROR: Parse Error', 'ERROR: missing asset']) {
    assert.equal(execute(process.execPath, ['-e', `console.error(${JSON.stringify(text)})`]).passed, false);
  }
  assert.equal(execute(process.execPath, ['-e', ''], { marker: 'finished' }).passed, false);
  assert.equal(execute(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeout: 50 }).passed, false);
  assert.equal(execute(process.execPath, ['-e', 'process.exit(7)']).passed, false);
  assert.equal(execute(process.execPath, ['-e', 'console.log("finished")'], { marker: 'finished' }).passed, true);
});
function valid() {
  const layers = { doctor: 'static', import: 'headless', parity: 'static', 'world-chunk-coordinates': 'static', contract: 'headless', startup: 'headless', boot: 'headless', 'native-auth-start-runtime': 'headless', 'world-design-projection': 'headless', 'world-glb-structure': 'headless', 'world-design-active-scene': 'headless', 'world-design-large-readback': 'headless', 'world-design-http': 'headless', 'world-asset-http': 'headless', 'parse-app-main': 'static', 'negative-broken-scene': 'headless', 'negative-missing-asset': 'headless', 'negative-wrong-contract': 'static' };
  const testRuns = Object.entries(layers).map(([id, layer]) => ({ id, layer, passed: true, expectedFailure: id.startsWith('negative-'), observedPassed: !id.startsWith('negative-'), log: `${id}.log` }));
  return { schemaVersion: 1, sourceRevision: 'a'.repeat(40), toolchainHash: 'b'.repeat(64), editorHash: 'c'.repeat(64), result: 'passed', testRuns, artifactHashes: Object.fromEntries(testRuns.map(run => [run.log, 'd'.repeat(64)])) };
}
test('evidence rejects wrong SHA, missing stages, failures, invented runtime and unsafe artifacts', () => {
  const check = evidence => validateEvidence(evidence, 'a'.repeat(40), 'b'.repeat(64));
  check(valid());
  for (const mutate of [
    e => { e.sourceRevision = 'e'.repeat(40); },
    e => { e.toolchainHash = 'e'.repeat(64); },
    e => { e.testRuns = e.testRuns.filter(run => run.id !== 'boot'); },
    e => { e.testRuns = e.testRuns.filter(run => run.id !== 'world-design-active-scene'); },
    e => { e.testRuns[0].passed = false; },
    e => { e.testRuns[0].layer = 'integration'; },
    e => { e.testRuns[0].observedPassed = false; },
    e => { e.testRuns.push(e.testRuns[0]); },
    e => { delete e.artifactHashes['boot.log']; },
    e => { e.artifactHashes['../outside.log'] = 'd'.repeat(64); },
  ]) {
    const evidence = valid(); mutate(evidence);
    assert.throws(() => check(evidence));
  }
});
