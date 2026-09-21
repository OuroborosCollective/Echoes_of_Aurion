import { describe, it, expect, beforeEach } from "vitest";
import { SocialRelationshipService } from "./socialRelationshipService";
import { InstitutionService } from "./institutionService";
import { CollectiveDecisionGateway } from "./collectiveDecisionGateway";
import { SocialConsequenceSimulation } from "./socialConsequenceSimulation";
import { createInstitution } from "../../shared/aurionInstitutionContract";

describe("Aurion Society & Social Consequence Simulation (Steps 38-40)", () => {
  let socialService: SocialRelationshipService;
  let instService: InstitutionService;
  let decisionGateway: CollectiveDecisionGateway;
  let sim: SocialConsequenceSimulation;

  const WORLD_ID = "echoes-of-aurion-global";
  const ROOT_HASH = "sha256:world_root_society_test_99999999";

  beforeEach(() => {
    socialService = new SocialRelationshipService();
    instService = new InstitutionService();
    decisionGateway = new CollectiveDecisionGateway(instService);
    sim = new SocialConsequenceSimulation(socialService);
  });

  it("Step 38 & 39: Institutional collective proposal ratification under strict quorum rules", async () => {
    // Found Blacksmith Guild
    const guild = createInstitution({
      institutionId: "inst_blacksmith_guild",
      worldId: WORLD_ID,
      name: "Aurion Blacksmith Association",
      institutionType: "craft_guild",
      regionId: "region_ember_valley",
      members: [
        { npcId: "npc_boris", role: "leader", joinedEpoch: 1, standing: 100 },
        { npcId: "npc_thorin", role: "officer", joinedEpoch: 10, standing: 80 },
        { npcId: "npc_elena", role: "member", joinedEpoch: 20, standing: 50 },
      ],
      foundedEpoch: 1,
      sourceReceiptHash: "sha256:r_found_guild_1",
      sourceWorldRoot: ROOT_HASH,
    });

    await instService.registerInstitution(guild);

    // Boris proposes price increase due to iron shortage
    const proposal = {
      proposalId: "prop_iron_tax",
      institutionId: "inst_blacksmith_guild",
      proposerNpcId: "npc_boris",
      proposedAction: "INCREASE_PRICES",
      parameters: { deltaPercent: 20 },
      targetEpoch: 100,
      votesFor: ["npc_boris", "npc_thorin"],
      votesAgainst: ["npc_elena"],
      status: "PROPOSED" as const,
    };

    const evalResult = await decisionGateway.evaluateProposal(proposal, 100);
    expect(evalResult.ratified).toBe(true);
    expect(evalResult.status).toBe("RATIFIED");
    expect(evalResult.quorumReached).toBe(true);
    expect(evalResult.resultingReceiptHash).toBeDefined();
  });

  it("Step 40: Deterministic Social Consequence Simulation & Replay Invariance", async () => {
    const npcs = [
      { npcId: "npc_lyra", faction: "faction_valkyr", profession: "blacksmith", currentTrustInFaction: 50 },
      { npcId: "npc_morris", faction: "faction_silver", profession: "guard", currentTrustInFaction: 20 },
    ];

    const signal = {
      signalId: "sig_warfront_100",
      worldId: WORLD_ID,
      epoch: 100,
      type: "WARFRONT_CAPTURE" as const,
      subjectPoiOrFactionId: "faction_valkyr",
      severity: 8,
      sourceReceiptHash: "sha256:r_warfront_100",
      worldRootHash: ROOT_HASH,
    };

    // Run 1
    const outcome1 = await sim.simulateConsequences(signal, npcs);
    expect(outcome1.affectedNpcIds.length).toBe(2);
    expect(outcome1.relationMutations.length).toBe(2);

    // Lyra (Valkyr aligned) gained loyalty: 50 + (8 * 5) = 90
    const lyraRel = await socialService.getRelationBetween(WORLD_ID, "npc_lyra", "faction_valkyr", 100);
    expect(lyraRel?.relationType).toBe("loyalty");
    expect(lyraRel?.strength).toBe(90);

    // Run 2 Replay from clean state
    const cleanSocialService = new SocialRelationshipService();
    const cleanSim = new SocialConsequenceSimulation(cleanSocialService);
    const outcome2 = await cleanSim.simulateConsequences(signal, npcs);

    // Prove exact replay determinism
    expect(outcome1.consequenceReceiptHash).toBe(outcome2.consequenceReceiptHash);
  });
});
