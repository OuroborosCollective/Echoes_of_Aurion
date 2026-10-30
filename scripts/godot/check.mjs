import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { repo, root, executable, digest, run } from './toolchain.mjs';
import { execute } from './check-runtime.mjs';
import { negativeControls } from './negative-controls.mjs';
import { verifyEvidence } from './verify-evidence.mjs';

const revision = run('git', ['-C', repo, 'rev-parse', 'HEAD']);
run('git', ['-C', repo, 'diff', '--exit-code', 'HEAD']);
assert.equal(run('git', ['-C', repo, 'ls-files', '--others', '--exclude-standard', 'godot-client', 'scripts/godot']), '', 'commit new source files before producing evidence');
if (process.env.AURION_EXPECTED_REVISION) assert.equal(revision, process.env.AURION_EXPECTED_REVISION);
const output = resolve(process.env.AURION_GODOT_EVIDENCE || join(root, 'evidence', revision));
await mkdir(output, { recursive: true });
const evidencePath = join(output, 'evidence.json');
await rm(evidencePath, { force: true }); // Failed reruns cannot leave a stale green receipt.
const evidence = { schemaVersion: 1, sourceRevision: revision, toolchainHash: await digest(join(repo, 'config/godot-toolchain.lock.json')), editorHash: await digest(executable), result: 'passed', testRuns: [], artifactHashes: {} };
async function record(id, layer, result, expectedFailure = false) {
  const log = `${id}.log`;
  await writeFile(join(output, log), result.output);
  evidence.artifactHashes[log] = await digest(join(output, log));
  const passed = result.passed === !expectedFailure;
  evidence.testRuns.push({ id, layer, passed, expectedFailure, observedPassed: result.passed, exitCode: result.exitCode, log });
  console.log(`${passed ? 'PASS' : 'FAIL'} ${id} (${layer})`);
  assert.ok(passed, `${id}: ${result.output}`);
}
async function stage(id, layer, file, args, marker) {
  await record(id, layer, execute(file, args, { cwd: repo, marker }));
}
const project = join(repo, 'godot-client');
const godot = (...args) => ['--headless', '--path', project, ...args];
await stage('doctor', 'static', process.execPath, ['scripts/godot/doctor.mjs'], '"editor": "ready"');
await stage('import', 'headless', executable, godot('--editor', '--import'));
async function scripts(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === '.godot') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scripts(path);
    else if (entry.name.endsWith('.gd')) {
      const name = relative(project, path);
      await stage(`parse-${name.replaceAll('/', '-').replace(/\.gd$/, '')}`, 'static', executable, godot('--check-only', '--script', name));
    }
  }
}
await scripts(project);
await stage('parity', 'static', process.execPath, ['scripts/godot/verify-contract-parity.mjs'], 'zone-v5 contract parity verified');
for (const [id, script, marker] of [
  ['contract', 'contracts/test_zone_contract.gd', 'zone-v5 Godot contract verified'],
  ['native-auth', 'test_native_auth_flow.gd', 'Godot native-auth pre-login contract verified'],
  ['native-auth-tokens', 'test_native_auth_tokens.gd', 'Godot native-auth ephemeral token contract verified'],
  ['zone-socket', 'integration/test_zone_socket.gd', 'Godot G10 WebSocket handshake contract verified (headless, no live server)'],
  ['android-app-link-callback', 'test_native_app_link_callback.gd', 'Godot Android callback URI contract verified'],
  ['native-intent-bridge', 'test_native_intent_bridge.gd', 'Godot native Android intent bridge verified (headless injection only)'],
  ['zone-projection', 'test_zone_projection.gd', 'Godot G11 confirmed zone state projection contract verified (headless)'],
  ['zone-entities', 'test_zone_entities.gd', 'Godot G11 confirmed entity registry and visual interpolation verified (headless)'],
  ['live-world-map', 'test_live_world_map.gd', 'Godot first live-world map, model inspection and local A/B/house sketches verified (headless)'],
  ['session-recovery', 'integration/test_session_recovery.gd', 'Godot G12 pause/resume, fresh-ticket recovery and bounded retry verified (headless)'],
  ['movement-input', 'test_movement_input.gd', 'Godot G20 native input and bounded move-intent regression verified (headless fixture only)'],
  ['multitouch-routing', 'test_multitouch_routing.gd', 'Godot G21 multitouch routing and confirmed-position camera orbit verified (headless fixture only)'],
  ['g21-target-action', 'test_g21_target_action.gd', 'G21 target UI and canonical attack over isolated local WebSocket verified (fixture, not live Aurion)'],
  ['g22-native-hud', 'test_hud_projection.gd', 'G22_NATIVE_HUD_PROJECTION_TOUCH_PASS (synthetic fixtures; no physical device)'],
  ['technical-diagnostics', 'test_technical_diagnostics.gd', 'Godot G43 safe technical diagnostics verified'],
  ['startup', 'test_startup.gd', 'Aurion startup scene and configuration verified'],
  ['boot', 'test_project_boot.gd', 'Aurion project boot verified'],
]) await stage(id, 'headless', executable, godot('--script', `tests/${script}`), marker);
await stage('surface-atlas-byte-provenance', 'static', process.execPath,
  ['scripts/godot/check-surface-atlas.mjs'],
  'G17 real source WebP SHA256 and exact-copy provenance verified');
