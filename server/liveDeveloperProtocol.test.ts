import { describe, expect, it } from "vitest";
import { buildGameDevAssetDesignGuardrails, buildLiveDeveloperGuardrails, hashGameDevAssetDesignWorkOrder, validateGameDevAssetDesignWorkOrder, validateLiveDeveloperProposal } from "./liveDeveloperProtocol";

describe("Aurion live-developer proposal protocol", () => {
  it("accepts a bounded review-only quest proposal", () => {
    const proposal = validateLiveDeveloperProposal({
      kind: "quest",
      title: "Restore the Observatory Signal",
      summary: "A bounded three-step follow-up quest proposal for the first Aurion instance.",
      operations: [{ action: "add", target: "quest.observatory-signal", summary: "Add a staged quest objective after the Solarium boss.", constraints: ["No direct reward grant", "Human review required"] }],
      gameplayImpact: "Creates a visible next objective and a controlled dungeon-key handoff.",
      reviewNotes: ["Check quest rewards against the server-authoritative progression contract."],
      requiresHumanReview: true,
    });
    expect(proposal.kind).toBe("quest");
    expect(proposal.requiresHumanReview).toBe(true);
  });

  it("documents the prohibition on autonomous production edits", () => {
    expect(buildLiveDeveloperGuardrails()).toContain("never an instruction to edit code");
  });
  it("binds a human-reviewed game asset work order without granting production authority", () => {
    const workOrder = validateGameDevAssetDesignWorkOrder({
      title: "Runestone shrine prop",
      suggestedDisplayName: "Runestone Shrine",
      suggestedPurpose: "world-environment",
      designIntent: "A readable mid-poly shrine prop that fits Aurion's existing dark-fantasy world presentation.",
      acceptanceCriteria: ["Readable silhouette at gameplay camera distance", "No gameplay stats or collision authority encoded in the asset"],
      riskNotes: ["Human must provide and confirm the real asset license separately"],
      requiresHumanReview: true,
    });
    expect(hashGameDevAssetDesignWorkOrder(workOrder)).toMatch(/^[a-f0-9]{64}$/);
    expect(buildGameDevAssetDesignGuardrails()).toContain("Do not claim or infer a license");
    expect(workOrder.requiresHumanReview).toBe(true);
  });
});
