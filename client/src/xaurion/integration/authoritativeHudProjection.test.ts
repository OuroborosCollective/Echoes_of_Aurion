import { describe, expect, it } from "vitest";
import { playerReadbackSchema, projectPlayerReadback, projectReadback, worldReadbackSchema } from "./authoritativeHudProjection";

export const confirmedPlayer = { profile: { userId: 7, level: 3, totalXp: 290, aurionPoints: 23, victories: 2, selectedClass: "warden" }, capabilities: { canChooseClass: false, classUnlockLevel: 36 }, weaponMasteries: [], inventory: [] };
describe("authoritative HUD readback", () => {
  it("keeps absence, empty inventory, transport failure and stale evidence distinct", () => {
    expect(projectPlayerReadback({}, 7)).toEqual({ state: "waiting" });
    expect(projectPlayerReadback({ isError: true }, 7)).toEqual({ state: "error" });
    expect(projectPlayerReadback({ data: confirmedPlayer }, 7)).toMatchObject({ state: "live", data: { inventory: [], profile: { aurionPoints: 23 } } });
    expect(projectPlayerReadback({ data: confirmedPlayer, isError: true }, 7).state).toBe("stale");
    expect(projectReadback(playerReadbackSchema, { data: confirmedPlayer }, value => value.inventory.length === 0).state).toBe("empty");
  });
  it("rejects cross-user cache data, invalid numeric fields and partial world evidence", () => {
    expect(projectPlayerReadback({ data: confirmedPlayer }, 8)).toEqual({ state: "error" });
    for (const level of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.1]) expect(projectPlayerReadback({ data: { ...confirmedPlayer, profile: { ...confirmedPlayer.profile, level } } }, 7)).toEqual({ state: "error" });
    expect(projectReadback(worldReadbackSchema, { data: { globalWorld: { epoch: 1, worldSeed: "world" } } })).toEqual({ state: "error" });
    expect(projectReadback(worldReadbackSchema, { data: { globalWorld: { epoch: 1, worldSeed: "world", deterministicHash: "fnv1a-1234abcd" } } }).data?.globalWorld.deterministicHash).toBe("fnv1a-1234abcd");
  });
});
