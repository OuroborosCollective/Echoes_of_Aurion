/** Strict production readback gate. No simulation, writes or fake data. */
import assert from 'node:assert/strict';
const base = process.env.AURION_HEALTH_URL ?? 'https://arelogic.space/healthz';
const result = await fetch(base, {signal:AbortSignal.timeout(10000),redirect:'error'});
assert.equal(result.status,200,'AURION_HEALTH_HTTP_FAILED');
const value=await result.json();
assert.equal(value.status,'ok','AURION_HEALTH_FAILED');
assert.equal(value.authority.tickHz,10,'AURION_TICK_RATE_DRIFT');
assert.equal(value.alwaysOnWorld?.status,'active','AURION_ALWAYS_ON_WORLD_NOT_ACTIVE');
assert.deepEqual(value.alwaysOnWorld.zoneIds,['observatory_threshold'],'AURION_ALWAYS_ON_ZONES_UNVERIFIED');
process.stdout.write(JSON.stringify({revision:value.revision,alwaysOnWorld:value.alwaysOnWorld,status:'READY',truthNotice:'Boot activation only; independent durable receipt and Godot viewport readback remain mandatory.'})+'\n');
