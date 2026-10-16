import { describe, expect, it, vi } from "vitest";
import type WebSocket from "ws";
import { AurionTickRecorder } from "./causality/tickRecorder";
import { AuthoritativeMovementZone } from "./zoneRuntime";
import type { ZoneId } from "./zoneProtocol";

function socketStub() {
  return { readyState: 1, OPEN: 1, send: vi.fn(), close: vi.fn() } as unknown as WebSocket;
}

describe("canonical zone membership continuity", () => {
  it("keeps adjacent receipt state hashes continuous across join and leave", () => {
    const recorder = new AurionTickRecorder(20);
    const zone = new AuthoritativeMovementZone("observatory_threshold_membership_continuity" as ZoneId, recorder);

    zone.tick();
    const beforeJoin = zone.getLatestReceipt()!;
    const joined = zone.join({ userId: 743, socket: socketStub() });
    zone.tick();
    const joinTick = zone.getLatestReceipt()!;
    expect(joinTick.preStateHash).toBe(beforeJoin.postStateHash);
    expect(recorder.getEntry(zone.zoneId, joinTick.tick)?.intents?.some(intent => intent.type === "presence_join")).toBe(true);

    zone.leave(joined.connectionId);
    zone.tick();
    const leaveTick = zone.getLatestReceipt()!;
    expect(leaveTick.preStateHash).toBe(joinTick.postStateHash);
    expect(recorder.getEntry(zone.zoneId, leaveTick.tick)?.intents?.some(intent => intent.type === "presence_leave")).toBe(true);
  });
});
