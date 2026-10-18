import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const [executable, project] = process.argv.slice(2);
assert.ok(executable && project, 'usage: native-auth-start-runtime.mjs <godot> <project>');

let startCount = 0;
let exchangeCount = 0;
let refreshCount = 0;
let revokeCount = 0;
let redirectFollowed = false;
let handlerFailure;
let currentState = '';
const transactionId = 't'.repeat(43);
const handoffCode = 'c'.repeat(43);
const tokenPair = {
  version: 'aurion.native-auth.v1',
  tokenType: 'Bearer',
  accessToken: 'a'.repeat(43),
  accessExpiresInSeconds: 900,
  refreshToken: 'r'.repeat(43),
  refreshAbsoluteRemainingSeconds: 2592000,
  refreshIdleExpiresInSeconds: 604800,
};
const rotatedTokenPair = {
  ...tokenPair,
  accessToken: 'b'.repeat(43),
  refreshToken: 's'.repeat(43),
};
const json = (response, status, payload) => {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
};
const server = createServer((request, response) => {
  if (request.url === '/leak') {
    redirectFollowed = true;
    response.statusCode = 500;
    response.end();
    return;
  }
  if (request.method === 'GET' && request.url === '/test-callback') {
    assert.match(currentState, /^[A-Za-z0-9_-]{43}$/);
    response.setHeader('Content-Type', 'text/plain');
    response.end(`https://arelogic.space/app/auth/callback?code=${handoffCode}&state=${currentState}`);
    return;
  }
  if (request.method === 'GET' && request.url === '/test-refresh-arrived') {
    response.statusCode = refreshCount >= 2 ? 204 : 425;
    response.end();
    return;
  }
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    try {
      assert.equal(request.method, 'POST');
      assert.match(request.headers['content-type'] || '', /^application\/json(?:;|$)/);
      for (const forbidden of ['authorization', 'cookie', 'origin', 'referer']) {
        assert.equal(request.headers[forbidden], undefined, `unexpected ${forbidden} header`);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (request.url === '/api/native-auth/start') {
        startCount += 1;
        assert.deepEqual(Object.keys(payload).sort(), [
          'appBuild', 'codeChallenge', 'codeChallengeMethod', 'platform',
          'requestState', 'returnId', 'version',
        ]);
        assert.equal(payload.version, 'aurion.native-auth.v1');
        assert.match(payload.codeChallenge, /^[A-Za-z0-9_-]{43}$/);
        assert.equal(payload.codeChallengeMethod, 'S256');
        assert.match(payload.requestState, /^[A-Za-z0-9_-]{43}$/);
        assert.equal(payload.appBuild, 'aurion-godot-g09b-runtime');
        assert.equal(payload.platform, 'android');
        assert.equal(payload.returnId, 'aurion.android.app-link.v1');
        currentState = payload.requestState;
        if (startCount <= 9) {
          json(response, 200, {
            version: 'aurion.native-auth.v1',
            transactionId,
            browserUrl: `https://arelogic.space/api/native-auth/browser/${transactionId}`,
            expiresInSeconds: 600,
          });
        } else if (startCount === 10) {
          json(response, 200, {
            version: 'aurion.native-auth.v1',
            transactionId,
            browserUrl: `https://evil.example/api/native-auth/browser/${transactionId}`,
            expiresInSeconds: 600,
          });
        } else if (startCount === 11) {
          response.statusCode = 302;
          response.setHeader('Location', 'http://127.0.0.1:3000/leak');
          response.end();
        } else {
          json(response, 503, {
            version: 'aurion.native-auth.v1',
            error: 'NATIVE_AUTH_CONFIGURATION_UNAVAILABLE',
          });
        }
        return;
      }
      if (request.url === '/api/native-auth/revoke') {
        revokeCount += 1;
        assert.deepEqual(Object.keys(payload).sort(), ['refreshToken', 'scope', 'version']);
        assert.equal(payload.version, 'aurion.native-auth.v1');
        assert.equal(payload.scope, 'session');
        assert.equal(payload.refreshToken, revokeCount === 1
          ? rotatedTokenPair.refreshToken
          : tokenPair.refreshToken);
        if (revokeCount <= 2) {
          response.statusCode = 204;
          response.end();
        } else {
          response.statusCode = 302;
          response.setHeader('Location', 'http://127.0.0.1:3000/leak');
          response.end();
        }
        return;
      }
      if (request.url === '/api/native-auth/refresh') {
        refreshCount += 1;
        assert.deepEqual(Object.keys(payload).sort(), ['refreshToken', 'version']);
        assert.equal(payload.version, 'aurion.native-auth.v1');
        if (refreshCount === 1) {
          assert.equal(payload.refreshToken, tokenPair.refreshToken);
          json(response, 200, rotatedTokenPair);
        } else if (refreshCount === 2) {
          assert.equal(payload.refreshToken, tokenPair.refreshToken);
          setTimeout(() => json(response, 200, rotatedTokenPair), 150);
        } else if (refreshCount === 3) {
          assert.equal(payload.refreshToken, tokenPair.refreshToken);
          json(response, 409, {
            version: 'aurion.native-auth.v1',
            error: 'NATIVE_AUTH_REFRESH_REUSED',
          });
        } else {
          assert.equal(payload.refreshToken, tokenPair.refreshToken);
          response.statusCode = 302;
          response.setHeader('Location', 'http://127.0.0.1:3000/leak');
          response.end();
        }
        return;
      }
      assert.equal(request.url, '/api/native-auth/exchange');
      exchangeCount += 1;
      assert.deepEqual(Object.keys(payload).sort(), [
        'appBuild', 'code', 'codeVerifier', 'transactionId', 'version',
      ]);
      assert.equal(payload.version, 'aurion.native-auth.v1');
      assert.equal(payload.transactionId, transactionId);
      assert.equal(payload.code, handoffCode);
      assert.match(payload.codeVerifier, /^[A-Za-z0-9_-]{43}$/);
      assert.equal(payload.appBuild, 'aurion-godot-g09b-runtime');
      if (exchangeCount <= 5) {
        json(response, 200, tokenPair);
      } else if (exchangeCount === 6) {
        response.statusCode = 302;
        response.setHeader('Location', 'http://127.0.0.1:3000/leak');
        response.end();
      } else if (exchangeCount === 7) {
        json(response, 401, {
          version: 'aurion.native-auth.v1',
          error: 'NATIVE_AUTH_STATE_MISMATCH',
        });
      } else {
        json(response, 200, { ...tokenPair, refreshToken: tokenPair.accessToken });
      }
    } catch (error) {
      handlerFailure ??= error;
      if (!response.headersSent) {
        json(response, 500, {
          version: 'aurion.native-auth.v1',
          error: 'NATIVE_AUTH_CONFIGURATION_UNAVAILABLE',
        });
      } else {
        response.destroy();
      }
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
  '--headless', '--path', project, '--script', 'tests/test_native_auth_start_runtime.gd',
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
assert.equal(timedOut, false,
  `Godot native-auth runtime timed out: start=${startCount}, exchange=${exchangeCount}, refresh=${refreshCount}, revoke=${revokeCount}`);
assert.equal(exitCode, 0, 'Godot native-auth runtime failed');
assert.equal(startCount, 12, 'Godot did not exercise all start outcomes');
assert.equal(exchangeCount, 8, 'Godot did not exercise all exchange outcomes');
assert.equal(refreshCount, 4, 'Godot did not exercise all refresh outcomes');
assert.equal(revokeCount, 3, 'Godot did not exercise all logout outcomes');
assert.equal(redirectFollowed, false, 'Godot followed a native-auth redirect');
assert.match(output, /Godot native-auth start, exchange, refresh and logout HTTP runtime verified/);
