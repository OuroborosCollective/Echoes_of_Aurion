import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

// Isolated loopback test server: all content and credentials below are synthetic.
const [godot, project] = process.argv.slice(2);
assert.ok(godot && project, 'godot executable and project required');
const calls = [];
let failure;
const empty = { schemaVersion: 'aurion.world-design.v1', revision: 'a'.repeat(64), designs: [] };
const receipt = {
  schemaVersion: 'aurion.authoring-receipt.v1', receiptId: 'authoring:world:fixture0001',
  kind: 'world', action: 'apply', targetId: 'village.http:v1', actorUserId: 1,
  planHash: 'd'.repeat(64), previousHash: null, resultHash: 'b'.repeat(64),
  receiptHash: 'e'.repeat(64), humanConfirmed: true,
};
let submitted;
const server = createServer(async (req, res) => {
  try {
    assert.equal(req.headers.authorization, `Bearer ${'a'.repeat(43)}`);
    assert.equal(req.headers.cookie, undefined);
    let raw = '';
    for await (const part of req) raw += part;
    calls.push(`${req.method} ${req.url}`);
    let result;
    switch (calls.length) {
      case 1:
        assert.equal(calls.at(-1), 'GET /api/trpc/aurionAuthoring.catalog');
        result = { result: { data: { json: { glbCatalogRevision: 'c'.repeat(64) } } } };
        break;
      case 2:
        assert.equal(calls.at(-1), 'GET /api/game/world-design');
        result = empty;
        break;
      case 3: {
        assert.equal(calls.at(-1), 'POST /api/trpc/aurionAuthoring.worldPlan');
        submitted = JSON.parse(raw).json;
        assert.equal(submitted.designKey, 'village.http');
        assert.equal(submitted.expectedCatalogRevision, 'c'.repeat(64));
        result = { result: { data: { json: { ...submitted, planHash: 'd'.repeat(64),
          referencedAssetHashes: ['e'.repeat(64)], requiresHumanConfirmation: true } } } };
        break;
      }
      case 4: {
        assert.equal(calls.at(-1), 'POST /api/trpc/aurionAuthoring.worldApply');
        assert.deepEqual(JSON.parse(raw).json, { draft: submitted, expectedPlanHash: 'd'.repeat(64), confirmation: 'APPLY_WORLD_DESIGN' });
        const { schemaVersion, ...design } = submitted;
        const world = { schemaVersion, revision: 'f'.repeat(64), designs: [{ ...design, designHash: 'b'.repeat(64) }] };
        result = { result: { data: { json: { receipt, readback: world } } } };
        break;
      }
      case 5: {
        assert.equal(calls.at(-1), 'GET /api/game/world-design');
        const { schemaVersion, ...design } = submitted;
        result = { schemaVersion, revision: 'f'.repeat(64), designs: [{ ...design, designHash: 'b'.repeat(64) }] };
        break;
      }
      case 6:
        assert.equal(calls.at(-1), 'GET /api/game/world-design');
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(JSON.stringify(empty));
        return;
      default:
        throw new Error('unexpected request');
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
  } catch (error) {
    failure ||= error;
    res.writeHead(500, { 'Content-Type': 'application/json' }).end('{}');
  }
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(3000, '127.0.0.1', resolve);
});
let output = '', timedOut = false;
const child = spawn(godot, ['--headless', '--path', project, '--script', 'tests/test_world_authoring_http.gd']);
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 20000);
const code = await new Promise(resolve => child.once('exit', value => resolve(value ?? 1)));
clearTimeout(timer);
await new Promise(resolve => server.close(resolve));
process.stdout.write(output);
assert.ifError(failure);
assert.equal(timedOut, false, 'world-authoring HTTP fixture timed out');
assert.equal(code, 0, 'world-authoring Godot fixture failed');
assert.equal(calls.length, 6, 'unexpected HTTP sequence');
assert.match(output, /G21_WORLD_AUTHORING_HTTP_FIXTURE_PASS/);
