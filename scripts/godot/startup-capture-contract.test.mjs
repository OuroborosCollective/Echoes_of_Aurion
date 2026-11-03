import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareCaptureProject, publicObservation } from './startup-capture-contract.mjs';

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
    mobs:[{entityId:'mob:private',health:42}], combatants:[{entityId:'player:8675309',health:31}] },
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
  const raw = { snapshot: {tick:42,zoneId:'zone',snapshotSeq:1,connectionId:'private-peer',presences:[{entityId:'b'},{entityId:'a'}],mobs:[],combatants:[]} };
  const other = structuredClone(raw);other.snapshot.presences.reverse();other.snapshot.snapshotSeq=55;other.snapshot.connectionId='other-peer';
  assert.equal(publicObservation(raw, 'private key').snapshot.projectionDigest, publicObservation(other, 'private key').snapshot.projectionDigest);
});
