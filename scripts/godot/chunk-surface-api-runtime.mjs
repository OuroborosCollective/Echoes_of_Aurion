import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
const [godot, project] = process.argv.slice(2);
assert.ok(godot && project, 'pinned Godot and project needed for G18 HTTP regression');
const payload = JSON.stringify({
  base: { worldId: 'synthetic-G18-http-fixture', coordinate: { x: 0, z: 0 }, tiles: [] },
  deterministicHash: 'fnv1a-aabbccdd'
});
let calls = 0, leaked = false, error;
const server = createServer((req, res) => {
  try {
    if (req.url === '/redirect-leak') { leaked = true; res.end(); return; }
    assert.equal(req.method, 'GET');
    assert.equal(req.url, '/api/game/world-chunk-surface?x=0&z=0');
    assert.equal(req.headers.cookie, undefined);
    assert.equal(req.headers['content-type'], undefined);
    calls++;
    assert.equal(req.headers.authorization, 'Bearer ' + (calls <= 3 ? 'a' : 'b').repeat(43));
    const json = { 'Content-Type': 'application/json' };
    if (calls === 2) res.writeHead(302, { Location: 'http://127.0.0.1:3000/redirect-leak' }).end();
    else if (calls === 3) res.writeHead(401, json).end('{}');
    else if (calls === 6 || calls === 8) setTimeout(() => res.writeHead(200, json).end(payload), 200);
    else if (calls === 5) res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>invalid</html>');
    else res.writeHead(200, json).end(payload);
  } catch (e) { error ||= e; res.writeHead(500, { 'Content-Type': 'application/json' }).end('{}'); }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(3000, '127.0.0.1', resolve);
});
let output = '', timedOut = false;
const child = spawn(godot, ['--headless', '--path', project, '--script', 'tests/test_chunk_surface_api_runtime.gd'],
  { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', bytes => { output += bytes; });
child.stderr.on('data', bytes => { output += bytes; });
const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 23000);
const exit = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)));
clearTimeout(timer);
await new Promise(resolve => server.close(resolve));
process.stdout.write(output);
assert.ifError(error);
assert.equal(timedOut, false, 'G18 HTTP integration timeout');
assert.equal(exit, 0, 'G18 real Godot HTTP integration failed');
assert.equal(calls, 8, 'G18 did not exercise all eight physical HTTP requests');
assert.equal(leaked, false, 'bearer leaked to redirected endpoint');
assert.match(output, /G18 protected chunk surface GET wire boundary verified/);
