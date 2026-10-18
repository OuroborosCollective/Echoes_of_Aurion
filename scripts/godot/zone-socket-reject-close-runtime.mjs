import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';

const [executable, project] = process.argv.slice(2);
assert.ok(executable && project, 'usage: zone-socket-reject-close-runtime.mjs <godot> <project>');

const server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: 2048 });
let helloCount = 0;
let serverError = null;
server.on('error', error => { serverError ??= error; });
server.on('connection', socket => {
  socket.on('error', error => { serverError ??= error; });
  socket.on('message', (data, binary) => {
    try {
      helloCount += 1;
      assert.equal(binary, false, 'zone hello must be JSON text');
      const hello = JSON.parse(data.toString('utf8'));
      assert.deepEqual(Object.keys(hello).sort(), ['protocolVersion', 'ticket', 'type', 'zoneId']);
      assert.equal(hello.type, 'hello');
      assert.equal(hello.zoneId, 'observatory_threshold');
      assert.equal(hello.protocolVersion, 5);
      assert.match(hello.ticket, /^z{43}$/);
      // Mirror server/zoneGateway.ts:34: send the typed reject and immediately
      // initiate the 1008 policy close, with Node ws' actual send/close queue.
      socket.send(JSON.stringify({ type: 'reject', code: 'PROTOCOL_VERSION_UNSUPPORTED' }));
      socket.close(1008, 'zone authorization rejected');
    } catch (error) {
      serverError ??= error;
      socket.terminate();
    }
  });
});
await new Promise((resolve, reject) => {
  if (server.address()) return resolve();
  server.once('listening', resolve);
  server.once('error', reject);
});
const port = server.address().port;
let output = '';
const child = spawn(executable, [
  '--headless', '--path', project, '--script',
  'tests/integration/test_zone_socket_reject_close.gd', '--', String(port),
], { stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
let timedOut = false;
const timeout = setTimeout(() => {
  timedOut = true;
  child.kill('SIGKILL');
}, 15000);
const exitCode = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1)));
clearTimeout(timeout);
for (const socket of server.clients) socket.terminate();
await new Promise(resolve => server.close(resolve));
process.stdout.write(output);
assert.ifError(serverError);
assert.equal(timedOut, false, 'Godot Node ws reject/close loopback timed out');
assert.equal(helloCount, 1, 'node-ws gateway did not receive exactly one hello');
assert.equal(exitCode, 0, 'Godot Node ws reject-then-close runtime failed');
assert.match(output, /Godot G10 Node ws reject-then-1008-close regression verified/);
