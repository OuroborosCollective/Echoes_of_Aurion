import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const [godot, project] = process.argv.slice(2);
assert.ok(godot && project, 'godot executable and project required');
let calls = 0, leakedRedirect = false, handlerFailure;
const result = {
  version: 'aurion.glb-import.v1', revision: 'a'.repeat(64),
  entries: [], selected: null, immutable: false,
};
const server = createServer((req, res) => {
  try {
    if (req.url === '/leak') { leakedRedirect = true; res.end(); return; }
    assert.equal(req.method, 'GET', 'character preview must not POST selections');
    assert.equal(req.url, '/api/game/public-player-characters');
    assert.equal(req.headers['content-type'], undefined);
    assert.equal(req.headers.cookie, undefined);
    calls++;
    const bearer = calls <= 3 ? 'a'.repeat(43) : 'b'.repeat(43);
    assert.equal(req.headers.authorization, 'Bearer ' + bearer);
    if (calls === 2) {
      res.writeHead(302, { Location: 'http://127.0.0.1:3000/leak' }).end();
    } else if (calls === 3) {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end('{}');
    } else if (calls === 5) {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(' '.repeat(1048577));
    } else if (calls === 6 || calls === 8) {
      setTimeout(() => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result)), 200);
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
    }
  } catch (e) {
    handlerFailure ||= e;
    res.writeHead(500, { 'Content-Type': 'application/json' }).end('{}');
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(3000, '127.0.0.1', resolve);
});
let output = '', timedOut = false;
const child = spawn(godot, ['--headless', '--path', project, '--script',
  'tests/test_appearance_api_runtime.gd'], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', c => { output += c; });
child.stderr.on('data', c => { output += c; });
const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 30000);
const code = await new Promise(resolve => child.once('exit', x => resolve(x ?? 1)));
clearTimeout(timer);
await new Promise(resolve => server.close(resolve));
process.stdout.write(output);
assert.ifError(handlerFailure);
assert.equal(timedOut, false, 'appearance GET runtime timed out; calls=' + calls + '; child_tail=' + output.slice(-4000));
assert.equal(code, 0, 'appearance GET runtime failed');
assert.equal(calls, 8, 'GET cases were not all exercised');
assert.equal(leakedRedirect, false, 'redirect was followed with credentials');
assert.match(output, /G16 appearance GET wire boundary verified/);
