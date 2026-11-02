import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const [godot, project] = process.argv.slice(2);
const catalogMode = process.argv.includes('--catalog');
const worldDesignMode = process.argv.includes('--world-design');
const livingHistoryMode = process.argv.includes('--living-history');
assert.ok(godot && project, 'pinned Godot editor and project are required');
const payload = JSON.stringify({
  schema: livingHistoryMode ? 'aurion.discovered-ruin-history.v1' : undefined,
  worldId: livingHistoryMode ? 'echoes-of-aurion-global' : undefined,
  disclosureScope: livingHistoryMode ? 'globally-discovered' : undefined,
  events: livingHistoryMode ? [] : undefined,
  schemaVersion: worldDesignMode ? 'aurion.world-design.v1' : undefined,
  version: catalogMode ? 'aurion.glb-import.v1' : 'aurion.quest-npc-visuals.v1',
  zoneId: 'observatory_threshold',
  stateSource: 'aurion-canonical-quest-anchors',
  catalogRevision: 'a'.repeat(64), npcs: [],
});
// Each explicit LOD0 family repeats the normalization manifest on its logical
// entry and physical variant. A 500-entry catalog can exceed the old 1 MiB cap.
const largeCatalogPayload = catalogMode ? JSON.stringify({
  version: 'aurion.glb-import.v1', revision: 'f'.repeat(64),
  entries: Array.from({ length: 500 }, (_, index) => {
    const sha = index.toString(16).padStart(64, '0');
    const assetId = `glb_${sha.slice(-48)}`;
    const storageUrl = `/api/assets/glb/${sha}.glb`;
    const normalization = {
      revision: 'aurion.glb-normalization.v1', sourceSha256: sha,
      unitConvention: 'gltf-rh-y-up-meter', unitToMm: 1000, axisConvention: 'aurion-rh-y-up-forward-z',
      axisTransform3x3: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      sourceBoundsMm: { min: [0, 0, 0], max: [1000, 1000, 1000] },
      normalizedBoundsMm: { min: [-500, 0, -500], max: [500, 1000, 500] },
      targetEnvelopeMm: [1400, 1600, 1400], aspectRatioE6: [1000000, 1000000, 1000000],
      clearanceEnvelopeMm: [400, 600, 400], scaleE8: 100000000, sourcePivotMm: [500, 0, 500], translationMm: [-500, 0, -500],
      gridSnap: { permitted: true, stepMm: 1000, aligned: true, errorMm: [0, 0, 0] },
      collision: { authority: 'presentation-envelope-only', aabbMm: { min: [-500, 0, -500], max: [500, 1000, 500] },
        obb: { centerMm: [0, 500, 0], halfExtentsMm: [500, 500, 500], orientationQ30: [0, 0, 0, 1073741824] },
        volumeMm3: '1000000000', volumeBudgetMm3: '3136000000', surfaceAreaMm2: '6000000', surfaceAreaBudgetMm2: '12880000', triangleCount: 1200, triangleBudget: 2000000 },
      lod: { level: 0, maxRenderDistanceMm: 0, triangleCount: 1200, triangleBudget: 2000000 },
      transformSha256: '1'.repeat(64), manifestSha256: '2'.repeat(64),
    };
    return { assetId, sha256: sha, displayName: `World Nature · tree · Oak ${index}`, assetType: 'arena', storageUrl,
      targetKey: null, normalization, purpose: 'world-nature', subcategory: 'tree', equipmentSlot: null,
      lods: [{ level: 0, assetId, sha256: sha, bytes: 1000, storageUrl, targetKey: null, normalization }] };
  }),
}) : '';
if (catalogMode) {
  assert.ok(Buffer.byteLength(largeCatalogPayload) > 1024 * 1024);
  assert.ok(Buffer.byteLength(largeCatalogPayload) < 4 * 1024 * 1024);
}
let calls = 0, redirectLeaked = false, serverError;
const server = createServer((req, res) => {
  try {
    if (req.url === '/redirect-leak') { redirectLeaked = true; res.end(); return; }
    assert.equal(req.method, 'GET', 'NPC visual readmodel must remain GET-only');
    assert.equal(req.url, livingHistoryMode ? '/api/game/living-history' : (worldDesignMode ? '/api/game/world-design' : (catalogMode ? '/api/game/glb-catalog' : '/api/game/quest-npc-visuals')));
    assert.equal(req.headers['content-type'], undefined);
    assert.equal(req.headers.cookie, undefined);
    calls++;
    assert.equal(req.headers.authorization, 'Bearer ' + (calls <= 3 ? 'a' : 'b').repeat(43));
    const json = { 'Content-Type': 'application/json' };
    if (calls === 2) res.writeHead(302, { Location: 'http://127.0.0.1:3000/redirect-leak' }).end();
    else if (calls === 3) res.writeHead(401, json).end('{}');
    else if (calls === 6 || calls === 8) setTimeout(() => res.writeHead(200, json).end(payload), 200);
    else if (calls === 5) res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>invalid</html>');
    else res.writeHead(200, json).end(catalogMode && calls === 1 ? largeCatalogPayload : payload);
  } catch (e) {
    serverError ||= e;
    res.writeHead(500, { 'Content-Type': 'application/json' }).end('{}');
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(3000, '127.0.0.1', resolve);
});
let output = '', timedOut = false;
const child = spawn(godot, ['--headless', '--path', project, '--script',
  'tests/test_quest_npc_api_runtime.gd'], { stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, AURION_TEST_GLB_CATALOG: catalogMode ? '1' : '0', AURION_TEST_WORLD_DESIGN: worldDesignMode ? '1' : '0', AURION_TEST_LIVING_HISTORY: livingHistoryMode ? '1' : '0'} });
child.stdout.on('data', bytes => { output += bytes; });
child.stderr.on('data', bytes => { output += bytes; });
const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 23000);
const exit = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)));
clearTimeout(timer);
await new Promise(resolve => server.close(resolve));
process.stdout.write(output);
assert.ifError(serverError);
assert.equal(timedOut, false, 'NPC GET runtime exceeded deadline; calls=' + calls);
assert.equal(exit, 0, 'NPC GET actual engine HTTP regression failed');
assert.equal(calls, 8, 'expected all eight real HTTP requests');
assert.equal(redirectLeaked, false, 'NPC redirected bearer leaked to redirect endpoint');
assert.match(output, livingHistoryMode ? /GODOT_LIVING_HISTORY_HTTP_PASS/ : (worldDesignMode ? /GODOT_WORLD_DESIGN_HTTP_PASS/ : (catalogMode ? /G16 GLB catalog protected GET boundary verified/ : /G16 quest NPC protected GET boundary verified/)));
