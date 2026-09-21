import { describe, it, expect, beforeEach } from "vitest";
import { InstitutionService } from "./institutionService";
import { CollectiveDecisionGateway } from "./collectiveDecisionGateway";
import { createInstitution, createProposal } from "../../shared/aurionInstitutionContract";

describe("InstitutionService & CollectiveDecisionGateway", () => {
  let institutionService: InstitutionService;
  let decisionGateway: CollectiveDecisionGateway;

  beforeEach(() => {
    institutionService = new InstitutionService();
    decisionGateway = new CollectiveDecisionGateway(institutionService);
  });

  it("registers institutions and queries them deterministically", async () => {
    const inst = createInstitution({
      institutionId: "inst:blacksmiths-guild",
      worldId: "world-society",
      institutionType: "craft_guild",
      name: "Iron Hearth Blacksmiths",
      regionId: "region:valen",
      settlementId: "settlement:valen",
      members: [
        { npcId: "npc:blacksmith_thorin", role: "leader", joinedEpoch: 10, standing: 100 },
        { npcId: "npc:apprentice_leo", role: "apprentice", joinedEpoch: 20, standing: 50 },
      ],
      policies: {
        decisionRule: "MAJORITY",
        quorumPercentage: 50,
      },
      foundedEpoch: 10,
      sourceReceiptHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      sourceWorldRoot: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    });

    const reg = await institutionService.registerInstitution(inst);
    expect(reg.accepted).toBe(true);

    const fetched = await institutionService.getInstitution("inst:blacksmiths-guild");
    expect(fetched).not.toBeNull();
    expect(fetched?.name).toBe("Iron Hearth Blacksmiths");
    expect(fetched?.members.length).toBe(2);
  });

  it("evaluates collective proposal and ratifies when quorum and majority are met", async () => {
    const inst = createInstitution({
      institutionId: "inst:village-council",
      worldId: "world-society",
      institutionType: "village_council",
      name: "Valen Village Council",
      regionId: "region:valen",
      members: [
        { npcId: "npc:elder_alder", role: "leader", joinedEpoch: 1, standing: 100 },
        { npcId: "npc:farmer_giles", role: "member", joinedEpoch: 2, standing: 80 },
        { npcId: "npc:innkeeper_mira", role: "member", joinedEpoch: 3, standing: 70 },
      ],
      policies: {
        decisionRule: "MAJORITY",
        quorumPercentage: 50,
      },
      foundedEpoch: 1,
      sourceReceiptHash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
      sourceWorldRoot: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    });
    await institutionService.registerInstitution(inst);

    const proposal = createProposal({
      proposalId: "prop:ration-increase",
      institutionId: "inst:village-council",
      proposerNpcId: "npc:elder_alder",
      targetEpoch: 50,
      proposedAction: "INCREASE_WINTER_GRAIN_RESERVES",
      parameters: { taxAdjustmentBps: 200 },
      votesFor: ["npc:elder_alder", "npc:farmer_giles"],
      votesAgainst: ["npc:innkeeper_mira"],
    });

    const evaluation = await decisionGateway.evaluateProposal(proposal, 50);
    expect(evaluation.ratified).toBe(true);
    expect(evaluation.status).toBe("RATIFIED");
    expect(evaluation.votesForCount).toBe(2);
    expect(evaluation.votesAgainstCount).toBe(1);
    expect(evaluation.quorumReached).toBe(true);
    expect(evaluation.resultingReceiptHash).toBeDefined();
  });

  it("rejects proposal when proposer is not an institution member", async () => {
    const inst = createInstitution({
      institutionId: "inst:guard-unit",
      worldId: "world-society",
      institutionType: "guard_unit",
      name: "Valen Town Watch",
      regionId: "region:valen",
      members: [{ npcId: "npc:captain_varro", role: "leader", joinedEpoch: 1, standing: 100 }],
      policies: { decisionRule: "UNANIMOUS", quorumPercentage: 100 },
      foundedEpoch: 1,
      sourceReceiptHash: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
      sourceWorldRoot: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
    });
    await institutionService.registerInstitution(inst);

    const proposal = createProposal({
      proposalId: "prop:illegal",
      institutionId: "inst:guard-unit",
      proposerNpcId: "npc:intruder",
      targetEpoch: 60,
      proposedAction: "OPEN_GATES",
      parameters: {},
      votesFor: [],
      votesAgainst: [],
    });

    const evaluation = await decisionGateway.evaluateProposal(proposal, 60);
    expect(evaluation.ratified).toBe(false);
    expect(evaluation.status).toBe("REJECTED");
    expect(evaluation.reason).toBe("PROPOSER_NOT_A_MEMBER");
  });
});
