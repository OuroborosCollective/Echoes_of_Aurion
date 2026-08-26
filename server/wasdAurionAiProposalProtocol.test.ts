import { describe, expect, it } from "vitest";
import { resolveAiProposal } from "./wasdAurionAiProposalProtocol";

describe("wasdAurionAiProposalProtocol", () => {
  it("emits a deterministic non-authoritative NPC trade proposal", () => {
    const input = { text: "The merchant needs a trade route after scarcity.", mode: "npc" as const, receiptId: "ai-1", resolutionIndex: 4 };
    const first = resolveAiProposal(input);
    expect(first).toEqual(resolveAiProposal(input));
    expect(first).toMatchObject({ state: "proposal", intent: "trade_decision", commandType: "AURION_TRADE_PROPOSAL" });
  });

  it("turns fatal or corrupt requests into a non-executing health notice", () => {
    const proposal = resolveAiProposal({ text: "Fatal corrupt state detected", mode: "npc", receiptId: "ai-2", resolutionIndex: 5 });
    expect(proposal).toMatchObject({ state: "health_notice" });
    expect(proposal.commandType).toBeUndefined();
  });

  it("does not issue autonomous commands in diagnostic mode", () => {
    expect(resolveAiProposal({ text: "diagnose world error", mode: "diagnostic", receiptId: "ai-3", resolutionIndex: 6 })).toMatchObject({ state: "rejected", intent: "diagnostic_check" });
  });
});
