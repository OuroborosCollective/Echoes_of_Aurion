import { describe, expect, it } from "vitest";
import {
  applyEmergentLifeImpacts,
  normalizeEmergentLifeImpacts,
  resolveEmergentLifeStep,
} from "../shared/aurionEmergentLifeCore";

const baseNeeds = {
  safety: 8_000,
  resources: 8_000,
  belonging: 8_000,
  status: 8_000,
  wealth: 8_000,
  power: 8_000,
} as const;

const impact = (domain: string, magnitudeBps: number, index: number) => ({
  sourceReceiptId: "receipt:" + index,
  targetEntityIds: ["npc-1"],
  domain,
  magnitudeBps,
  causeTags: [domain],
  regionId: "observatory_threshold",
  resolutionIndex: index,
});

const candidates = [
  { id:"gather:1", kind:"gather" as const, sourceReceiptId:"receipt:1", resolutionIndex:10, priorityBps:7_000, benefitBps:8_500, riskBps:500, distanceBps:100 },
  { id:"defend:1", kind:"defend" as const, sourceReceiptId:"receipt:2", resolutionIndex:10, priorityBps:7_000, benefitBps:8_600, riskBps:100, distanceBps:100 },
];

describe("AIM-544 Emergent Life Core", () => {
  it("applies impacts in canonical order and changes only mapped needs", () => {
    const first = applyEmergentLifeImpacts(baseNeeds, [impact("ecology",1_500,9), impact("hazard",2_000,10)]);
    const second = applyEmergentLifeImpacts(baseNeeds, [impact("hazard",2_000,10), impact("ecology",1_500,9)]);
    expect(first).toEqual(second);
    expect(first.resources).toBe(6_500);
    expect(first.safety).toBe(6_000);
    expect(first.wealth).toBe(8_000);
  });

  it("binds Impact -> Need -> Action -> Impact and is input-order invariant", () => {
    const a = resolveEmergentLifeStep({ entityId:"npc-1", regionId:"observatory_threshold", resolutionIndex:10, currentNeeds:baseNeeds, impacts:[impact("hazard",500,10)], candidates });
    const b = resolveEmergentLifeStep({ entityId:"npc-1", regionId:"observatory_threshold", resolutionIndex:10, currentNeeds:baseNeeds, impacts:[impact("hazard",500,10)], candidates:[...candidates].reverse() });
    expect(a).toEqual(b);
    expect(a.selectedAction?.id).toBe("defend:1");
    expect(a.inputImpactIds).toEqual(["receipt:10"]);
    expect(a.resolutionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(a.nextImpact?.domain).toBe("defend");
  });

  it("rejects duplicate evidence instead of silently collapsing history", () => {
    expect(() => normalizeEmergentLifeImpacts([impact("hazard",100,4), impact("hazard",200,4)],"npc-1",4)).toThrow("EMERGENT_LIFE_DUPLICATE_IMPACT");
  });

  it("binds a selected action to the canonical effect-intent contract", () => {
    const result = resolveEmergentLifeStep({
      entityId:"npc-1", regionId:"observatory_threshold", resolutionIndex:10,
      currentNeeds:baseNeeds, impacts:[impact("hazard",500,10)], candidates,
    });
    expect(result.effectIntent).not.toBeNull();
    expect(result.effectIntent?.effectType).toBe("emergent-life-action-intent");
    expect(result.effectIntent?.authorityReceiptHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(result.effectIntent?.effectId).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("excludes future impacts from the current resolution", () => {
    const result = resolveEmergentLifeStep({ entityId:"npc-1", regionId:"observatory_threshold", resolutionIndex:10, currentNeeds:baseNeeds, impacts:[impact("hazard",500,11)], candidates:[] });
    expect(result.inputImpactIds).toEqual([]);
    expect(result.afterNeedsHash).toBe(result.beforeNeedsHash);
  });

  it("clamps incoming need values to the canonical basis-point range", () => {
    const result = applyEmergentLifeImpacts({ ...baseNeeds, safety: 20_000 }, []);
    expect(result.safety).toBe(10_000);
  });
});
