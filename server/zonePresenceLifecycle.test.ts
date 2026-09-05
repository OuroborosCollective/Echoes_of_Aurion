import { describe, expect, it, vi } from "vitest";
import { ZonePresenceLifecycle } from "./zonePresenceLifecycle";

describe("presence write lifecycle", () => {
  it("releases after an outstanding write, preventing a disconnected lease from reappearing", async () => {
    let finish!: () => void;
    const effects: string[] = [];
    const upsert = vi.fn(async () => { await new Promise<void>(resolve => { finish = resolve; }); effects.push("write"); });
    const release = vi.fn(async () => { effects.push("release"); });
    const lifecycle = new ZonePresenceLifecycle({ upsert, release }, { userId: 1, connectionId: "zone_peer_fixture", zoneId: "observatory_threshold" });
    const write = lifecycle.refresh({ x: 0, z: 0 }); await Promise.resolve();
    const queued = Array.from({length:20}, (_, i) => lifecycle.refresh({ x: i, z: 0 }));
    const close = lifecycle.close(); expect(lifecycle.close()).toBe(close); expect(release).not.toHaveBeenCalled();
    finish(); await write; await Promise.all(queued); await close; await lifecycle.refresh({ x: 999, z: 0 });
    expect(upsert).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1); expect(effects).toEqual(["write", "release"]);
  });
  it("persists a crossed chunk and first stationary tick immediately, without a heartbeat", async () => {
    const upsert=vi.fn(async () => undefined), release=vi.fn(async () => undefined);
    const lifecycle=new ZonePresenceLifecycle({upsert,release},{userId:1,connectionId:"zone_peer_fixture",zoneId:"observatory_threshold"});
    await lifecycle.refresh({x:0,z:-31960});
    await lifecycle.observe({x:0,z:-32300});
    expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({position:{x:0,z:-32300}}));
    await lifecycle.observe({x:0,z:-32640});expect(upsert).toHaveBeenCalledTimes(2);
    await lifecycle.observe({x:0,z:-32640});expect(upsert).toHaveBeenCalledTimes(3);
    await lifecycle.observe({x:0,z:-32640});expect(upsert).toHaveBeenCalledTimes(3);
  });
  it("coalesces a newer crossing behind an in-flight write instead of dropping it", async () => {
    let finish!:()=>void;
    const effects:unknown[]=[];
    const upsert=vi.fn(async (value:unknown)=>{effects.push(value);if(effects.length===1)await new Promise<void>(resolve=>{finish=resolve;});});
    const lifecycle=new ZonePresenceLifecycle({upsert,release:async()=>undefined},{userId:1,connectionId:"zone_peer_fixture",zoneId:"observatory_threshold"});
    const first=lifecycle.refresh({x:0,z:0});await Promise.resolve();
    const crossing=lifecycle.observe({x:0,z:-32300});
    const stopped=lifecycle.observe({x:0,z:-32300});
    expect(upsert).toHaveBeenCalledTimes(1);finish();await Promise.all([first,crossing,stopped]);
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({position:{x:0,z:-32300}}));
  });
  it("still releases after a failed write and ignores new writes after close", async () => {
    const upsert = vi.fn(async () => { throw new Error("isolated failure"); }); const release = vi.fn(async () => undefined);
    const lifecycle = new ZonePresenceLifecycle({ upsert, release }, { userId: 1, connectionId: "zone_peer_fixture", zoneId: "observatory_threshold" });
    await expect(lifecycle.refresh({ x: 0, z: 0 })).rejects.toThrow("isolated failure"); await lifecycle.close(); await lifecycle.refresh({ x: 1, z: 0 });
    expect(upsert).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1);
  });
});
