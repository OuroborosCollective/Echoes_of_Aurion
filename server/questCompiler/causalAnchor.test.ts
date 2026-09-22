import { describe, expect, it } from "vitest";
import { createQuestCausalAnchor, verifyQuestCausalAnchor } from "../../shared/aurionQuestCausalAnchorContract";

const hex = (n: string) => n.repeat(64);

describe("Quest causal anchor contract", () => {
  it("round-trips deterministically and rejects tampering", () => {
    const anchor = createQuestCausalAnchor({
      questReceiptId: "rcpt_quest_1",
      worldId: "echoes-of-aurion-global",
      epoch: 7,
      zoneId: "observatory_threshold",
      tick: 42,
      causalReceiptHash: "sha256:" + hex("a"),
      sourceWorldRoot: "sha256:" + hex("b"),
      sourceRevision: "0123456789abcdef0123456789abcdef01234567",
      rulesetVersion: "aurion.zone.rules.v2",
      sourceEvidenceId: "encounter:42",
      sourceEvidenceDigest: hex("c"),
      sourceLogicalRevision: 12,
      triggerEventId: "evt_trigger_1",
      triggerEventDigest: hex("d"),
      compilerVersion: "1.0.0",
      templateSetHash: hex("e"),
      candidateSetHash: hex("f"),
      seedDigest: hex("1"),
      roleBindingHash: hex("2"),
      commandId: hex("3"),
      planHash: hex("4"),
      graphHash: hex("5"),
      previousStateHash: hex("6"),
      resultStateHash: hex("7"),
    });
    expect(verifyQuestCausalAnchor(anchor)).toBe(true);
    expect(anchor.anchorHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(verifyQuestCausalAnchor({ ...anchor, resultStateHash: hex("8") })).toBe(false);
  });
});
