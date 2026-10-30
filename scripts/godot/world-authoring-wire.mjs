import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const [godot, project] = process.argv.slice(2);
assert.ok(godot && project, 'Godot and project required');
const envelope = json => ({ result: { data: { json } } });
const send = (res, value) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
let world = { schemaVersion: 'aurion.world-design.v1', revision: 'c'.repeat(64), designs: [] };
let applies = 0, plans = 0, reads = 0, failure;
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/api/game/world-design') {
      assert.equal(req.headers.authorization, undefined);
      reads++;
      send(res, world);
      return;
    }
    assert.equal(req.headers.authorization, 'Bearer fixture-access-token');
    if (req.url === '/api/trpc/auth.me') { send(res, envelope({ id: 42, role: 'admin' })); return; }
    if (req.url === '/api/trpc/aurionAuthoring.catalog') {
      send(res, envelope({ glbCatalogRevision: 'a'.repeat(64), assets: [] }));
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const payload = JSON.parse(raw).json;
    if (req.url === '/api/trpc/aurionAuthoring.worldPlan') {
      plans++;
      send(res, envelope({ ...payload, planHash: 'd'.repeat(64), referencedAssetHashes: ['b'.repeat(64)], requiresHumanConfirmation: true }));
      return;
    }
    assert.equal(req.url, '/api/trpc/aurionAuthoring.worldApply');
    assert.equal(payload.expectedPlanHash, 'd'.repeat(64));
    assert.equal(payload.confirmation, 'APPLY_WORLD_DESIGN');
    applies++;
    const design = { ...payload.draft, designHash: 'e'.repeat(64) };
    delete design.schemaVersion;
    world = { schemaVersion: 'aurion.world-design.v1', revision: 'c'.repeat(64), designs: [design] };
    if (applies === 2) { req.socket.destroy(); return; }
    const receipt = { schemaVersion: 'aurion.authoring-receipt.v1', receiptId: `authoring:world:${'f'.repeat(24)}`,
      kind: 'world', action: 'apply', targetId: `test-village:v${payload.draft.version}`, actorUserId: 42,
      planHash: 'd'.repeat(64), previousHash: null, resultHash: 'e'.repeat(64), receiptHash: 'f'.repeat(64), humanConfirmed: true };
    if (applies === 3) setTimeout(() => { if (!res.destroyed) send(res, envelope({ receipt, readback: world })); }, 250);
    else send(res, envelope({ receipt, readback: world }));
  } catch (error) { failure ||= error; if (!res.headersSent) res.writeHead(500).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3000, '127.0.0.1', resolve); });
let output = '', timedOut = false;
const child = spawn(godot, ['--headless', '--path', project, '--script', 'tests/test_world_authoring_wire.gd'], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 20000);
const exit = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)));
clearTimeout(timer);
await new Promise(resolve => server.close(resolve));
process.stdout.write(output);
assert.ifError(failure);
assert.equal(timedOut, false);
assert.equal(exit, 0);
assert.equal(plans, 2);
assert.equal(applies, 3, 'apply was repeated without a new explicit confirmation');
assert.equal(reads, 2);
assert.match(output, /GODOT_WORLD_AUTHORING_WIRE_PASS/);