await stage('material-projection', 'headless', executable,
  godot('--script', 'tests/test_material_projection.gd'),
  'G17 atlas material projection verified');
await stage('chunk-mesh-projection', 'headless', executable,
  godot('--script', 'tests/test_chunk_terrain.gd'),
  'G18 server-shaped chunk mesh projection verified');
await stage('starter-village-source-contracts', 'static', process.execPath,
  ['--test', 'scripts/godot/check-starter-village-assets.test.mjs'], '# pass 3');
await stage('starter-village-source-provenance', 'static', process.execPath,
  ['scripts/godot/check-starter-village-assets.mjs'], 'G19_STARTER_VILLAGE_ASSET_SHA_PASS');
await stage('starter-village-model-projection', 'headless', executable,
  godot('--script', 'tests/test_starter_village_visuals.gd'),
  'G19_STARTER_VILLAGE_REAL_SCENE_BINDING_PASS');
await stage(
  'zone-socket-node-ws-reject-close',
  'headless',
  process.execPath,
  ['scripts/godot/zone-socket-reject-close-runtime.mjs', executable, project],
  'Godot G10 Node ws reject-then-1008-close regression verified',
);
await stage(
  'native-auth-start-runtime',
  'headless',
  process.execPath,
  ['scripts/godot/native-auth-start-runtime.mjs', executable, project],
  'Godot native-auth start, exchange, refresh and logout HTTP runtime verified',
);
await stage(
  'aurion-api-client-regression',
  'headless',
  process.execPath,
  ['scripts/godot/aurion-api-runtime.mjs', executable, project],
  'Godot protected zone ticket client regression verified',
);
await stage(
  'appearance-api-http',
  'headless',
  process.execPath,
  ['scripts/godot/appearance-api-runtime.mjs', executable, project],
  'G16 appearance GET wire boundary verified (isolated HTTP; test auth only)',
);
await stage(
  'quest-npc-api-http',
  'headless',
  process.execPath,
  ['scripts/godot/quest-npc-api-runtime.mjs', executable, project],
  'G16 quest NPC protected GET boundary verified (isolated HTTP; test auth only)',
);
await stage('public-appearance-refresh-http', 'headless', process.execPath,
  ['scripts/godot/public-appearance-api-runtime.mjs', executable, project],
  'G16 public appearance refresh boundary verified');
await stage('monster-catalog-http', 'headless', process.execPath,
  ['scripts/godot/quest-npc-api-runtime.mjs', executable, project, '--catalog'],
  'G16 GLB catalog protected GET boundary verified');
await stage('chunk-surface-native-http', 'headless', process.execPath,
  ['scripts/godot/chunk-surface-api-runtime.mjs', executable, project],
  'G18 protected chunk surface GET wire boundary verified');
for (const result of await negativeControls(repo, executable)) await record(`negative-${result.id}`, result.id === 'wrong-contract' ? 'static' : 'headless', result, true);
run('git', ['-C', repo, 'diff', '--exit-code', 'HEAD']);
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
await verifyEvidence(evidencePath);
