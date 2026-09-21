import { describe, it, expect, beforeEach } from "vitest";
import { SocialRelationshipService } from "./socialRelationshipService";
import { SocialConsequenceSimulation } from "./socialConsequenceSimulation";

describe("SocialConsequenceSimulation", () => {
  let socialService: SocialRelationshipService;
  let simulation: SocialConsequenceSimulation;

  beforeEach(() => {
    socialService = new SocialRelationshipService();
    simulation = new SocialConsequenceSimulation(socialService);
  });

  it("produces deterministic social consequences and relation mutations from world evidence", async () => {
    const outcome = await simulation.simulateConsequences(
      {
        signalId: "sig_warfront_mine_capture",
        worldId: "world-society",
        epoch: 200,
        type: "WARFRONT_CAPTURE",
        subjectPoiOrFactionId: "faction:iron-vanguard",
        severity: 4,
        sourceReceiptHash: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
        worldRootHash: "sha256:8888888888888888888888888888888888888888888888888888888888888888",
      },
      [
        {
          npcId: "npc:loyalist_garrick",
          faction: "faction:iron-vanguard",
          profession: "guard",
          currentTrustInFaction: 40,
        },
        {
          npcId: "npc:rebel_selene",
          faction: "faction:solar-dawn",
          profession: "ranger",
          currentTrustInFaction: 20,
        },
      ]
    );

    expect(outcome.epoch).toBe(200);
    expect(outcome.affectedNpcIds).toEqual(["npc:loyalist_garrick", "npc:rebel_selene"]);
    expect(outcome.relationMutations.length).toBe(2);

    // Loyalist gained trust (+20 -> 60) => loyalty
    const loyalistRel = outcome.relationMutations.find(r => r.subjectNpcId === "npc:loyalist_garrick");
    expect(loyalistRel?.relationType).toBe("loyalty");
    expect(loyalistRel?.strength).toBe(60);

    // Opponent lost trust (-20 -> 0) => loyalty or rivalry
    const rebelRel = outcome.relationMutations.find(r => r.subjectNpcId === "npc:rebel_selene");
    expect(rebelRel?.strength).toBe(0);

    // Consequence receipt hash is deterministic
    expect(outcome.consequenceReceiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
