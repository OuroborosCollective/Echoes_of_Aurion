import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

const [godot, project] = process.argv.slice(2);
assert.ok(godot && project, 'Godot and project required');
let identity = 0, applies = 0, questPublishes = 0, templatePages = 0, templateReads = 0, redirects = 0, failures;
const response = (res, value) => res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(value));
const envelope = json => ({ result: { data: { json } } });
const server = createServer(async (req, res) => {
  try {
    if (req.url === '/redirect-sink') { redirects++; res.end(); return; }
    if (req.url === '/api/game/world-design') {
      assert.equal(req.method, 'GET');
      assert.equal(req.headers.authorization, undefined);
      assert.equal(req.headers['cache-control'], 'no-cache');
      response(res, { schemaVersion: 'aurion.world-design.v1', revision: 'b'.repeat(64), designs: [] });
      return;
    }
    assert.equal(req.headers.authorization, 'Bearer fixture-access-token');
    if (req.url === '/api/trpc/auth.me') {
      assert.equal(req.method, 'GET');
      identity++;
      if (identity === 2) setTimeout(() => response(res, envelope({ id: 42, role: 'admin' })), 200);
      else response(res, envelope({ id: 42, role: 'admin' }));
      return;
    }
    if (req.url === '/api/trpc/aurionAuthoring.catalog') {
      assert.equal(req.method, 'GET');
      res.writeHead(302, { Location: 'http://127.0.0.1:3000/redirect-sink' }).end();
      return;
    }
    assert.equal(req.method, 'POST');
    assert.equal(req.headers['content-type'], 'application/json');
    let body = '';
    for await (const chunk of req) body += chunk;
    const data = JSON.parse(body).json;
    if (req.url === '/api/trpc/aurionQuest.authoringTemplates') {
      templatePages++;
      assert.deepEqual(data, templatePages === 1 ? {} : { after: { templateId: 'quest.http-fixture', version: 1 } });
      response(res, envelope({ schemaVersion: 'aurion.quest-template-page.v1', items: [{ templateId: 'quest.http-fixture', version: 1, title: 'Fixture', active: true, quarantined: false }], nextCursor: templatePages === 1 ? { templateId: 'quest.http-fixture', version: 1 } : null }));
    } else if (req.url === '/api/trpc/aurionQuest.authoringTemplate') {
      templateReads++;
      assert.deepEqual(data, { templateId: 'quest.http-fixture', version: templateReads === 1 ? 1 : 300 });
      response(res, envelope({ templates: [{ templateId: data.templateId, version: data.version }], nextVersion: 301, durable: true }));
    } else if (req.url === '/api/trpc/aurionAuthoring.worldPlan') {
      assert.deepEqual(data, { fixture: 'draft' });
      response(res, envelope({ planHash: 'a'.repeat(64) }));
    } else if (req.url === '/api/trpc/aurionAuthoring.worldApply') {
      assert.deepEqual(data, { fixture: 'one-shot' });
      applies++;
      res.writeHead(503, { 'Content-Type': 'application/json' }).end('{}');
    } else if (req.url === '/api/trpc/aurionQuest.publish') {
      assert.deepEqual(data, { proposalId: 'prop_http_fixture', expectedPlanHash: 'a'.repeat(64), confirmation: 'PUBLISH_QUEST_TEMPLATE' });
      questPublishes++;
      res.writeHead(503, { 'Content-Type': 'application/json' }).end('{}');
    } else throw new Error(`unexpected path ${req.url}`);
  } catch (error) { failures ||= error; if (!res.headersSent) res.writeHead(500).end(); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(3000, '127.0.0.1', resolve); });
let output = '', timedOut = false;
const child = spawn(godot, ['--headless', '--path', project, '--script', 'tests/test_world_authoring_api_runtime.gd'], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 20000);
const exit = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)));
clearTimeout(timer);
await new Promise(resolve => server.close(resolve));
process.stdout.write(output);
assert.ifError(failures);
assert.equal(timedOut, false);
assert.equal(exit, 0);
assert.equal(identity, 2);
assert.equal(applies, 1, 'an apply was automatically repeated');
assert.equal(questPublishes, 1, 'a quest publication was automatically repeated');
assert.equal(templatePages, 2, 'template selection did not follow bounded pages');
assert.equal(templateReads, 2, 'copy and readback did not target exact versions');
assert.equal(redirects, 0, 'redirect was followed');
assert.match(output, /GODOT_WORLD_AUTHORING_HTTP_PASS/);
