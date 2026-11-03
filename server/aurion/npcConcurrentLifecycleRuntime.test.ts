import { describe, expect, it } from "vitest";
import { deriveNpcInteractions } from "./npcConcurrentLifecycleRuntime";

describe("Aurion NPC interaction derivation", () => {
  it("applies caravan pressure only to NPCs at the hub the caravan arrived at", () => {
    const interactions = deriveNpcInteractions([
      { npcId: "npc-caravan", hubId: "observatory_threshold", action: "caravan", cycle: 2, caravanDestinationHubId: "cinder_vault" },
      { npcId: "npc-windhollow", hubId: "windhollow", action: "rest", cycle: 2, caravanDestinationHubId: null },
      { npcId: "npc-emberfall", hubId: "emberfall", action: "rest", cycle: 2, caravanDestinationHubId: null },
      { npcId: "npc-cinder", hubId: "cinder_vault", action: "rest", cycle: 2, caravanDestinationHubId: null },
    ]);
    expect(interactions.filter(i => i.kind === "caravan_pressure").map(i => [i.hubId, i.targetNpcId])).toEqual([
      ["cinder_vault", "npc-cinder"],
    ]);
  });

  it("applies no caravan pressure when the caravan did not arrive", () => {
    const interactions = deriveNpcInteractions([
      { npcId: "npc-caravan", hubId: "observatory_threshold", action: "caravan", cycle: 2, caravanDestinationHubId: null },
      { npcId: "npc-cinder", hubId: "cinder_vault", action: "rest", cycle: 2, caravanDestinationHubId: null },
    ]);
    expect(interactions.filter(i => i.kind === "caravan_pressure")).toEqual([]);
  });
});
