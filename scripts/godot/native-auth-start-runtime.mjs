import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const [executable, project] = process.argv.slice(2);
assert.ok(executable && project, 'usage: native-auth-start-runtime.mjs <godot> <project>');

let requestCount = 0;
let redirectFollowed = false;
const transactionId = 't'.repeat(43);
const server = createServer((request, response) => {
  if (request.url === '/leak') {
    redirectFollowed = true;
    response.statusCode = 500;
    response.end();
    return;
  }
  requestCount += 1;
  const chunks = [];
  request.on('data', chunk => chunks.push(chunk));
  request.on('end', () => {
    try {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/api/native-auth/start');
      assert.match(request.headers['content-type'] || '', /^application\/json(?:;|$)/);
      for (const forbidden of ['authorization', 'cookie', 'origin', 'referer']) {
        assert.equal(request.headers[forbidden], undefined, `unexpected ${forbidden} header`);
      }
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
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
      response.setHeader('Content-Type', 'application/json; charset=utf-8');
      response.setHeader('Cache-Control', 'no-store');
      if (requestCount === 1) {
        response.end(JSON.stringify({
          version: 'aurion.native-auth.v1',
          transactionId,
          browserUrl: `https://arelogic.space/api/native-auth/browser/${transactionId}`,
          expiresInSeconds: 600,
        }));
      } else if (requestCount === 2) {
        response.end(JSON.stringify({
          version: 'aurion.native-auth.v1',
          transactionId,
          browserUrl: `https://evil.example/api/native-auth/browser/${transactionId}`,
          expiresInSeconds: 600,
        }));
      } else if (requestCount === 3) {
        response.statusCode = 302;
        response.setHeader('Location', 'http://127.0.0.1:3000/leak');
        response.end();
      } else {
        response.statusCode = 503;
        response.end(JSON.stringify({
          version: 'aurion.native-auth.v1',
          error: 'NATIVE_AUTH_CONFIGURATION_UNAVAILABLE',
        }));
      }
    } catch (error) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ version: 'aurion.native-auth.v1', error: 'NATIVE_AUTH_CONFIGURATION_UNAVAILABLE' }));
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
const timer = setTimeout(() => child.kill('SIGKILL'), 30_000);
const exitCode = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)));
clearTimeout(timer);
await new Promise(resolve => server.close(resolve));
process.stdout.write(output);
assert.equal(exitCode, 0, 'Godot native-auth runtime failed');
assert.equal(requestCount, 4, 'Godot did not exercise all start outcomes');
assert.equal(redirectFollowed, false, 'Godot followed a native-auth start redirect');
assert.match(output, /Godot native-auth start HTTP runtime verified/);
