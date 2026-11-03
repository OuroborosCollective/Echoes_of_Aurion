#!/usr/bin/env node
// Trusted/default-branch production runner only. Authentication comes from an
// already signed-in owner browser; no passwords, cookies or callbacks in artifacts.
import { chromium } from '@playwright/test';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { prepareCaptureProject, publicObservation, assertDistinctCaptureUsers, awaitDurableTick, verifyEditorExecutable } from './startup-capture-contract.mjs';

const output = resolve(process.argv[2] || '.aurion-parity');
const origin = 'https://arelogic.space';
const nonce = randomBytes(16).toString('hex');
const privateRunKey = randomBytes(32);
const privateDir = await mkdtemp(join(tmpdir(), 'aurion-startup-'));
await mkdir(output, { recursive: true });
const index = { schema: 'aurion.startup-capture-index.v1', nonce, status: 'FAIL',
  startedAtUtc: new Date().toISOString(), issues: [], files: {} };
let editor, browser, nativeBrowser, page, authPage;
let failure = 'CAPTURE_PREFLIGHT_FAILED';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const runtimeIdentity = value => Object.fromEntries(['status','revision','runtimeImageDigest'].map(key => [key, value[key]]));
const atomic = async (name, value) => {
  const path = join(privateDir, name);
  await writeFile(path + '.tmp', JSON.stringify(value), { mode: 0o600 });
  await rename(path + '.tmp', path);
};
const waitFor = async (get, code, timeout = 30_000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await get();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error(code);
};
const maybeJson = async name => { try { return await json(join(privateDir, name)); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
const publish = async (name, bytes) => {
  await writeFile(join(output, name), bytes);
  index.files[name] = createHash('sha256').update(bytes).digest('hex');
};
async function rpc(procedure, input, {request=page.request, nullable=false}={}) {
  const url = `${origin}/api/trpc/${procedure}?input=${encodeURIComponent(JSON.stringify({ json: input }))}`;
  const response = await request.get(url, { timeout: 15_000 });
  if (!response.ok()) throw Error('CANONICAL_READBACK_UNAUTHORIZED_OR_UNAVAILABLE');
  const body = await response.json();
  if (body.error || !Object.hasOwn(body.result?.data ?? {}, 'json') || (body.result.data.json === null && !nullable)) throw Error('CANONICAL_READBACK_INVALID');
  return body.result.data.json;
}
function localCdp(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1','localhost'].includes(url.hostname) || url.username || url.password || url.pathname !== '/') throw Error('CDP_MUST_BE_LOCAL');
  return url.href;
}

try {
  index.sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (!/^[a-f0-9]{40}$/.test(process.env.AURION_EXPECTED_REVISION || '') || process.env.AURION_EXPECTED_REVISION !== index.sourceRevision) throw Error('CHECKOUT_REVISION_MISMATCH');
  if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim()) throw Error('CHECKOUT_NOT_CLEAN');
  failure = 'LIVE_HEALTH_UNAVAILABLE';
  const healthResponse = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(10_000) });
  if (!healthResponse.ok()) throw Error(failure);
  index.runtime = runtimeIdentity(await healthResponse.json());
  if (index.runtime.revision !== index.sourceRevision) throw Error('LIVE_REVISION_MISMATCH');
  if (!/^sha256:[a-f0-9]{64}$/.test(index.runtime.runtimeImageDigest || '')) throw Error('LIVE_IMAGE_UNVERIFIED');
  failure = 'AUTHENTICATED_BROWSER_NOT_CONFIGURED';
  browser = await chromium.connectOverCDP(localCdp(process.env.AURION_PARITY_CDP_URL || 'http://127.0.0.1:9222'), { timeout: 10_000 });
  const context = browser.contexts()[0];
  if (!context) throw Error(failure);
  failure = 'NATIVE_AUTH_BROWSER_NOT_CONFIGURED';
  if (!process.env.AURION_PARITY_NATIVE_CDP_URL) throw Error(failure);
  nativeBrowser = await chromium.connectOverCDP(localCdp(process.env.AURION_PARITY_NATIVE_CDP_URL), { timeout: 10_000 });
  const nativeContext = nativeBrowser.contexts()[0];
  if (!nativeContext) throw Error(failure);
  // Aurion intentionally permits one active game transport per player. Verify
  // two real accounts before either capture login can evict the other client.
  const webUser = await rpc('auth.me', null, {request:context.request, nullable:true});
  const nativeUser = await rpc('auth.me', null, {request:nativeContext.request, nullable:true});
  assertDistinctCaptureUsers(webUser,nativeUser);
  index.identities = {distinct:true};
  page = await context.newPage();
  // A one-use page-local handoff survives the normal / -> /play SPA navigation.
  // It conveys capture configuration only, never authentication or world state.
  await page.addInitScript(nonce => { window.__aurionStartupCaptureHandoff = { nonce, documentId: crypto.randomUUID() }; }, nonce);
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${origin}/?aurionParity=${nonce}`, { waitUntil: 'domcontentloaded' });
  failure = 'BROWSER_GAMEPLAY_NOT_STARTED';
  const launch = page.getByRole('button', { name: 'SPIEL BETRETEN', exact: true });
  await waitFor(async () => {
    if (await page.evaluate(() => Boolean(window.__aurionStartupCapture))) return true;
    if (await launch.isVisible()) { await launch.click(); return true; }
    return false;
  }, failure);
  await waitFor(() => page.evaluate(() => (window.__aurionStartupCapture?.state().tick ?? 0) > 0), 'BROWSER_AUTH_OR_WORLD_NOT_READY', 45_000);
  const documentId = await page.evaluate(() => window.__aurionStartupCapture.state().documentId);
  const viewport = await page.evaluate(() => window.__aurionStartupCapture.state().viewportPx);
  if (!viewport || viewport.some(n => !Number.isInteger(n) || n < 240 || n > 4096)) throw Error('BROWSER_VIEWPORT_INVALID');
  const binary = process.env.AURION_GODOT_EXECUTABLE;
  if (!binary || !binary.startsWith('/') || !(await stat(binary)).isFile()) throw Error('GODOT_EXECUTABLE_NOT_CONFIGURED');
  const lock = await json(resolve('config/godot-toolchain.lock.json'));
  index.editorBinary = await verifyEditorExecutable(binary,lock.engine);
  index.editorVersion = execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 10_000 }).trim();
  if (index.editorVersion !== lock.engine.version) throw Error('GODOT_VERSION_MISMATCH');
  if (!process.env.DISPLAY) throw Error('GODOT_DISPLAY_NOT_CONFIGURED');
  failure = 'GODOT_EDITOR_START_FAILED';
  const project = await prepareCaptureProject(resolve('godot-client'), join(privateDir, 'project'));
  // A fresh actual editor launches the actual authoring scene via EditorInterface.
  // Use a separate editor process. Never restart or kill the user's editor.
  editor = spawn(binary, ['--editor', '--path', project, '--resolution', viewport.join('x')], {
    detached: true, stdio: 'ignore', env: { ...process.env, AURION_PARITY_PRIVATE_DIR: privateDir, AURION_PARITY_NONCE: nonce, AURION_PARITY_VIEWPORT: viewport.join('x') },
  });
  let spawnFailed = false;
  editor.on('error', () => { spawnFailed = true; });
  index.editor = await waitFor(async () => {
    if (spawnFailed || editor.exitCode !== null) throw Error('GODOT_EDITOR_EXITED');
    return await maybeJson('editor-start.json');
  }, 'GODOT_EDITOR_PLUGIN_NOT_STARTED', 90_000);
  if (index.editor.pid !== editor.pid || index.editor.nonce !== nonce || index.editor.editor !== true || index.editor.scene !== 'res://addons/aurion_bridge/authoring_entry.tscn') throw Error('EDITOR_LAUNCH_UNVERIFIED');
  failure = 'NATIVE_AUTH_HANDOFF_MISSING';
  const handoff = await waitFor(() => maybeJson('login.json'), failure);
  if (!/^https:\/\/arelogic\.space\/api\/native-auth\/browser\/[A-Za-z0-9_-]{32,128}$/.test(handoff.url)) throw Error('NATIVE_AUTH_URL_INVALID');
  authPage = await nativeContext.newPage();
  let callback;
  await authPage.route(`${origin}/app/auth/callback?**`, async route => {
    callback = route.request().url();
    await route.fulfill({ status: 200, contentType: 'text/plain', body: 'Rückgabe an den Godot-Client.' });
  });
  await authPage.goto(handoff.url, { waitUntil: 'domcontentloaded' });
  failure = 'NATIVE_AUTH_CONFIRMATION_UNAVAILABLE';
  await authPage.getByRole('button', { name: 'Diese Anmeldung einmalig bestätigen', exact: true }).click();
  await waitFor(() => callback, 'NATIVE_AUTH_CALLBACK_MISSING', 10_000);
  await atomic('callback.json', { url: callback });
  callback = undefined;
  await authPage.close(); authPage = null;
  await page.bringToFront();
  failure = 'GODOT_AUTH_OR_WORLD_NOT_READY';
  const native = await waitFor(async () => {
    const state = await maybeJson('godot-state.json');
    if (state?.failure) throw Error(state.failure);
    return state?.connected && state.worldVisible && state.terrain > 0 && state.tick > 0 ? state : null;
  }, failure, 45_000);
  await waitFor(() => page.evaluate(() => Boolean(window.__aurionStartupCapture) && !document.querySelector('[data-testid="world-loading-screen"]')), 'BROWSER_WORLD_OBSCURED_BY_LOADING_SCREEN', 30_000);
  // One shared lower bound, then the first actually published/rendered tick in
  // each client. Idle ticks need not be broadcast. No later-frame retry.
  const web = await page.evaluate(() => window.__aurionStartupCapture.state());
  const minimumTick = Math.max(web.tick, native.tick) + 20;
  index.minimumTick = minimumTick;
  await page.evaluate(tick => window.__aurionStartupCapture.arm(tick), minimumTick);
  await atomic('arm.json', { nonce, tick:minimumTick });
  failure = 'PAIRED_FRAME_TIMEOUT';
  const [webFrame, nativeFrame] = await Promise.all([
    waitFor(async () => {
      const state = await page.evaluate(() => window.__aurionStartupCapture.state());
      if (state.failure) throw Error(state.failure);
      return await page.evaluate(() => window.__aurionStartupCapture.result());
    }, failure, 15_000),
    waitFor(async () => {
      const state = await maybeJson('godot-state.json');
      if (state?.failure) throw Error(state.failure);
      return await maybeJson('godot-observation.json');
    }, failure, 15_000),
  ]);
  if (nativeFrame.pid !== native.pid || nativeFrame.pid === editor.pid) throw Error('EDITOR_GAME_PROCESS_UNVERIFIED');
  if (webFrame.documentId !== documentId) throw Error('BROWSER_DOCUMENT_RESTARTED');
  if (webFrame.selfEntityId !== 'player:' + webUser.id || nativeFrame.selfEntityId !== 'player:' + nativeUser.id) throw Error('CAPTURE_IDENTITIES_CHANGED');
  const webSubject = webFrame.snapshot.presences.find(p=>p.entityId === webFrame.selfEntityId);
  const nativeSubject = nativeFrame.snapshot.presences.find(p=>p.entityId === nativeFrame.selfEntityId);
  index.identities.subjectsAtSamePosition = Boolean(webSubject && nativeSubject && webSubject.position.x === nativeSubject.position.x && webSubject.position.z === nativeSubject.position.z);
  const tick = webFrame.snapshot.tick;
  index.targetTick = tick;
  if (!Number.isSafeInteger(nativeFrame.pid) || nativeFrame.pid < 1) throw Error('EDITOR_GAME_PROCESS_UNVERIFIED');
  const processStatus = await readFile(`/proc/${nativeFrame.pid}/status`, 'utf8');
  index.editorGameParentPid = Number(processStatus.match(/^PPid:\s+(\d+)$/m)?.[1]);
  if (index.editorGameParentPid !== editor.pid) throw Error('EDITOR_GAME_PROCESS_UNVERIFIED');
  if (!webFrame.png?.startsWith('data:image/png;base64,') || webFrame.png.length > 32_000_000) throw Error('BROWSER_PNG_INVALID');
  const webPng = Buffer.from(webFrame.png.slice('data:image/png;base64,'.length), 'base64');
  delete webFrame.png;
  await publish('aurion.png', webPng);
  await publish('godot.png', await readFile(join(privateDir, 'godot.png')));
  await publish('aurion-observation.json', Buffer.from(JSON.stringify(publicObservation(webFrame, privateRunKey))));
  await publish('godot-observation.json', Buffer.from(JSON.stringify(publicObservation(nativeFrame, privateRunKey))));
  failure = 'CANONICAL_RECEIPT_READBACK_FAILED';
  const zoneId = webFrame.snapshot.zoneId;
  const recorded = await awaitDurableTick(() => rpc('causality.getRecordedTick', { zoneId, tick }, {nullable:true}), tick);
  const oracle = await rpc('causality.oracleRange', { zoneId, fromTick: tick, toTick: tick });
  // Keep only the independent receipt/evidence, never full player/account state.
  index.receipt = Object.fromEntries(['worldId','zoneId','tick','sourceRevision','receiptHash','postStateHash'].map(k => [k, recorded.receipt?.[k]]));
  index.oracle = Object.fromEntries(['status','zoneId','sourceRevision','requestedRange','terminalReceiptHash','finalStateHash'].map(k => [k, oracle[k]]));
  const after = await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(10_000) });
  index.runtimeAfter = runtimeIdentity(await after.json());
  if (!after.ok()) throw Error('LIVE_HEALTH_AFTER_CAPTURE_FAILED');
  index.status = 'CAPTURED';
} catch (error) {
  // Error messages may include URLs/callbacks. Only bounded symbolic codes leave
  // this process; private auth files and browser traces are never uploaded.
  index.issues.push(/^[A-Z][A-Z0-9_]{3,100}$/.test(error.message || '') ? error.message : failure);
} finally {
  await authPage?.close().catch(() => {});
  await page?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await nativeBrowser?.close().catch(() => {});
  if (editor?.pid) {
    try { process.kill(-editor.pid, 'SIGTERM'); } catch {}
    const deadline = Date.now() + 5000;
    while (editor.exitCode === null && editor.signalCode === null && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    // Children may outlive their editor; terminate only the group we created.
    try { process.kill(-editor.pid, 'SIGKILL'); } catch {}
  }
  await rm(privateDir, { recursive: true, force: true });
  index.finishedAtUtc = new Date().toISOString();
  await writeFile(join(output, 'capture-index.json'), JSON.stringify(index, null, 2));
  console.log(JSON.stringify({ status: index.status, issues: index.issues, output }));
  process.exitCode = index.status === 'CAPTURED' ? 0 : 1;
}
