import { describe, expect, it } from "vitest";
import { resolveConfirmedNpcRoster } from "./confirmedNpcRoster";

const localCandidates = [
  { id: "lyra", name: "Local Lyra", title: "Local title", x: 6, quests: [{ id: "local-quest" }] },
  { id: "orun", name: "Local Orun", title: "Local title", x: 42, quests: [] },
  { id: "politics_envoy_region_1", name: "Local envoy", title: "Local title", x: 80, quests: [{ id: "local-politics-quest" }] },
];

describe("confirmed NPC roster projection", () => {
  it("fails closed when the authenticated readback is missing or empty", () => {
    for (const readback of [undefined, null, []] as const) {
      const result = resolveConfirmedNpcRoster(localCandidates, readback);
      expect(result.npcs).toEqual([]);
      expect([...result.ids]).toEqual([]);
    }
  });

  it("projects only readback identities and never carries local quest state", () => {
    const result = resolveConfirmedNpcRoster(localCandidates, [
      { id: "lyra", displayName: "Lyra from Aurion", role: "Confirmed observatory keeper" },
      { id: "unseeded_server_id", displayName: "Server-only actor", role: "Confirmed actor" },
    ]);

    expect(result.npcs).toEqual([
      { ...localCandidates[0], name: "Lyra from Aurion", title: "Confirmed observatory keeper", quests: [] },
    ]);
    expect([...result.ids]).toEqual(["lyra"]);
    expect(result.ids.has("politics_envoy_region_1")).toBe(false);
    expect(result.ids.has("unseeded_server_id")).toBe(false);
  });

  it("rejects conflicting duplicate identity readbacks", () => {
    const result = resolveConfirmedNpcRoster(localCandidates, [
      { id: "lyra", displayName: "Lyra A", role: "Keeper" },
      { id: "lyra", displayName: "Lyra B", role: "Keeper" },
    ]);

    expect(result.npcs).toEqual([]);
    expect(result.ids.has("lyra")).toBe(false);
  });
});
