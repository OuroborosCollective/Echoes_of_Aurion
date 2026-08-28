import { describe, expect, it } from "vitest";
import { resolveCivicStanding, resolveEthosAura, resolveMasteryReadmodel, type MasteryProgressionEvent } from "./aurionMasteryEthosProtocol";

const ruleSetVersion = "aurion-mastery-ethos.v1";
const contentVersion = "aurion-content.v2";

function event(input: Partial<MasteryProgressionEvent> & Pick<MasteryProgressionEvent, "disciplineId" | "idempotencyKey" | "sourceReceiptId">): MasteryProgressionEvent {
  return {
    disciplineId: input.disciplineId,
    idempotencyKey: input.idempotencyKey,
    sourceReceiptId: input.sourceReceiptId,
    source: input.source ?? "encounter",
    amountExact: input.amountExact ?? "50",
    resolutionIndex: input.resolutionIndex ?? 1,
    ruleSetVersion: input.ruleSetVersion ?? ruleSetVersion,
    contentVersion: input.contentVersion ?? contentVersion,
  };
}

describe("aurionMasteryEthosProtocol", () => {
  it("keeps each weapon, armor, magic, crafting, shaping and civic discipline separate and cap-free", () => {
    const disciplines = ["blade_mastery", "heavy_armor_mastery", "resonance_magic", "smithing", "shaping", "diplomacy"] as const;
    for (const disciplineId of disciplines) {
      const result = resolveMasteryReadmodel({
        playerId: "player-1",
        disciplineId,
        current: { totalXpExact: "9007199254740991", levelExact: "999999", xpIntoLevelExact: "0" },
        events: [event({ disciplineId, idempotencyKey: `${disciplineId}:1`, sourceReceiptId: `${disciplineId}-receipt`, source: disciplineId === "diplomacy" ? "diplomacy" : disciplineId === "shaping" ? "shaping" : "encounter", amountExact: "1" })],
      });
      expect(result.progression.totalXpExact).toBe("9007199254740992");
      expect(result.progression.numberProjectionExact).toBe(false);
      expect(result.appliedReceiptIds).toEqual([`${disciplineId}-receipt`]);
    }
  });

  it("replays receipt-bound mastery in stable order and ignores an idempotent duplicate", () => {
    const events = [
      event({ disciplineId: "staff_mastery", idempotencyKey: "staff:later", sourceReceiptId: "receipt-later", amountExact: "50", resolutionIndex: 2 }),
      event({ disciplineId: "staff_mastery", idempotencyKey: "staff:first", sourceReceiptId: "receipt-first", amountExact: "50", resolutionIndex: 1 }),
      event({ disciplineId: "staff_mastery", idempotencyKey: "staff:first", sourceReceiptId: "receipt-duplicate", amountExact: "999999", resolutionIndex: 3 }),
    ];
    const first = resolveMasteryReadmodel({ playerId: "player-1", disciplineId: "staff_mastery", events });
    const replay = resolveMasteryReadmodel({ playerId: "player-1", disciplineId: "staff_mastery", events: events.slice().reverse() });
    expect(replay).toEqual(first);
    expect(first.progression.totalXpExact).toBe("100");
    expect(first.appliedReceiptIds).toEqual(["receipt-first", "receipt-later"]);
  });

  it("derives a visible moral aura only from canonical extreme receipt shifts", () => {
    const events = [
      { idempotencyKey: "ethos-2", sourceReceiptId: "receipt-2", resolutionIndex: 2, ruleSetVersion, contentVersion, deltasBps: { integrity: 2_500, stewardship: 2_500 } },
      { idempotencyKey: "ethos-1", sourceReceiptId: "receipt-1", resolutionIndex: 1, ruleSetVersion, contentVersion, deltasBps: { mercy: 2_500 } },
      { idempotencyKey: "ethos-1", sourceReceiptId: "receipt-duplicate", resolutionIndex: 3, ruleSetVersion, contentVersion, deltasBps: { mercy: -2_500 } },
    ] as const;
    const first = resolveEthosAura({ playerId: "player-1", events });
    const replay = resolveEthosAura({ playerId: "player-1", events: events.slice().reverse() });
    expect(replay).toEqual(first);
    expect(first).toMatchObject({ axesBps: { mercy: 2_500, stewardship: 2_500, integrity: 2_500 }, alignment: "good", aura: "radiant", trigger: "extreme_shift", appliedReceiptIds: ["receipt-1", "receipt-2"] });
    expect(resolveEthosAura({ playerId: "player-1", events: [{ ...events[0], deltasBps: { integrity: -2_500, stewardship: -2_500 } }, { ...events[1], deltasBps: { mercy: -2_500 } }] })).toMatchObject({ alignment: "evil", aura: "shadow" });
  });

  it("maps civic mastery to readmodel ranks without granting authority", () => {
    const resolve = (disciplineId: "council" | "administration" | "diplomacy" | "sovereignty", totalXpExact: string, levelExact: string) => resolveMasteryReadmodel({ playerId: "player-1", disciplineId, current: { totalXpExact, levelExact, xpIntoLevelExact: "0" }, events: [] });
    const standing = resolveCivicStanding({
      council: resolve("council", "0", "1"),
      administration: resolve("administration", "0", "25"),
      diplomacy: resolve("diplomacy", "0", "100"),
      sovereignty: resolve("sovereignty", "0", "500"),
    });
    expect(standing).toEqual({ councilRank: "observer", administrationRank: "clerk", diplomacyRank: "ambassador", sovereigntyRank: "sovereign" });
    expect(() => resolveCivicStanding({ council: resolve("council", "0", "1"), administration: resolve("administration", "0", "1"), diplomacy: resolve("diplomacy", "0", "1"), sovereignty: resolve("diplomacy", "0", "1") })).toThrow(/matching mastery/i);
  });

  it("rejects missing identity and non-integer ethos state rather than accepting client-like input", () => {
    expect(() => resolveMasteryReadmodel({ playerId: "", disciplineId: "blade_mastery", events: [] })).toThrow(/player ID/i);
    expect(() => resolveEthosAura({ playerId: "player-1", current: { mercy: 0.5 }, events: [] })).toThrow(/safe integer/i);
  });
});
