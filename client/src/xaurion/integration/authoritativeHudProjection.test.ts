import { describe, expect, it } from "vitest";
import { playerReadbackSchema, projectPlayerReadback, projectReadback, worldReadbackSchema } from "./authoritativeHudProjection";

export const confirmedPlayer = { profile: { userId: 7, aurionPoints: 23, victories: 2, selectedClass: "unbound" }, progression: { characterId: "char-7", tracks: [{ trackKind: "weapon", trackId: "greatsword.two_handed.v3", characterId: "char-7", levelExact: "9007199254740993", resultReceiptId: "result-00000001", sourceReceiptId: "source-00000001", receiptHash: "a".repeat(64) }] }, inventory: [] };
describe("authoritative HUD readback", () => {
  it("keeps absence, empty inventory, transport failure and stale evidence distinct", () => {
    expect(projectPlayerReadback({}, 7)).toEqual({ state: "waiting" });
    expect(projectPlayerReadback({ isError: true }, 7)).toEqual({ state: "error" });
    expect(projectPlayerReadback({ data: confirmedPlayer }, 7)).toMatchObject({ state: "live", data: { inventory: [], profile: { aurionPoints: 23 } } });
    expect(projectPlayerReadback({ data: confirmedPlayer, isError: true }, 7).state).toBe("stale");
    expect(projectReadback(playerReadbackSchema, { data: confirmedPlayer }, value => value.inventory.length === 0).state).toBe("empty");
  });
  it("rejects cross-user cache data, legacy class/aggregate fields, invalid current numerics and partial world evidence", () => {
    expect(projectPlayerReadback({ data: { ...confirmedPlayer, profile: { ...confirmedPlayer.profile, selectedClass: "warden" } } }, 7)).toEqual({ state: "error" });
    expect(projectPlayerReadback({ data: confirmedPlayer }, 8)).toEqual({ state: "error" });
    expect(projectPlayerReadback({ data: { ...confirmedPlayer, profile: { ...confirmedPlayer.profile, level: 3 } } }, 7)).toEqual({ state: "error" });
    expect(projectPlayerReadback({ data: { ...confirmedPlayer, profile: { ...confirmedPlayer.profile, totalXp: 290 } } }, 7)).toEqual({ state: "error" });
    for (const aurionPoints of [-1, Number.NaN, Number.POSITIVE_INFINITY, 1.1]) expect(projectPlayerReadback({ data: { ...confirmedPlayer, profile: { ...confirmedPlayer.profile, aurionPoints } } }, 7)).toEqual({ state: "error" });
    expect(projectReadback(worldReadbackSchema, { data: { globalWorld: { epoch: 1, worldSeed: "world" } } })).toEqual({ state: "error" });
    expect(projectReadback(worldReadbackSchema, { data: { globalWorld: { epoch: 1, worldSeed: "world", deterministicHash: "fnv1a-1234abcd" } } }).data?.globalWorld.deterministicHash).toBe("fnv1a-1234abcd");
  });
});
