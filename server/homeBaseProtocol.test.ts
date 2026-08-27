import { describe, expect, it } from "vitest";

import {
  AURION_HOME_BASE_ENTRY_POINT_ID,
  AURION_HOME_BASE_ROOM_ID,
  AURION_HOME_BASE_ZONE_ID,
  createHomeBaseSnapshot,
  homeBaseServices,
  resolveHomeBaseAction,
} from "./homeBaseProtocol";

describe("homeBaseProtocol", () => {
  it("creates a deterministic personal tower home with all user services", () => {
    const input = { playerId: "player_a", resolutionIndex: 12, placedItemCount: 3, visitorIds: ["visitor_b", "visitor_a", "visitor_b"] };
    const first = createHomeBaseSnapshot(input);
    const replay = createHomeBaseSnapshot({ ...input, visitorIds: ["visitor_b", "visitor_a", "visitor_b"] });

    expect(first).toEqual(replay);
    expect(first.instanceId).toBe("home:player_a");
    expect(first.zoneId).toBe(AURION_HOME_BASE_ZONE_ID);
    expect(first.entryPointId).toBe(AURION_HOME_BASE_ENTRY_POINT_ID);
    expect(first.roomId).toBe(AURION_HOME_BASE_ROOM_ID);
    expect(first.services).toEqual(homeBaseServices);
    expect(first.visitorIds).toEqual(["visitor_a", "visitor_b"]);
    expect(first.deterministicHash).toHaveLength(64);
  });

  it("accepts only declared home services and preserves the confirmed snapshot", () => {
    const result = resolveHomeBaseAction({ playerId: "player_a", resolutionIndex: 12, service: "storage", placedItemCount: 2 });
    expect(result).toMatchObject({ ok: true, service: "storage", snapshot: { zoneId: AURION_HOME_BASE_ZONE_ID, placedItemCount: 2 } });
    expect(resolveHomeBaseAction({ playerId: "player_a", resolutionIndex: 12, service: "delete_world" })).toMatchObject({ ok: false, code: "unsupported_service" });
  });

  it("rejects unsafe identity and invalid resolution before any home action", () => {
    expect(() => createHomeBaseSnapshot({ playerId: "player/a", resolutionIndex: 1 })).toThrow();
    expect(resolveHomeBaseAction({ playerId: "player/a", resolutionIndex: 1, service: "rest" })).toMatchObject({ ok: false, code: "invalid_player", snapshot: null });
    expect(resolveHomeBaseAction({ playerId: "player_a", resolutionIndex: -1, service: "rest" })).toMatchObject({ ok: false, code: "invalid_resolution", snapshot: null });
  });
});
