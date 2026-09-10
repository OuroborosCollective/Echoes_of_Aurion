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

  it("projects the real player.me envelope instead of rejecting unrelated server fields", () => {
    const response = { ...confirmedPlayer, guild: null, setBonuses: [] };
    // The internal DTO stays strict; only the explicit wire adapter accepts the envelope.
    expect(playerReadbackSchema.safeParse(response).success).toBe(false);
    expect(projectPlayerReadback({ data: response }, 7)).toEqual({ state: "live", data: confirmedPlayer });
    expect(projectPlayerReadback({ data: response, isStale: true }, 7)).toEqual({ state: "stale", data: confirmedPlayer });
    expect(projectPlayerReadback({ data: response, isError: true }, 7)).toEqual({ state: "stale", data: confirmedPlayer });
  });

  it("strips inventory database metadata without changing any HUD value or input object", () => {
    const item = { id: "owned-item-1", ownerUserId: 7, baseItemKey: "aurion_spear", quality: "magic", itemLevel: 1, affixes: [{ key: "keen", slot: "prefix", stats: { attack: 3 } }] };
    const storedItem = { ...item, sourceKind: "loot", status: "owned", lootReceiptId: "drop-1", craftingReceiptId: null, affixesJson: JSON.stringify(item.affixes), createdAt: new Date("2026-09-10T00:00:00Z") };
    const response = { ...confirmedPlayer, inventory: [storedItem], guild: { id: "guild-1" }, setBonuses: [] };
    const readback = projectPlayerReadback({ data: response }, 7);
    expect(readback).toEqual({ state: "live", data: { ...confirmedPlayer, inventory: [item] } });
    expect(playerReadbackSchema.safeParse(readback.data).success).toBe(true);
    expect(readback.data).not.toHaveProperty("guild");
    expect(readback.data?.inventory[0]).not.toHaveProperty("affixesJson");
    expect(response.inventory[0]).toBe(storedItem);
    expect(response.inventory[0].sourceKind).toBe("loot");
  });

  it("never lets wider response metadata relax owner, receipt, profile or numeric validation", () => {
    const response = { ...confirmedPlayer, guild: null, setBonuses: [] };
    const item = { id: "foreign-item", ownerUserId: 8, baseItemKey: "aurion_spear", quality: "normal", itemLevel: 1, affixes: [], status: "owned" };
    expect(projectPlayerReadback({ data: response }, 8)).toEqual({ state: "error" });
    expect(projectPlayerReadback({ data: { ...response, inventory: [item] } }, 7)).toEqual({ state: "error" });
    expect(projectPlayerReadback({ data: { ...response, profile: { ...response.profile, level: 99 } } }, 7)).toEqual({ state: "error" });
    expect(projectPlayerReadback({ data: { ...response, progression: { ...response.progression, tracks: [{ ...response.progression.tracks[0], receiptHash: "invalid" }] } } }, 7)).toEqual({ state: "error" });
    expect(projectPlayerReadback({ data: { ...response, inventory: [{ ...item, ownerUserId: 7, itemLevel: NaN }] } }, 7)).toEqual({ state: "error" });
    expect(projectPlayerReadback({ data: { ...response, inventory: [{ ...item, ownerUserId: 7, affixes: [{ key: "keen", slot: "prefix", stats: { attack: Infinity } }] }] } }, 7)).toEqual({ state: "error" });
    expect(projectPlayerReadback({ data: { ...response, health: 999 } }, 7)).toEqual({ state: "error" });
    expect(projectPlayerReadback({ data: { guild: null, setBonuses: [] } }, 7)).toEqual({ state: "error" });
  });
});
