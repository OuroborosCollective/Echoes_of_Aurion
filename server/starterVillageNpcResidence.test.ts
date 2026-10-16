import { describe, expect, it } from "vitest";
import { assertStarterVillageNpcResidence } from "./starterVillageNpcResidence";

describe("local starter NPC residence policy", () => {
  it.each(["lyra", "orun", "starter_village_north_gate_guard", "observatory_blacksmith"])("keeps %s available at its permanent home", npcId => {
    expect(() => assertStarterVillageNpcResidence(npcId, "observatory_threshold")).not.toThrow();
    expect(() => assertStarterVillageNpcResidence(npcId, "windhollow")).toThrow("STARTER_VILLAGE_ANCHOR_RESIDENCE_REQUIRED");
  });
  it("allows visitors to enter and leave without freezing outside NPCs", () => {
    for (const region of ["windhollow", "observatory_threshold", "emberfall"]) {
      expect(() => assertStarterVillageNpcResidence("visiting-merchant", region)).not.toThrow();
    }
  });
});
