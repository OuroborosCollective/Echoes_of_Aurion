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
    for (let i = 0; i < 20; i++) await lifecycle.refresh({ x: i, z: 0 });
    const close = lifecycle.close(); expect(lifecycle.close()).toBe(close); expect(release).not.toHaveBeenCalled();
    finish(); await write; await close; await lifecycle.refresh({ x: 999, z: 0 });
    expect(upsert).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1); expect(effects).toEqual(["write", "release"]);
  });
  it("still releases after a failed write and ignores new writes after close", async () => {
    const upsert = vi.fn(async () => { throw new Error("isolated failure"); }); const release = vi.fn(async () => undefined);
    const lifecycle = new ZonePresenceLifecycle({ upsert, release }, { userId: 1, connectionId: "zone_peer_fixture", zoneId: "observatory_threshold" });
    await expect(lifecycle.refresh({ x: 0, z: 0 })).rejects.toThrow("isolated failure"); await lifecycle.close(); await lifecycle.refresh({ x: 1, z: 0 });
    expect(upsert).toHaveBeenCalledTimes(1); expect(release).toHaveBeenCalledTimes(1);
  });
});
