import { describe, expect, it } from "vitest";
import { buildLiveDeveloperGuardrails, validateLiveDeveloperProposal } from "./liveDeveloperProtocol";

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
});
