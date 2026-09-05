import { describe, expect, it } from "vitest";
import { ownedGuildGovernance } from "../shared/guildGovernanceView";

const territory = { territoryId: "world:0:0", worldId: "world", chunkX: 0, chunkZ: 0, guildId: "guild_1", state: "active" };
const view = { guildId: "guild_1", actorUserId: 7, role: "founder", revisionExact: "9007199254740993", kingdom: null, territories: [territory], grants: [] };
describe("owned guild governance projection", () => {
  it("preserves exact revisions and requires explicit empty kingdom state", () => {
    expect(ownedGuildGovernance(view, 7, "guild_1").revisionExact).toBe("9007199254740993");
    expect(() => ownedGuildGovernance({ ...view, kingdom: undefined }, 7, "guild_1")).toThrow();
  });
  it("rejects foreign actors, guilds and territory ownership", () => {
    expect(() => ownedGuildGovernance(view, 8, "guild_1")).toThrow("GOVERNANCE_OWNER_MISMATCH");
    expect(() => ownedGuildGovernance(view, 7, "guild_2")).toThrow("GOVERNANCE_OWNER_MISMATCH");
    expect(() => ownedGuildGovernance({ ...view, territories: [{ ...territory, guildId: "guild_2" }] }, 7, "guild_1")).toThrow();
  });
  it("rejects duplicates, released territory, malformed coordinates and oversized lists", () => {
    for (const territories of [[territory, territory], [{ ...territory, state: "released" }], [{ ...territory, chunkX: 0.5 }], Array(1001).fill(territory)])
      expect(() => ownedGuildGovernance({ ...view, territories }, 7, "guild_1")).toThrow();
  });
});
