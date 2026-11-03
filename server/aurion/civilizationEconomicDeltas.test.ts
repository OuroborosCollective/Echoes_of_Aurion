import { describe, expect, it } from "vitest";
import { deriveEconomicDeltas } from "./civilizationService";
import { resolveCollapseQualification } from "./civilizationProtocol";
import { aggregateEconomicImpact } from "./economicEventAggregator";
import type { WorldSignal } from "../wasdAurionProtocol";

function signal(kind: WorldSignal["kind"], magnitude: number) {
  return Object.freeze({
    signal: { id: `sig:${kind}:${magnitude}`, kind, regionId: "emberfall", magnitude, sourceReceiptId: "receipt:econ", resolutionIndex: 1 } as WorldSignal,
    sourceNpcId: "ax1_merchant_emberfall",
    sourceHubId: "emberfall" as const,
  });
}

const collapseInput = {
  civilizationId: "civ-econ",
  worldId: "world-econ",
  worldEpoch: 3,
  population: 50,
  stability: 0.5,
  hazardIndex: 0.1,
  scarcitySeverity: 0,
  receiptId: "receipt-econ",
};

describe("Aurion economic civilization deltas", () => {
  it("erodes stability below the baseline drift when politics, recession and scarcity pressure dominate", () => {
    const quiet = deriveEconomicDeltas(aggregateEconomicImpact(1, [], []));
    const unrest = deriveEconomicDeltas(aggregateEconomicImpact(1, [signal("politics", 1)], []));
    const recession = deriveEconomicDeltas(aggregateEconomicImpact(1, [signal("economy", -1)], []));
    const famine = deriveEconomicDeltas(aggregateEconomicImpact(1, [signal("ecology", -1)], []));
    const boom = deriveEconomicDeltas(aggregateEconomicImpact(1, [signal("economy", 1)], []));

    expect(quiet.stabilityDelta).toBeCloseTo(-0.02, 10);
    expect(unrest.stabilityDelta).toBeCloseTo(-0.08, 10);
    expect(recession.stabilityDelta).toBeCloseTo(-0.1, 10);
    expect(famine.stabilityDelta).toBeCloseTo(-0.06, 10);
    expect(boom.stabilityDelta).toBeCloseTo(0.06, 10);
  });

  it("qualifies a famine collapse on the persisted [0,1] scarcity scale", () => {
    const famine = resolveCollapseQualification({ ...collapseInput, scarcitySeverity: 0.9 });
    expect(famine).toMatchObject({ isEligible: true, reason: "famine" });
    expect(resolveCollapseQualification({ ...collapseInput, scarcitySeverity: 0.8 })).toMatchObject({ isEligible: false, reason: "none" });
    expect(resolveCollapseQualification({ ...collapseInput, population: 100, scarcitySeverity: 1 })).toMatchObject({ isEligible: false });
    expect(resolveCollapseQualification({ ...collapseInput, stability: 0.1, scarcitySeverity: 1 }).reason).toBe("instability");
    expect(resolveCollapseQualification({ ...collapseInput, hazardIndex: 0.9, scarcitySeverity: 1 }).reason).toBe("hazard");
  });

  it("drives sustained scarcity into a famine collapse through the economic deltas", () => {
    const deltas = deriveEconomicDeltas(aggregateEconomicImpact(1, [signal("ecology", -1)], []));
    let scarcity = 0;
    let cycles = 0;
    while (!resolveCollapseQualification({ ...collapseInput, scarcitySeverity: scarcity }).isEligible && cycles < 50) {
      scarcity = Math.min(1, scarcity + deltas.scarcityDelta);
      cycles += 1;
    }
    expect(resolveCollapseQualification({ ...collapseInput, scarcitySeverity: scarcity }).reason).toBe("famine");
    expect(cycles).toBeLessThan(50);
  });
});
