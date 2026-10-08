import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const workflow = readFileSync(new URL('../.github/workflows/aurion-opencourant-boxlite-runtime-proof.yml', import.meta.url), 'utf8');
const profile = readFileSync(new URL('./opencourant-bwrap.apparmor', import.meta.url), 'utf8');
const runner = readFileSync(new URL('./run-opencourant-boxlite.py', import.meta.url), 'utf8');
test('namespace repair retains maximum sandbox and host restrictions', () => {
  assert.match(runner, /SecurityOptions\.maximum\(\)/);
  assert.doesNotMatch(workflow, /sysctl\s+-w|apparmor_restrict_unprivileged_userns=0|systemctl\s+(stop|disable)\s+apparmor/);
  assert.match(profile, /profile bwrap \/usr\/bin\/bwrap/);
  assert.match(profile, /allow userns,/);
  assert.match(profile, /audit deny capability,/);
  assert.match(profile, /allow pix \/\*\* -> &bwrap\/\/&unpriv_bwrap/);
});
test('real namespace probe and exact-head guard precede solver execution', () => {
  assert.match(workflow, /test "\$\(git rev-parse HEAD\)" = "\$\{SOURCE_SHA\}"/);
  const repair = workflow.indexOf('sudo apparmor_parser -r');
  const probe = workflow.indexOf('bwrap --unshare-user --ro-bind / / -- true', repair);
  const solver = workflow.indexOf('- name: Execute verified OpenCourant');
  assert.ok(repair > 0 && probe > repair && solver > probe);
  assert.doesNotMatch(workflow.slice(probe, solver), /continue-on-error|\|\| true/);
});
test('successful evidence follows copied-back output validation', () => {
  assert.ok(runner.indexOf('await box.copy_out') < runner.indexOf('"solverArtifacts": inventory'));
  assert.match(workflow, /python3 scripts\/opencourant_evidence.py .*--source-revision/);
  assert.match(workflow, /include-hidden-files: true/);
});

test('base-image workspace remains writable by the unprivileged image user', () => {
  assert.match(runner, /working_dir="\/workspace"/);
  assert.doesNotMatch(runner, /\/opt\/opencourant|working_dir="\/work"|sudo/);
  assert.match(runner, /id -u/);
  assert.match(runner, /stale evidence is forbidden/);
});
