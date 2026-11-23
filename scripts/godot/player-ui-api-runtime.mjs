import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const [godot, project] = process.argv.slice(2);
assert.ok(godot && project, 'godot executable and project required');
let calls = 0;
let handlerFailure;
function playerUi(revision, autoLoot, analyticsConsent, movementMode, hotbar, userId = 42) {
  return {
    version: 'aurion-ax1-ui.v1',
    userId,
    settings: { revision, autoLoot, analyticsConsent, movementMode, hotbar },
    items: [],
    equipment: [],
  };
}
const server = createServer(async (req, res) => {
  try {
    calls++;
    assert.equal(req.headers.authorization, 'Bearer ' + 'a'.repeat(43));
    assert.equal(req.headers.cookie, undefined, 'native session must not leak browser cookies');
    if (calls === 1 || calls === 3 || calls === 4) {
      assert.equal(req.method, 'GET');
      const url = new URL(req.url, 'http://127.0.0.1');
      assert.equal(url.pathname, '/api/trpc/player.ui');
      assert.equal(url.searchParams.get('batch'), '1');
      assert.deepEqual(JSON.parse(url.searchParams.get('input')), { '0': { json: null } });
      const readback = calls === 1
        ? playerUi(7, true, false, 'joystick', ['1', '2', '3', '4', '5'])
        : calls === 3
          ? playerUi(8, false, true, 'touch_to_move', ['2', '3', '4', '5', '6'])
          : playerUi(0, true, false, 'joystick', ['1', '2', '3', '4', '5'], 84);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify([{ result: { data: { json: readback } } }]));
      return;
    }
    assert.equal(calls, 2);
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/api/trpc/player.saveControls?batch=1');
    assert.equal(req.headers['content-type'], 'application/json');
    let body = '';
    for await (const chunk of req) body += chunk;
    const payload = JSON.parse(body);
    assert.deepEqual(Object.keys(payload), ['0']);
    assert.deepEqual(payload['0'].json, {
      revision: 7,
      autoLoot: false,
      analyticsConsent: true,
      movementMode: 'touch_to_move',
      hotbar: ['2', '3', '4', '5', '6'],
    });
    const readback = playerUi(8, false, true, 'touch_to_move', ['2', '3', '4', '5', '6']);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([{ result: { data: { json: readback } } }]));
  } catch (error) {
    handlerFailure ||= error;
    res.writeHead(500, { 'Content-Type': 'application/json' }).end('{}');
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(3000, '127.0.0.1', resolve);
});
let output = '', timedOut = false;
const child = spawn(godot, ['--headless', '--path', project, '--script', 'tests/test_player_ui_api_runtime.gd'], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 20000);
const code = await new Promise(resolve => child.once('exit', value => resolve(value ?? 1)));
clearTimeout(timer);
await new Promise(resolve => server.close(resolve));
process.stdout.write(output);
assert.ifError(handlerFailure);
assert.equal(timedOut, false, 'player.ui HTTP runtime timed out; calls=' + calls + '; child_tail=' + output.slice(-4000));
assert.equal(code, 0, 'player.ui HTTP runtime failed');
assert.equal(calls, 4, 'initial read, revision-bound mutation, independent readback, and new-session account read were not all exercised');
assert.match(output, /Godot player.ui GET, revision-bound save, independent readback and re-login identity verified/);
