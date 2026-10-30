import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const [godot, project] = process.argv.slice(2);
const catalogMode = process.argv.includes('--catalog');
const worldDesignMode = process.argv.includes('--world-design');
assert.ok(godot && project, 'pinned Godot editor and project are required');
const payload = JSON.stringify({
  schemaVersion: worldDesignMode ? 'aurion.world-design.v1' : undefined,
  version: catalogMode ? 'aurion.glb-import.v1' : 'aurion.quest-npc-visuals.v1',
  zoneId: 'observatory_threshold',
  stateSource: 'aurion-canonical-quest-anchors',
  catalogRevision: 'a'.repeat(64), npcs: [],
});
let calls = 0, redirectLeaked = false, serverError;
const server = createServer((req, res) => {
  try {
    if (req.url === '/redirect-leak') { redirectLeaked = true; res.end(); return; }
    assert.equal(req.method, 'GET', 'NPC visual readmodel must remain GET-only');
    assert.equal(req.url, worldDesignMode ? '/api/game/world-design' : (catalogMode ? '/api/game/glb-catalog' : '/api/game/quest-npc-visuals'));
    assert.equal(req.headers['content-type'], undefined);
    assert.equal(req.headers.cookie, undefined);
    calls++;
    assert.equal(req.headers.authorization, 'Bearer ' + (calls <= 3 ? 'a' : 'b').repeat(43));
    const json = { 'Content-Type': 'application/json' };
    if (calls === 2) res.writeHead(302, { Location: 'http://127.0.0.1:3000/redirect-leak' }).end();
    else if (calls === 3) res.writeHead(401, json).end('{}');
    else if (calls === 6 || calls === 8) setTimeout(() => res.writeHead(200, json).end(payload), 200);
    else if (calls === 5) res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>invalid</html>');
    else res.writeHead(200, json).end(payload);
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
  'tests/test_quest_npc_api_runtime.gd'], { stdio: ['ignore', 'pipe', 'pipe'], env: {...process.env, AURION_TEST_GLB_CATALOG: catalogMode ? '1' : '0', AURION_TEST_WORLD_DESIGN: worldDesignMode ? '1' : '0'} });
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
assert.match(output, worldDesignMode ? /GODOT_WORLD_DESIGN_HTTP_PASS/ : (catalogMode ? /G16 GLB catalog protected GET boundary verified/ : /G16 quest NPC protected GET boundary verified/));
