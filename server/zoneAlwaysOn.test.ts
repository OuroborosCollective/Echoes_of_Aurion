import { createServer } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerZoneGateway } from './zoneGateway';
import { AuthoritativeMovementZone, ZoneRegistry } from './zoneRuntime';
import { AurionTickRecorder } from './causality/tickRecorder';
import { ZoneJoinHealthMonitor } from './zoneJoinHealth';

type Runtime = Awaited<ReturnType<typeof start>>;
async function start(recover: (zoneId: 'observatory_threshold') => Promise<AuthoritativeMovementZone>) {
  const server = createServer();
  const registry = new ZoneRegistry();
  const health = new ZoneJoinHealthMonitor(() => undefined, () => undefined);
  const gateway = registerZoneGateway(server, registry, async () => undefined, undefined, undefined, recover, undefined, health, {shutdownSettlementWaitMs:500});
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  return {server, registry, gateway, health};
}

describe('always-on server-owned zone cold start', () => {
  const instances: Runtime[] = [];
  afterEach(async () => {
    for (const instance of instances.splice(0)) {
      await instance.gateway.close();
      await new Promise<void>(resolve => instance.server.close(() => resolve()));
    }
    vi.restoreAllMocks();
  });

  it('recovers a previously dormant authoritative zone with zero players and commits a real tick', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const recorder = new AurionTickRecorder();
    const recover = vi.fn(async (zoneId: 'observatory_threshold') => new AuthoritativeMovementZone(zoneId, recorder));
    const runtime = await start(recover);
    instances.push(runtime);
    expect(runtime.registry.find('observatory_threshold')).toBeUndefined();
    const result = await runtime.gateway.activatePersistentZonesAtBoot(['observatory_threshold']);
    expect(result).toMatchObject({status:'active',zoneIds:['observatory_threshold'],code:null});
    expect(runtime.health.readback().bootSettlement).toBe('settled');
    const zone = runtime.registry.find('observatory_threshold');
    expect(zone).toBeDefined();
    expect(zone?.getCanonicalZoneState().players).toEqual([]);
    runtime.registry.tick();
    const receipt = zone!.getLatestReceipt();
    expect(receipt?.tick).toBe(1);
    expect(recorder.getEntry('observatory_threshold', 1)?.receipt.receiptHash).toBe(receipt?.receiptHash);
    expect(runtime.gateway.readbackAlwaysOn()).toMatchObject({status:'active',zoneIds:['observatory_threshold']});
  });

  it('never activates an unverified persisted zone after boot settlement fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const runtime=await start(async()=>{throw new Error('ZONE_CHECKPOINT_INVALID')});
    instances.push(runtime);
    const result=await runtime.gateway.activatePersistentZonesAtBoot(['observatory_threshold']);
    expect(result).toMatchObject({status:'failed',code:'ZONE_CHECKPOINT_INVALID'});
    expect(runtime.registry.find('observatory_threshold')).toBeUndefined();
    expect(runtime.health.readback().bootSettlement).toBe('failed');
  });

  it('does not start a recovered zone until slow boot settlement has completed', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const recorder = new AurionTickRecorder();
    let resume!: () => void;
    const gate = new Promise<void>(resolve => {resume = resolve});
    let recovered = 0;
    const runtime=await start(async zoneId=>{recovered++;await gate;return new AuthoritativeMovementZone(zoneId,recorder)});
    instances.push(runtime);
    const pending=runtime.gateway.activatePersistentZonesAtBoot(['observatory_threshold']);
    await new Promise(resolve => setImmediate(resolve));
    expect(runtime.registry.find('observatory_threshold')).toBeUndefined();
    expect(runtime.gateway.readbackAlwaysOn().status).toBe('pending');
    resume();
    await pending;
    expect(recovered).toBe(2); // settle, then re-verify the durable head for activation.
    expect(runtime.registry.find('observatory_threshold')).toBeDefined();
  });

  it('does not activate if shutdown begins while settlement is pending', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const recorder=new AurionTickRecorder();
    let resume!: () => void;
    const gate=new Promise<void>(resolve => {resume=resolve});
    const runtime=await start(async zoneId=>{await gate;return new AuthoritativeMovementZone(zoneId,recorder)});
    instances.push(runtime);
    const running=runtime.gateway.activatePersistentZonesAtBoot(['observatory_threshold']);
    const stopped=runtime.gateway.close();
    resume();
    await Promise.all([running,stopped]);
    expect(runtime.registry.find('observatory_threshold')).toBeUndefined();
    expect(runtime.gateway.readbackAlwaysOn().status).toBe('stopped');
    instances.pop();
    await new Promise<void>(resolve=>runtime.server.close(()=>resolve()));
  });
});
