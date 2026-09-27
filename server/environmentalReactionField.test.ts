import { describe, expect, it } from "vitest";
import { resolveWorldReaction, type WorldSignal } from "./wasdAurionProtocol";
import {
  compileEnvironmentalReactionField,
  compileEnvironmentalReactionFieldFromSignals,
  environmentalReactionNeedEvents,
  resolveEnvironmentalNpcGoal,
} from "./environmentalReactionField";
import { resolveNpcNeeds } from "./wasdAurionProtocol";

function reaction(signals: readonly WorldSignal[]) {
  return resolveWorldReaction({
    worldSeed: "aim592-environment",
    regionId: "observatory_threshold",
    resolutionIndex: 7,
    signals,
  });
}

describe("AIM-592 environmental reaction field", () => {
  it("is deterministic and input-order invariant", () => {
    const signals: WorldSignal[] = [
      { id: "eco", kind: "ecology", regionId: "observatory_threshold", magnitude: -0.2, sourceReceiptId: "world:7", resolutionIndex: 7 },
      { id: "hazard", kind: "hazard", regionId: "observatory_threshold", magnitude: 0.9, sourceReceiptId: "world:7", resolutionIndex: 7 },
    ];
    const first = compileEnvironmentalReactionField(reaction(signals));
    const shuffled = compileEnvironmentalReactionField(reaction([...signals].reverse()));
    expect(first).toEqual(shuffled);
    expect(first.fieldHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("derives bounded hazard/opportunity/traversal/resource-pressure values from confirmed reaction", () => {
    const field = compileEnvironmentalReactionField(reaction([
      { id: "food", kind: "economy", regionId: "observatory_threshold", magnitude: 0.8, sourceReceiptId: "world:8", resolutionIndex: 7 },
      { id: "calm", kind: "hazard", regionId: "observatory_threshold", magnitude: 0, sourceReceiptId: "world:8", resolutionIndex: 7 },
    ]));
    for (const value of [field.hazardQ16, field.opportunityQ16, field.traversalRiskQ16, field.resourcePressureQ16]) {
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(65_536);
    }
    expect(field.opportunityQ16).toBeGreaterThan(0);
  });

  it("ignores presentation-only additions when hashing the gameplay field", () => {
    const base = reaction([{ id: "hazard", kind: "hazard", regionId: "observatory_threshold", magnitude: 0.9, sourceReceiptId: "world:7", resolutionIndex: 7 }]);
    const presentationOnly = { ...base, presentation: { renderer: "changed", colorGrade: "new" } } as typeof base & { presentation: unknown };
    expect(compileEnvironmentalReactionField(presentationOnly)).toEqual(compileEnvironmentalReactionField(base));
  });

  it("keeps signal source order deterministic at the field boundary", () => {
    const signals: WorldSignal[] = [
      { id: "z", kind: "economy", regionId: "observatory_threshold", magnitude: 0.3, sourceReceiptId: "r", resolutionIndex: 6 },
      { id: "a", kind: "hazard", regionId: "observatory_threshold", magnitude: 0.6, sourceReceiptId: "r", resolutionIndex: 7 },
    ];
    const r = reaction(signals);
    const direct = compileEnvironmentalReactionField(r);
    const checked = compileEnvironmentalReactionFieldFromSignals({ reaction: r, signals: [...signals].reverse() });
    expect(checked).toEqual(direct);
  });

  it("turns a high confirmed hazard into an actual safety-seeking NPC decision without a second planner", () => {
    const highHazard = compileEnvironmentalReactionField(reaction([
      { id: "hazard", kind: "hazard", regionId: "observatory_threshold", magnitude: 1, sourceReceiptId: "world:7", resolutionIndex: 7 },
    ]));
    const baseNeeds = resolveNpcNeeds({ events: [] });
    const decision = resolveEnvironmentalNpcGoal({
      npcId: "aurion-merchant-592",
      baseNeeds,
      observationIds: ["world:7"],
      field: highHazard,
    });
    expect(decision.goal).toBe("seek_safety");
    expect(decision.needs.safety).toBeLessThan(decision.needs.power);
    expect(environmentalReactionNeedEvents(highHazard).every(event => event.sourceReceiptId === highHazard.sourceReceiptId)).toBe(true);
  });
});
