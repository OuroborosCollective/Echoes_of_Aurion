import { describe, expect, it } from "vitest";
import { getQuestlineNode, resolveQuestDecision, resolveQuestline, resolveQuestObjective, type AurionFaction, type QuestApproach } from "./aurionQuestlineProtocol";

type PathCase = {
  label: string;
  faction: AurionFaction;
  approach: QuestApproach;
  oathQuestId: string;
  mainQuestId: string;
  decisionKey: string;
  objectivePattern: RegExp;
};

const pathCases: readonly PathCase[] = [
  { label: "Handel", faction: "free_haven", approach: "trade", oathQuestId: "free_haven.oath", mainQuestId: "free_haven.mainline", decisionKey: "mediate", objectivePattern: /gemeinsame Versorgungslinie/i },
  { label: "Crafting", faction: "sunward_concord", approach: "craft", oathQuestId: "concord.oath", mainQuestId: "concord.mainline", decisionKey: "fortify", objectivePattern: /Tor fertig/i },
  { label: "Kampf", faction: "ironwardens", approach: "combat", oathQuestId: "ironwardens.oath", mainQuestId: "ironwardens.mainline", decisionKey: "charge", objectivePattern: /Gegenstoß/i },
  { label: "Spionage", faction: "veiled_covenant", approach: "espionage", oathQuestId: "veiled_covenant.oath", mainQuestId: "veiled_covenant.mainline", decisionKey: "infiltrate", objectivePattern: /feindlichen Tore/i },
  { label: "Erkundung", faction: "wayfarer_compact", approach: "exploration", oathQuestId: "wayfarer_compact.oath", mainQuestId: "wayfarer_compact.mainline", decisionKey: "chart", objectivePattern: /Sturmgrat/i },
];

describe("aurion questline integration paths", () => {
  it.each(pathCases)("resolves the complete $label path from oath to authored main objective", (scenario) => {
    const readmodel = resolveQuestline({
      playerId: `integration-${scenario.approach}`,
      faction: scenario.faction,
      completedQuestIds: scenario.faction === "sunward_concord" ? [scenario.oathQuestId, "concord.gate-seal"] : [scenario.oathQuestId],
      decisions: [],
      approachScores: { [scenario.approach]: 100 },
      resolutionIndex: 100,
    });

    expect(readmodel.faction).toBe(scenario.faction);
    expect(readmodel.preferredApproach).toBe(scenario.approach);
    expect(readmodel.availableMainQuestIds).toEqual([scenario.mainQuestId]);
    expect(readmodel.route).toContain(scenario.mainQuestId);

    const node = getQuestlineNode(scenario.mainQuestId);
    expect(node.kind).toBe("main");
    expect(node.faction).toBe(scenario.faction);
    expect(node.preferredApproaches).toContain(scenario.approach);
    expect(resolveQuestObjective(scenario.mainQuestId, scenario.approach)).toMatch(scenario.objectivePattern);

    const decision = resolveQuestDecision({
      playerId: `integration-${scenario.approach}`,
      nodeId: scenario.mainQuestId,
      decisionKey: scenario.decisionKey,
      approach: scenario.approach,
      receiptId: `receipt-${scenario.approach}-100`,
      resolutionIndex: 101,
    });
    expect(decision).toMatchObject({ questId: scenario.mainQuestId, approach: scenario.approach, receiptId: `receipt-${scenario.approach}-100`, resolutionIndex: 101 });
  });

  it("keeps all five path objectives distinct on the shared warfront convergence", () => {
    const objectives = pathCases.map((scenario) => resolveQuestObjective(scenario.mainQuestId, scenario.approach));
    expect(new Set(objectives).size).toBe(5);
    expect(objectives.join(" ")).toMatch(/Tor|Gegenstoß|feindlichen Tore|Sturmgrat|Versorgungslinie/i);
  });

  it("rejects a path decision when the approach is not authored for that quest node", () => {
    expect(() => resolveQuestDecision({
      playerId: "integration-negative",
      nodeId: "concord.side-ledger",
      decisionKey: "record",
      approach: "exploration",
      receiptId: "receipt-invalid-path",
      resolutionIndex: 2,
    })).toThrow(/not authored/);
  });
});
