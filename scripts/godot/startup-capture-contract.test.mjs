import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { prepareCaptureProject, publicObservation, assertDistinctCaptureUsers, awaitDurableTick, verifyEditorExecutable } from './startup-capture-contract.mjs';

test('private capture copy enables the actual bridge without changing source settings or copying editor cache', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'aurion-capture-contract-'));
  try {
    const source = join(directory, 'source'), target = join(directory, 'target');
    await mkdir(join(source, '.godot'), { recursive: true });
    const settings = await readFile('godot-client/project.godot', 'utf8');
    await writeFile(join(source, 'project.godot'), settings);
    await writeFile(join(source, 'game.gd'), 'real source bytes');
    await writeFile(join(source, '.godot/cache'), 'old editor cache');
    await prepareCaptureProject(source, target);
    assert.equal(await readFile(join(source, 'project.godot'), 'utf8'), settings);
    assert.equal(await readFile(join(target, 'game.gd'), 'utf8'), 'real source bytes');
    assert.equal((await readFile(join(target, 'project.godot'), 'utf8')).replace(', "res://addons/aurion_bridge/plugin.cfg"', ''), settings);
    await assert.rejects(readFile(join(target, '.godot/cache')), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive:true, force:true }); }
});

test('public capture compares canonical payloads without exposing live player identifiers or combat records', () => {
  const raw = { source: 'aurion-web', snapshot: { tick:42, zoneId:'observatory_threshold',
    presences:[{entityId:'player:8675309',userId:8675309,position:{x:12345678,z:456}}],
    mobs:[{entityId:'mob:private',health:42}], combatants:[{entityId:'player:8675309',health:31}], resources:{contractVersion:1,revision:1,nodes:[]} },
    actors:[{entityId:'player:8675309',assetId:'glb_public',position:[12345678,0,456]}],
    player:{userId:8675309},npcs:{private:'not exported'} };
  const key = Buffer.alloc(32, 1);
  const a = publicObservation(raw, key);
  const output = JSON.stringify(a);
  assert.equal(output.includes('8675309'), false);
  assert.equal(output.includes('12345678'), false);
  assert.equal(output.includes('health'), false);
  assert.equal(output.includes('mob:private'), false);
  assert.deepEqual(a.actors, [{assetId:'glb_public'}]);
  assert.equal(a.snapshot.projectionDigest, publicObservation(structuredClone(raw), key).snapshot.projectionDigest);
  raw.snapshot.presences[0].position.x++;
  assert.notEqual(a.snapshot.projectionDigest, publicObservation(raw, key).snapshot.projectionDigest);
  assert.notEqual(publicObservation(raw, key).snapshot.projectionDigest, publicObservation(raw, Buffer.alloc(32,2)).snapshot.projectionDigest);
});

test('transport counters and ordering cannot manufacture a canonical difference', () => {
  const raw = { snapshot: {tick:42,zoneId:'zone',snapshotSeq:1,connectionId:'private-peer',presences:[{entityId:'b'},{entityId:'a'}],mobs:[],combatants:[],resources:{contractVersion:1,revision:1,nodes:[]}} };
  const other = structuredClone(raw);other.snapshot.presences.reverse();other.snapshot.snapshotSeq=55;other.snapshot.connectionId='other-peer';
  assert.equal(publicObservation(raw, 'private key').snapshot.projectionDigest, publicObservation(other, 'private key').snapshot.projectionDigest);
});

test('resource depletion differences participate in the private canonical comparison', () => {
  const raw = {snapshot:{tick:42,zoneId:'zone',presences:[],mobs:[],combatants:[],resources:{contractVersion:1,revision:2,nodes:[{nodeId:'copper',remaining:10}]}}};
  const before = publicObservation(raw, 'run key').snapshot.projectionDigest;
  raw.snapshot.resources.nodes[0].remaining--;
  assert.notEqual(publicObservation(raw, 'run key').snapshot.projectionDigest,before);
  delete raw.snapshot.resources;
  assert.throws(()=>publicObservation(raw, 'run key'),/CAPTURE_RESOURCES_INVALID/);
});

