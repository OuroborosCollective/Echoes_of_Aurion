import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const [godot, project] = process.argv.slice(2);
assert.ok(godot && project, 'Godot and project required');
const bytes = await readFile(join(project, 'assets/starter_village/Barrel.glb'));
const sha = 'dbec78ee8f51587db4247186a44b75bc0cd639f5e3f0ea54803deaba95e4a17d';
let calls = 0, leaked = false, failure;
const server = createServer((req, res) => {
  try {
    if (req.url === '/redirect-leak') { leaked = true; res.end(); return; }
    assert.equal(req.method, 'GET');
    assert.equal(req.url, `/api/assets/glb/${sha}.glb`);
    assert.equal(req.headers.authorization, undefined);
    assert.equal(req.headers.cookie, undefined);
    calls++;
    if (calls === 2) res.writeHead(302, { Location: 'http://127.0.0.1:3000/redirect-leak' }).end();
    else if (calls === 3) res.writeHead(200, { 'Content-Type': 'text/html' }).end('<html>not a GLB</html>');
    else if (calls === 4) setTimeout(() => res.writeHead(200, { 'Content-Type': 'model/gltf-binary' }).end(bytes), 200);
    else if (calls === 5) res.writeHead(200, { 'Content-Type': '' }).end(bytes);
    else res.writeHead(200, { 'Content-Type': 'model/gltf-binary' }).end(bytes);
  } catch (error) { failure ||= error; res.writeHead(500).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3000, '127.0.0.1', resolve); });
let output = '', timedOut = false;
const child = spawn(godot, ['--headless', '--path', project, '--script', 'tests/test_world_asset_api_runtime.gd'], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 20000);
const exit = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)));
clearTimeout(timer);
await new Promise(resolve => server.close(resolve));
process.stdout.write(output);
assert.ifError(failure);
assert.equal(timedOut, false);
assert.equal(exit, 0, 'world asset API Godot runtime failed');
assert.equal(calls, 5);
assert.equal(leaked, false, 'redirect was followed');
assert.match(output, /GODOT_WORLD_ASSET_HTTP_PASS/);
