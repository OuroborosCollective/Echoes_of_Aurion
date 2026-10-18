import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const [executable, project] = process.argv.slice(2);
assert.ok(executable && project, 'usage: aurion-api-runtime.mjs <godot> <project>');

let startCount = 0;
let exchangeCount = 0;
let refreshCount = 0;
let ticketCount = 0;
let revokeCount = 0;
let currentState = '';
let handlerFailure;
const transactionId = 't'.repeat(43);
const handoffCode = 'c'.repeat(43);
const pair = (access, refresh) => ({
  version: 'aurion.native-auth.v1',
  tokenType: 'Bearer',
  accessToken: access.repeat(43),
  accessExpiresInSeconds: 900,
  refreshToken: refresh.repeat(43),
  refreshAbsoluteRemainingSeconds: 2592000,
  refreshIdleExpiresInSeconds: 604800,
});
const json = (response, status, payload) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
};
const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/test-callback') {
    assert.match(currentState, /^[A-Za-z0-9_-]{43}$/);
    response.end(`https://arelogic.space/app/auth/callback?code=${handoffCode}&state=${currentState}`);
    return;
  }
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    try {
      assert.equal(request.method, 'POST');
      assert.match(request.headers['content-type'] || '', /^application\/json(?:;|$)/);
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (request.url === '/api/native-auth/start') {
        startCount += 1;
        assert.equal(request.headers.authorization, undefined);
        currentState = payload.requestState;
        json(response, 200, {
          version: 'aurion.native-auth.v1',
          transactionId,
          browserUrl: `https://arelogic.space/api/native-auth/browser/${transactionId}`,
          expiresInSeconds: 600,
        });
        return;
      }
      if (request.url === '/api/native-auth/exchange') {
        exchangeCount += 1;
        assert.equal(request.headers.authorization, undefined);
        json(response, 200, exchangeCount === 1 ? pair('a', 'r') : pair('d', 'u'));
        return;
      }
      if (request.url === '/api/native-auth/refresh') {
        refreshCount += 1;
        assert.equal(request.headers.authorization, undefined);
        if (refreshCount === 1) {
          assert.equal(payload.refreshToken, 'r'.repeat(43));
          json(response, 200, pair('b', 's'));
        } else if (refreshCount === 2) {
          assert.equal(payload.refreshToken, 's'.repeat(43));
          json(response, 200, pair('c', 'v'));
        } else {
          assert.equal(payload.refreshToken, 'u'.repeat(43));
          json(response, 409, {
            version: 'aurion.native-auth.v1',
            error: 'NATIVE_AUTH_REFRESH_REUSED',
          });
        }
        return;
      }
      if (request.url === '/api/native-auth/revoke') {
        revokeCount += 1;
        assert.equal(request.headers.authorization, undefined);
        assert.equal(payload.refreshToken, 'v'.repeat(43));
        response.statusCode = 204;
        response.end();
        return;
      }
      assert.equal(request.url, '/api/trpc/gameplay.issueZoneTicket?batch=1');
      ticketCount += 1;
      assert.deepEqual(payload, {
        0: { json: { zoneId: 'observatory_threshold', clientBuild: 'aurion-godot-g09b-api-runtime' } },
      });
      const expectedBearer = ticketCount === 1 ? 'a'
        : ticketCount < 4 ? (ticketCount === 2 || ticketCount === 3 ? 'b' : 'c')
        : ticketCount === 4 ? 'c' : 'd';
      assert.equal(request.headers.authorization, `Bearer ${expectedBearer.repeat(43)}`);
      if (ticketCount === 1 || ticketCount === 3 || ticketCount === 4 || ticketCount === 5) {
        json(response, 401, { error: { json: { message: 'UNAUTHORIZED' } } });
      } else {
        setTimeout(() => json(response, 200, [{
          result: {
            data: {
              json: {
                ticket: 'z'.repeat(48),
                zoneId: 'observatory_threshold',
                expiresAt: '2026-10-18T10:30:00.000Z',
              },
            },
          },
        }]), 100);
      }
    } catch (error) {
      handlerFailure ??= error;
      if (!response.headersSent) json(response, 500, { error: 'test failure' });
      console.error(error);
    }
  });
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(3000, '127.0.0.1', resolve);
});
let output = '';
const child = spawn(executable, [
  '--headless', '--path', project, '--script', 'tests/test_aurion_api_runtime.gd',
], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  child.kill('SIGKILL');
}, 30_000);
const exitCode = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)));
clearTimeout(timer);
await new Promise(resolve => server.close(resolve));
process.stdout.write(output);
assert.ifError(handlerFailure);
assert.equal(timedOut, false, 'Godot protected API runtime timed out');
assert.equal(exitCode, 0, 'Godot protected API runtime failed');
assert.equal(startCount, 2, 'Godot did not establish both native sessions');
assert.equal(exchangeCount, 2, 'Godot did not exchange both callbacks');
assert.equal(refreshCount, 3, 'Godot did not exercise bounded refresh outcomes');
assert.equal(ticketCount, 5, 'Godot did not exercise protected ticket retry outcomes');
assert.equal(revokeCount, 1, 'Godot did not revoke after a second 401');
assert.match(output, /Godot protected zone ticket refresh runtime verified/);
\n