#!/usr/bin/env node
/** Real .NET relay authorization canary. No Godot scene, DB or server mutation. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {createServer} from 'node:net';
import {resolve, join} from 'node:path';
import {stat} from 'node:fs/promises';

async function freeLoopbackPort() {
  const server = createServer();
  await new Promise((ok, fail) => server.once('error', fail).listen(0, '127.0.0.1', ok));
  const port = server.address().port;
  await new Promise((ok, fail) => server.close(error => error ? fail(error) : ok()));
  return port;
}

async function main(project) {
  const dll = join(project, 'addons/godot_assistant/service/GodotAssistant.Service.dll');
  assert.ok((await stat(dll)).isFile(), 'ASSISTANT_RELAY_BUILD_MISSING');
  const port = await freeLoopbackPort();
  const token = randomBytes(32).toString('hex');
  const url = `http://127.0.0.1:${port}`;
  const service = spawn('dotnet', [dll, '--host', '127.0.0.1', '--port', String(port),
    '--auth-token', token, '--project-root', project, '--lsp-host', '127.0.0.1', '--lsp-port', '6005'],
    {stdio: 'ignore'});
  let exitError = null;
  service.once('error', error => {exitError = error;});
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  const post = async (mode, authenticated = true) => {
    const response = await fetch(url + '/api/sessions', {
      method: 'POST', signal: controller.signal,
      headers: {...(authenticated ? {Authorization: `Bearer ${token}`} : {}), 'Content-Type': 'application/json'},
      body: JSON.stringify({provider_id: 'codex', mode}),
    });
    return {status: response.status, body: await response.json()};
  };
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      if (exitError || service.exitCode !== null) throw new Error('ASSISTANT_RELAY_DID_NOT_START');
      try {
        const result = await fetch(url + '/health', {signal: controller.signal});
        if (result.ok) {ready = true; break;}
      } catch (e) {
        if (controller.signal.aborted) throw e;
      }
      await new Promise(ok => setTimeout(ok, 100));
    }
    assert.equal(ready, true, 'ASSISTANT_RELAY_NOT_READY');
    assert.equal((await post('ReadOnly', false)).status, 401, 'ASSISTANT_AUTH_BYPASS');
    assert.equal((await post('FullAuto')).status, 403, 'ASSISTANT_FULLAUTO_ACCEPTED');
    assert.equal((await post('UnknownMode')).status, 403, 'ASSISTANT_UNKNOWN_MODE_ACCEPTED');
    for (const mode of ['ReadOnly', 'AskBeforeWrite']) {
      const response = await post(mode);
      assert.equal(response.status, 200, 'ASSISTANT_SAFE_MODE_DENIED: ' + mode);
      assert.equal(response.body.mode, mode);
      assert.ok(response.body.mcp_url.startsWith(url + '/mcp?session='), 'ASSISTANT_NOT_LOOPBACK');
    }
    const inventory = await fetch(url + '/api/sessions', {headers: {Authorization: `Bearer ${token}`}, signal: controller.signal});
    assert.equal(inventory.status, 200);
    const sessions = await inventory.json();
    assert.deepEqual(sessions.map(x => x.mode).sort(), ['AskBeforeWrite','ReadOnly']);
    console.log('AURION_GODOT_ASSISTANT_LIVE_RELAY_AUTH_PASS');
  } finally {
    clearTimeout(timeout);
    if (service.exitCode === null) service.kill('SIGTERM');
    await Promise.race([
      new Promise(resolve => service.once('exit', resolve)),
      new Promise(resolve => setTimeout(resolve, 1200)),
    ]);
    if (service.exitCode === null) service.kill('SIGKILL');
  }
}
if (process.argv.length !== 3) {
  console.error('usage: node scripts/godot/smoke-godot-assistant-relay.mjs <isolated-staged-project>');
  process.exitCode = 1;
} else main(resolve(process.argv[2])).catch(error => {console.error(error.message); process.exitCode=1;});
