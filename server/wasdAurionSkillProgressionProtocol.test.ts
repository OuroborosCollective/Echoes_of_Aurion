import { describe, expect, it } from "vitest";
import { advanceExactSkillProgression, resolveSkillProgressionReadmodel, xpRequiredForNextSkillLevelExact } from "./wasdAurionSkillProgressionProtocol";

describe("wasdAurionSkillProgressionProtocol", () => {
  it("preserves the exact historical level-one curve", () => {
    expect(xpRequiredForNextSkillLevelExact("1")).toBe("50");
    expect(advanceExactSkillProgression({ totalXpExact: "0", levelExact: "1", xpIntoLevelExact: "0" }, "50")).toMatchObject({ totalXpExact: "50", levelExact: "2", xpIntoLevelExact: "0" });
  });

  it("is cap-free and exposes exact strings when number projections saturate", () => {
    const next = advanceExactSkillProgression({ totalXpExact: "9007199254740991", levelExact: "999999", xpIntoLevelExact: "0" }, "1");
    expect(next.totalXpExact).toBe("9007199254740992");
    expect(next.numberProjectionExact).toBe(false);
  });

  it("orders confirmed events deterministically and rejects duplicate idempotency keys", () => {
    const input = { playerId: "aurion_player", skillId: "combat" as const, events: [
      { idempotencyKey: "skill-a", skillId: "combat" as const, amountExact: "30", source: "npc_kill" as const, receiptId: "receipt-a", resolutionIndex: 2 },
      { idempotencyKey: "skill-b", skillId: "combat" as const, amountExact: "20", source: "quest_reward" as const, receiptId: "receipt-b", resolutionIndex: 1 },
      { idempotencyKey: "skill-a", skillId: "combat" as const, amountExact: "999", source: "quest_reward" as const, receiptId: "receipt-duplicate", resolutionIndex: 3 },
    ] };
    const first = resolveSkillProgressionReadmodel(input);
    expect(first).toEqual(resolveSkillProgressionReadmodel({ ...input, events: input.events.slice().reverse() }));
    expect(first.progression).toMatchObject({ totalXpExact: "50", levelExact: "2" });
    expect(first.appliedReceiptIds).toEqual(["receipt-b", "receipt-a"]);
  });

  it("does not accept malformed or unconfirmed progression input", () => {
    expect(() => advanceExactSkillProgression({ totalXpExact: "0", levelExact: "1", xpIntoLevelExact: "0" }, "-2")).toThrow();
    expect(() => resolveSkillProgressionReadmodel({ playerId: "", skillId: "combat", events: [] })).toThrow();
  });
});
