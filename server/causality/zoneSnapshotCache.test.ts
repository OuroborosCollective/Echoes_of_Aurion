import { describe, expect, it } from "vitest";
import type WebSocket from "ws";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { canonicalJson, canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { sortCanonicalZoneState } from "./zoneCanonicalState";

function zone() {
  const zone = new AuthoritativeMovementZone("observatory_threshold");
  zone.isReplay = true; // Execute real transitions without transport/persistence side effects.
  const welcome = zone.join({ userId: 808, socket: { readyState: 1, OPEN: 1, send() {}, close() {} } as unknown as WebSocket });
  return { zone, connectionId: welcome.connectionId };
}

describe("canonical snapshot cache value isolation", () => {
  it("invalidates after real quest transitions and keeps prior snapshots immutable by value", () => {
    const { zone: runtime, connectionId } = zone();
    const empty = runtime.getCanonicalZoneState();
    runtime.enqueueIntent({ type: "quest_accept", connectionId, entityId: "player:808", clientSeq: 1, arrivalSeq: 1, questId: "concord.gate-seal" });
    runtime.tick();
    const accepted = runtime.getCanonicalZoneState();
    expect(accepted.questSummaries).toEqual([{ userId: 808, questId: "concord.gate-seal", status: "accepted", updatedAtTick: 1 }]);
    const acceptedHash = canonicalSha256(accepted);
    runtime.enqueueIntent({ type: "quest_hand_in", connectionId, entityId: "player:808", clientSeq: 2, arrivalSeq: 2, questId: "concord.gate-seal" });
    runtime.tick();
    expect(runtime.getCanonicalZoneState().questSummaries[0]?.status).toBe("completed");
    expect(canonicalSha256(accepted)).toBe(acceptedHash);
    expect(empty.questSummaries).toEqual([]);
  });

  it("canonicalizes restored insertion order and isolates every returned snapshot", () => {
    const { zone: runtime } = zone();
    const state = runtime.getCanonicalZoneState();
    state.players[0]!.skillCooldowns = { z_skill: 8, a_skill: 3 };
    state.questSummaries = [
      { userId: 808, questId: "z-quest", status: "accepted", updatedAtTick: 0 },
      { userId: 808, questId: "a-quest", status: "completed", updatedAtTick: 0 },
    ];
    runtime.restoreFromCanonicalState(state);
    const expected = sortCanonicalZoneState(state);
    expect(canonicalJson(runtime.getCanonicalZoneState())).toBe(canonicalJson(expected));
    const returned = runtime.getCanonicalZoneState();
    returned.questSummaries[0]!.status = "accepted";
    returned.questSummaries.push({ userId: 999, questId: "injected", status: "accepted", updatedAtTick: 999 });
    returned.players[0]!.skillCooldowns.a_skill = 999;
    expect(canonicalJson(runtime.getCanonicalZoneState())).toBe(canonicalJson(expected));
    state.questSummaries = [];
    runtime.restoreFromCanonicalState(state);
    expect(runtime.getCanonicalZoneState().questSummaries).toEqual([]);
  });
});
