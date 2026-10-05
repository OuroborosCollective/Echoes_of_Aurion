import { describe, expect, it } from "vitest";
import {
  communicateNpcInformation,
  createExperiencedNpcInformation,
  rememberNpcInformation,
  reconcileNpcInformationReports,
  type NpcInformationSource,
} from "./npcInformationEcologyProtocol";
import { projectRumorClaims, rumorClaimId } from "./rumorProjectionProtocol";
import {
  buildInvestigationGraph,
  deriveSourceClass,
  validateDeductionIntent,
  verifyInvestigationGraph,
} from "./investigationGraphProtocol";

const source: NpcInformationSource = {
  evidenceClass: "verified",
  sourceKind: "npc_decision_receipt",
  sourceReceiptId: "npc_decision_101",
  sourceRevision: "b".repeat(40),
  sourceSha256: "sha256:" + "c".repeat(64),
  sourceCausalRoot: "sha256:" + "d".repeat(64),
};

function claimForViewer(input: {
  subjectId: string;
  predicate: string;
  value: string;
  witnessNpcId: string;
  receiverId: string;
  logicalIndex: number;
  sourceKind?: NpcInformationSource["sourceKind"];
}) {
  const exp = createExperiencedNpcInformation({
    worldId: "world-1",
    witnessNpcId: input.witnessNpcId,
    subjectId: input.subjectId,
    predicate: input.predicate,
    value: input.value,
    logicalIndex: input.logicalIndex,
    expiresAtIndex: 1_000,
    source: {
      ...source,
      sourceKind: input.sourceKind ?? "npc_decision_receipt",
      sourceReceiptId: `${source.sourceReceiptId}:${input.predicate}:${input.witnessNpcId}`,
      sourceReceiptHash: "sha256:" + "a".repeat(64),
    },
  });
  const rem = rememberNpcInformation(exp, input.logicalIndex + 1);
  const told = communicateNpcInformation({
    source: rem,
    receiverNpcId: input.receiverId,
    logicalIndex: input.logicalIndex + 2,
  });
  return [exp, rem, told] as const;
}

function contradictedPair() {
  const leftChain = claimForViewer({
    subjectId: "caravan-7", predicate: "destroyed", value: "true",
    witnessNpcId: "npc-a", receiverId: "player-1", logicalIndex: 10,
  });
  const rightChain = claimForViewer({
    subjectId: "caravan-7", predicate: "destroyed", value: "false",
    witnessNpcId: "npc-b", receiverId: "player-1", logicalIndex: 20,
  });
  const reconciliation = reconcileNpcInformationReports({
    left: leftChain[2],
    right: rightChain[2],
    logicalIndex: 30,
  });
  return {
    receipts: [
      ...leftChain, ...rightChain,
      reconciliation.left, reconciliation.right,
    ],
    leftChain,
    rightChain,
  };
}