test('camera readback compares exact positions privately and exposes only the relative viewing offset', () => {
  const raw = {snapshot:{tick:42,zoneId:'zone',presences:[],mobs:[],combatants:[],resources:{revision:1,nodes:[]}},
    camera:{positionMm:[12345678,5000,87654321],targetMm:[12345678,1600,87644321],fovMilliDeg:58000,privateExtra:'never publish'}};
  const key = Buffer.alloc(32, 3);
  const before = publicObservation(raw, key).camera;
  assert.deepEqual(Object.keys(before).sort(), ['fovMilliDeg','offsetMm','positionDigest','targetDigest']);
  assert.deepEqual(before.offsetMm, [0,3400,10000]);
  assert.match(before.positionDigest, /^[a-f0-9]{64}$/);
  assert.match(before.targetDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(before, publicObservation(structuredClone(raw), key).camera);
  for (const privateValue of ['12345678','87654321','87644321','never publish','positionMm','targetMm']) {
    assert.equal(JSON.stringify(publicObservation(raw, key)).includes(privateValue), false);
  }
  // A common translation keeps the viewing offset but must still fail exact-camera equality.
  raw.camera.positionMm[0]++;
  raw.camera.targetMm[0]++;
  const translated = publicObservation(raw, key).camera;
  assert.deepEqual(before.offsetMm, translated.offsetMm);
  assert.notEqual(before.positionDigest, translated.positionDigest);
  assert.notEqual(before.targetDigest, translated.targetDigest);
  assert.notEqual(translated.positionDigest, publicObservation(raw, Buffer.alloc(32,4)).camera.positionDigest);
});

test('invalid camera coordinates cannot be converted to a valid public camera proof', () => {
  const raw = {snapshot:{tick:42,zoneId:'zone',presences:[],mobs:[],combatants:[],resources:{revision:1,nodes:[]}}};
  const camera = {positionMm:[0,5000,10000],targetMm:[0,1600,0],fovMilliDeg:58000};
  for (const invalid of [null, {}, {...camera,positionMm:[0,NaN,0]}, {...camera,targetMm:[0,0]},
    {...camera,positionMm:[0,10**10+1,0]}, {...camera,fovMilliDeg:0}]) {
    assert.throws(()=>publicObservation({...raw,camera:invalid}, 'private key'), /CAPTURE_CAMERA_INVALID/);
  }
});

test('same-account and missing sessions are rejected before native login can supersede the browser', () => {
  assert.throws(()=>assertDistinctCaptureUsers({id:1},{id:1}),/CAPTURE_IDENTITIES_SUPERSEDE/);
  for (const user of [null,{}, {id:0}, {id:1.5}]) assert.throws(()=>assertDistinctCaptureUsers({id:1},user),/CAPTURE_IDENTITIES_UNVERIFIED/);
  assert.doesNotThrow(()=>assertDistinctCaptureUsers({id:1},{id:2}));
});

test('durable readback waits only for the same missing receipt and bounds persistence delays', async () => {
  let time=0, reads=0;
  const clock={timeoutMs:20,pollMs:10,now:()=>time,sleep:async ms=>{time+=ms;}};
  const entry={receipt:{tick:42}};
  assert.equal(await awaitDurableTick(async()=>++reads<3?null:entry,42,clock),entry);
  assert.equal(reads,3);
  await assert.rejects(awaitDurableTick(async()=>null,42,clock),/CANONICAL_RECEIPT_PERSISTENCE_TIMEOUT/);
  await assert.rejects(awaitDurableTick(async()=>({receipt:{tick:43}}),42,clock),/CANONICAL_READBACK_INVALID/);
  reads=0;
  await assert.rejects(awaitDurableTick(async()=>{reads++;throw Error('UNAUTHORIZED');},42,clock),/UNAUTHORIZED/);
  assert.equal(reads,1);
});

test('a modified same-version executable or foreign bootstrap receipt cannot pass', async () => {
  const directory=await mkdtemp(join(tmpdir(),'aurion-editor-digest-'));
  try {
    await mkdir(join(directory,'editor'));
    const engine={file:'Godot',version:'synthetic-version',sha256:'b'.repeat(64)};
    const binary=join(directory,'editor',engine.file), bytes=Buffer.from('synthetic executable bytes');
    await writeFile(binary,bytes);
    const receipt={version:engine.version,archiveSha256:engine.sha256,binarySha256:createHash('sha256').update(bytes).digest('hex')};
    await writeFile(join(directory,'editor-receipt.json'),JSON.stringify(receipt));
    assert.deepEqual(await verifyEditorExecutable(binary,engine),receipt);
    await writeFile(binary,'changed executable, same claimed version');
    await assert.rejects(verifyEditorExecutable(binary,engine),/GODOT_EXECUTABLE_UNVERIFIED/);
    await writeFile(binary,bytes);
    await writeFile(join(directory,'editor-receipt.json'),JSON.stringify({...receipt,archiveSha256:'c'.repeat(64)}));
    await assert.rejects(verifyEditorExecutable(binary,engine),/GODOT_EXECUTABLE_UNVERIFIED/);
  } finally {await rm(directory,{recursive:true,force:true});}
});