describe("AIM-782 causal investigation graph", () => {
  it("builds the same relation graph from the same claim graph, order-independent", () => {
    const { receipts } = contradictedPair();
    const first = buildInvestigationGraph({
      projection: projectRumorClaims({ viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts }),
    });
    const second = buildInvestigationGraph({
      projection: projectRumorClaims({
        viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts: [...receipts].reverse(),
      }),
    });
    expect(second.graphHash).toBe(first.graphHash);
    expect(second.nodes).toEqual(first.nodes);
    expect(second.relations).toEqual(first.relations);
    expect(first.relations.some(r => r.kind === "CONTRADICTS")).toBe(true);
    expect(first.sourceProjectionHash).toMatch(/^sha256:/);
  });

  it("derives source classes from the confirmed claim only", () => {
    const hearsay = claimForViewer({
      subjectId: "caravan-7", predicate: "destroyed", value: "true",
      witnessNpcId: "npc-a", receiverId: "player-1", logicalIndex: 10,
    });
    const projection = projectRumorClaims({
      viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts: hearsay,
    });
    expect(deriveSourceClass(projection.claims[0])).toBe("HEARSAY");

    const direct = projectRumorClaims({
      viewerId: "npc-a", worldId: "world-1", atIndex: 40, receipts: [hearsay[0], hearsay[1]],
    });
    expect(deriveSourceClass(direct.claims[0])).toBe("WITNESS");

    const worldChain = claimForViewer({
      subjectId: "region-9", predicate: "world_resolution", value: "raid",
      witnessNpcId: "npc-a", receiverId: "player-1", logicalIndex: 10,
      sourceKind: "world_receipt",
    });
    const worldProjection = projectRumorClaims({
      viewerId: "npc-a", worldId: "world-1", atIndex: 40, receipts: [worldChain[0], worldChain[1]],
    });
    expect(deriveSourceClass(worldProjection.claims[0])).toBe("WORLD_EVIDENCE");
  });

  it("creates REQUIRES edges from the versioned prerequisite table", () => {
    const smoke = claimForViewer({
      subjectId: "caravan-7", predicate: "saw_smoke", value: "true",
      witnessNpcId: "npc-a", receiverId: "player-1", logicalIndex: 10,
    });
    const destroyed = claimForViewer({
      subjectId: "caravan-7", predicate: "destroyed", value: "true",
      witnessNpcId: "npc-b", receiverId: "player-1", logicalIndex: 20,
    });
    const projection = projectRumorClaims({
      viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts: [...smoke, ...destroyed],
    });
    const smokeClaim = projection.claims.find(c => c.predicate === "saw_smoke")!;
    const destroyedClaim = projection.claims.find(c => c.predicate === "destroyed")!;
    const graph = buildInvestigationGraph({
      projection,
      prerequisites: { destroyed: ["saw_smoke"] },
    });
    expect(graph.relations).toContainEqual({
      kind: "REQUIRES",
      from: smokeClaim.claimId,
      to: destroyedClaim.claimId,
    });
  });

  it("validates an affirm deduction over corroborating claims deterministically", () => {
    const first = claimForViewer({
      subjectId: "caravan-7", predicate: "destroyed", value: "true",
      witnessNpcId: "npc-a", receiverId: "player-1", logicalIndex: 10,
    });
    const second = claimForViewer({
      subjectId: "caravan-7", predicate: "destroyed", value: "true",
      witnessNpcId: "npc-b", receiverId: "player-1", logicalIndex: 20,
    });
    const projection = projectRumorClaims({
      viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts: [...first, ...second],
    });
    const graph = buildInvestigationGraph({ projection });
    const receipt = validateDeductionIntent({
      intent: {
        actorId: "player-1",
        selectedClaimIds: projection.claims.map(c => c.claimId).reverse(),
        deductionType: "affirm",
        sourceProjectionHash: projection.projectionHash,
      },
      graph,
    });
    expect(receipt.result).toBe("validated");
    // Selection order does not change identity: canonical ordering applies.
    const replay = validateDeductionIntent({
      intent: {
        actorId: "player-1",
        selectedClaimIds: projection.claims.map(c => c.claimId),
        deductionType: "affirm",
        sourceProjectionHash: projection.projectionHash,
      },
      graph,
    });
    expect(replay).toEqual(receipt);
  });

  it("rejects stale projection revisions", () => {
    const { receipts } = contradictedPair();
    const projection = projectRumorClaims({ viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts });
    const graph = buildInvestigationGraph({ projection });
    expect(() => validateDeductionIntent({
      intent: {
        actorId: "player-1",
        selectedClaimIds: projection.claims.map(c => c.claimId),
        deductionType: "challenge",
        sourceProjectionHash: "sha256:" + "0".repeat(64),
      },
      graph,
    })).toThrow("DEDUCTION_STALE_PROJECTION");
  });

  it("rejects deduction actors that are not the projection viewer", () => {
    const { receipts } = contradictedPair();
    const projection = projectRumorClaims({ viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts });
    const graph = buildInvestigationGraph({ projection });
    expect(() => validateDeductionIntent({
      intent: {
        actorId: "player-2",
        selectedClaimIds: projection.claims.map(c => c.claimId),
        deductionType: "challenge",
        sourceProjectionHash: projection.projectionHash,
      },
      graph,
    })).toThrow("DEDUCTION_ACTOR_MISMATCH");
  });

  it("rejects references to hidden/private claims", () => {
    const { receipts } = contradictedPair();
    const projection = projectRumorClaims({ viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts });
    const graph = buildInvestigationGraph({ projection });
    // A private claim exists in the ecology but is hidden for this viewer.
    const privateExp = createExperiencedNpcInformation({
      worldId: "world-1",
      witnessNpcId: "npc-z",
      subjectId: "vault-3",
      predicate: "looted",
      value: "true",
      logicalIndex: 5,
      source: { ...source, sourceReceiptId: "npc_decision_private" },
    });
    const hiddenClaimId = rumorClaimId(privateExp.factId);
    const hiddenProjection = projectRumorClaims({
      viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts: [...receipts, privateExp],
    });
    expect(hiddenProjection.claims.some(c => c.claimId === hiddenClaimId)).toBe(false);
    expect(() => validateDeductionIntent({
      intent: {
        actorId: "player-1",
        selectedClaimIds: [projection.claims[0].claimId, hiddenClaimId],
        deductionType: "challenge",
        sourceProjectionHash: projection.projectionHash,
      },
      graph,
    })).toThrow("DEDUCTION_UNKNOWN_CLAIM");
  });

  it("rejects affirm over an unresolved contradiction and challenge without one", () => {
    const { receipts } = contradictedPair();
    const projection = projectRumorClaims({ viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts });
    const graph = buildInvestigationGraph({ projection });
    const selection = projection.claims.map(c => c.claimId);
    expect(() => validateDeductionIntent({
      intent: { actorId: "player-1", selectedClaimIds: selection, deductionType: "affirm", sourceProjectionHash: projection.projectionHash },
      graph,
    })).toThrow("DEDUCTION_CONTRADICTION_PRESENT");
    const challenge = validateDeductionIntent({
      intent: { actorId: "player-1", selectedClaimIds: selection, deductionType: "challenge", sourceProjectionHash: projection.projectionHash },
      graph,
    });
    expect(challenge.result).toBe("validated");

    const only = claimForViewer({
      subjectId: "caravan-7", predicate: "destroyed", value: "true",
      witnessNpcId: "npc-a", receiverId: "player-1", logicalIndex: 10,
    });
    const second = claimForViewer({
      subjectId: "caravan-7", predicate: "destroyed", value: "true",
      witnessNpcId: "npc-b", receiverId: "player-1", logicalIndex: 20,
    });
    const calmProjection = projectRumorClaims({
      viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts: [...only, ...second],
    });
    const calmGraph = buildInvestigationGraph({ projection: calmProjection });
    expect(() => validateDeductionIntent({
      intent: {
        actorId: "player-1",
        selectedClaimIds: calmProjection.claims.map(c => c.claimId),
        deductionType: "challenge",
        sourceProjectionHash: calmProjection.projectionHash,
      },
      graph: calmGraph,
    })).toThrow("DEDUCTION_RELATION_REQUIRED");
  });

  it("validates chain deductions only when REQUIRES edges span the selection", () => {
    const smoke = claimForViewer({
      subjectId: "caravan-7", predicate: "saw_smoke", value: "true",
      witnessNpcId: "npc-a", receiverId: "player-1", logicalIndex: 10,
    });
    const destroyed = claimForViewer({
      subjectId: "caravan-7", predicate: "destroyed", value: "true",
      witnessNpcId: "npc-b", receiverId: "player-1", logicalIndex: 20,
    });
    const arrest = claimForViewer({
      subjectId: "bandit-4", predicate: "arrested", value: "true",
      witnessNpcId: "npc-c", receiverId: "player-1", logicalIndex: 30,
    });
    const receipts = [...smoke, ...destroyed, ...arrest];
    const projection = projectRumorClaims({ viewerId: "player-1", worldId: "world-1", atIndex: 50, receipts });
    const prerequisites = { destroyed: ["saw_smoke"], arrested: ["destroyed"] };
    const graph = buildInvestigationGraph({ projection, prerequisites });
    const chain = validateDeductionIntent({
      intent: {
        actorId: "player-1",
        selectedClaimIds: projection.claims.map(c => c.claimId),
        deductionType: "chain",
        sourceProjectionHash: projection.projectionHash,
      },
      graph,
    });
    expect(chain.result).toBe("validated");

    // Removing the middle link breaks the cover.
    const brokenProjection = projectRumorClaims({
      viewerId: "player-1", worldId: "world-1", atIndex: 50, receipts: [...smoke, ...arrest],
    });
    const broken = buildInvestigationGraph({
      projection: brokenProjection,
      prerequisites,
    });
    expect(() => validateDeductionIntent({
      intent: {
        actorId: "player-1",
        selectedClaimIds: brokenProjection.claims.map(c => c.claimId),
        deductionType: "chain",
        sourceProjectionHash: brokenProjection.projectionHash,
      },
      graph: broken,
    })).toThrow("DEDUCTION_RELATION_REQUIRED");
  });

  it("keeps replay equality: same confirmed graph yields the same deduction receipt", () => {
    const { receipts } = contradictedPair();
    const run = () => {
      const projection = projectRumorClaims({ viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts });
      const graph = buildInvestigationGraph({ projection });
      return validateDeductionIntent({
        intent: {
          actorId: "player-1",
          selectedClaimIds: projection.claims.map(c => c.claimId),
          deductionType: "challenge",
          sourceProjectionHash: projection.projectionHash,
        },
        graph,
      });
    };
    expect(run()).toEqual(run());
  });

  it("verifies graph hashes fail-closed", () => {
    const { receipts } = contradictedPair();
    const projection = projectRumorClaims({ viewerId: "player-1", worldId: "world-1", atIndex: 40, receipts });
    const graph = buildInvestigationGraph({ projection });
    expect(verifyInvestigationGraph(graph).graphHash).toBe(graph.graphHash);
    expect(() => verifyInvestigationGraph({ ...graph, viewerId: "player-2" })).toThrow("HASH_MISMATCH");
  });
});
