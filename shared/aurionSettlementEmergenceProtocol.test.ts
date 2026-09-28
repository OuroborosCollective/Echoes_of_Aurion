import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "./aurionCanonicalHash";
import { createPopulationState } from "./aurionPopulationDynamics";
import {
  resolveSettlementEmergence,
  verifySettlementEmergenceResolution,
  type SettlementEmergenceInput,
  type SettlementThresholdManifest,
} from "./aurionSettlementEmergenceProtocol";

const REVISION = "a".repeat(40);
const OTHER_REVISION = "b".repeat(40);
const receiptHash = (receiptId: string) =>
  canonicalSha256({ authority: "aurion", receiptId });
const personIds = Array.from({ length: 800 }, (_, index) => `person:${index}`);
const populationState = createPopulationState({
  worldId: "world:aurion",
  regionId: "region:observatory",
  resolutionIndex: 16,
  alivePersonIds: personIds,
  households: [
    {
      householdId: "household:observatory",
      regionId: "region:observatory",
      residentIds: personIds,
      shelterCapacity: 1_000,
    },
  ],
  lineage: [],
});

const manifest: SettlementThresholdManifest = {
  revision: REVISION,
  tiers: [
    {
      tier: "temporary_camp",
      minPopulation: 1,
      minStableResidents: 1,
      minStableResidencyResolutions: 0,
      minFoodAccessBps: 5_000,
      minWaterAccessBps: 5_000,
      minShelterCapacity: 1,
      minStorageCapacity: 1,
      minLocalProductionBps: 1_000,
      minSafetyBps: 2_000,
      minConnectivityBps: 1_000,
      minCohesionBps: 1_000,
    },
    {
      tier: "homestead",
      minPopulation: 4,
      minStableResidents: 3,
      minStableResidencyResolutions: 1,
      minFoodAccessBps: 6_000,
      minWaterAccessBps: 6_000,
      minShelterCapacity: 4,
      minStorageCapacity: 4,
      minLocalProductionBps: 2_000,
      minSafetyBps: 3_000,
      minConnectivityBps: 2_000,
      minCohesionBps: 2_000,
    },
    {
      tier: "hamlet",
      minPopulation: 12,
      minStableResidents: 8,
      minStableResidencyResolutions: 2,
      minFoodAccessBps: 7_000,
      minWaterAccessBps: 7_000,
      minShelterCapacity: 12,
      minStorageCapacity: 12,
      minLocalProductionBps: 3_500,
      minSafetyBps: 4_500,
      minConnectivityBps: 3_500,
      minCohesionBps: 3_500,
    },
    {
      tier: "village",
      minPopulation: 40,
      minStableResidents: 28,
      minStableResidencyResolutions: 4,
      minFoodAccessBps: 7_500,
      minWaterAccessBps: 7_500,
      minShelterCapacity: 48,
      minStorageCapacity: 64,
      minLocalProductionBps: 5_000,
      minSafetyBps: 5_500,
      minConnectivityBps: 5_000,
      minCohesionBps: 5_000,
    },
    {
      tier: "town",
      minPopulation: 180,
      minStableResidents: 120,
      minStableResidencyResolutions: 8,
      minFoodAccessBps: 8_000,
      minWaterAccessBps: 8_000,
      minShelterCapacity: 240,
      minStorageCapacity: 512,
      minLocalProductionBps: 6_500,
      minSafetyBps: 6_500,
      minConnectivityBps: 6_500,
      minCohesionBps: 6_500,
    },
    {
      tier: "city",
      minPopulation: 800,
      minStableResidents: 560,
      minStableResidencyResolutions: 16,
      minFoodAccessBps: 8_500,
      minWaterAccessBps: 8_500,
      minShelterCapacity: 1_000,
      minStorageCapacity: 4_000,
      minLocalProductionBps: 8_000,
      minSafetyBps: 8_000,
      minConnectivityBps: 8_000,
      minCohesionBps: 8_000,
    },
  ],
};

function baseInput(): SettlementEmergenceInput {
  return {
    populationState,
    sourceRevision: REVISION,
    resolutionIndex: 16,
    thresholdManifest: manifest,
    metricEvidence: [
      {
        kind: "food_access",
        valueBps: 8_500,
        sourceReceiptId: "receipt:food",
        sourceReceiptHash: receiptHash("receipt:food"),
        sourceRevision: REVISION,
        resolutionIndex: 16,
      },
      {
        kind: "water_access",
        valueBps: 8_500,
        sourceReceiptId: "receipt:water",
        sourceReceiptHash: receiptHash("receipt:water"),
        sourceRevision: REVISION,
        resolutionIndex: 16,
      },
      {
        kind: "local_production",
        valueBps: 8_000,
        sourceReceiptId: "receipt:production",
        sourceReceiptHash: receiptHash("receipt:production"),
        sourceRevision: REVISION,
        resolutionIndex: 16,
      },
      {
        kind: "safety",
        valueBps: 8_000,
        sourceReceiptId: "receipt:safety",
        sourceReceiptHash: receiptHash("receipt:safety"),
        sourceRevision: REVISION,
        resolutionIndex: 16,
      },
      {
        kind: "connectivity",
        valueBps: 8_000,
        sourceReceiptId: "receipt:connectivity",
        sourceReceiptHash: receiptHash("receipt:connectivity"),
        sourceRevision: REVISION,
        resolutionIndex: 16,
      },
      {
        kind: "cohesion",
        valueBps: 8_000,
        sourceReceiptId: "receipt:cohesion",
        sourceReceiptHash: receiptHash("receipt:cohesion"),
        sourceRevision: REVISION,
        resolutionIndex: 16,
      },
    ],
    capacityEvidence: [
      {
        kind: "shelter",
        capacity: 1_000,
        sourceReceiptId: "receipt:shelter",
        sourceReceiptHash: receiptHash("receipt:shelter"),
        sourceRevision: REVISION,
        resolutionIndex: 16,
      },
      {
        kind: "storage",
        capacity: 4_000,
        sourceReceiptId: "receipt:storage",
        sourceReceiptHash: receiptHash("receipt:storage"),
        sourceRevision: REVISION,
        resolutionIndex: 16,
      },
    ],
    residencyEvidence: {
      residentIds: personIds.slice(0, 560),
      stableSinceResolutionIndex: 0,
      sourceReceiptId: "receipt:residency",
      sourceReceiptHash: receiptHash("receipt:residency"),
      sourceRevision: REVISION,
      resolutionIndex: 16,
    },
    existingSettlement: null,
  };
}

describe("AIM-548 deterministic settlement emergence", () => {
  it("emits exactly one receipt-bound formation effect and never skips the hierarchy", () => {
    const result = resolveSettlementEmergence(baseInput());
    expect(result.highestEligibleTier).toBe("city");
    expect(result.existingTier).toBeNull();
    expect(result.proposedTier).toBe("temporary_camp");
    expect(result.growthEligible).toBe(true);
    expect(result.effectIntent).toMatchObject({
      effectType: "settlement-emergence",
      ordinal: 16,
      payload: { fromTier: "unformed", toTier: "temporary_camp" },
    });
    expect(result.resolutionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("is input-order invariant and promotes one existing tier through the real effect intent", () => {
    const input = {
      ...baseInput(),
      existingSettlement: {
        tier: "town" as const,
        sourceReceiptId: "receipt:town",
        sourceReceiptHash: receiptHash("receipt:town"),
        sourceRevision: REVISION,
      },
    };
    const ordered = resolveSettlementEmergence(input);
    const reordered = resolveSettlementEmergence({
      ...input,
      metricEvidence: [...input.metricEvidence].reverse(),
      capacityEvidence: [...input.capacityEvidence].reverse(),
      residencyEvidence: {
        ...input.residencyEvidence,
        residentIds: [...input.residencyEvidence.residentIds].reverse(),
      },
    });
    expect(ordered).toEqual(reordered);
    expect(ordered.proposedTier).toBe("city");
    expect(ordered.effectIntent?.payload).toMatchObject({
      fromTier: "town",
      toTier: "city",
    });
    expect(verifySettlementEmergenceResolution(input, ordered)).toBe(true);
    expect(
      verifySettlementEmergenceResolution(input, {
        ...ordered,
        resolutionHash: receiptHash("receipt:tampered-resolution"),
      })
    ).toBe(false);
  });

  it("stops growth when an enabling resource is withdrawn instead of creating capacity from settlement visuals", () => {
    const input = {
      ...baseInput(),
      existingSettlement: {
        tier: "village" as const,
        sourceReceiptId: "receipt:village",
        sourceReceiptHash: receiptHash("receipt:village"),
        sourceRevision: REVISION,
      },
      metricEvidence: baseInput().metricEvidence.map(metric =>
        metric.kind === "food_access" ? { ...metric, valueBps: 7_499 } : metric
      ),
    };
    const result = resolveSettlementEmergence({
      ...input,
      visualStructureIds: ["mesh:city-wall", "mesh:market"],
    } as SettlementEmergenceInput);
    expect(result.currentTierSatisfied).toBe(false);
    expect(result.proposedTier).toBe("village");
    expect(result.growthEligible).toBe(false);
    expect(result.effectIntent).toBeNull();
    expect(result.nextTierBlockers).toContainEqual({
      code: "FOOD_ACCESS_INSUFFICIENT",
      actual: 7_499,
      required: 8_000,
    });
  });

  it("fails closed for tampered population truth, duplicate evidence, stale revisions and non-monotone thresholds", () => {
    const input = baseInput();
    expect(() =>
      resolveSettlementEmergence({
        ...input,
        populationState: {
          ...input.populationState,
          stateHash: receiptHash("receipt:forged-population-state"),
        },
      })
    ).toThrow("SETTLEMENT_POPULATION_STATE_HASH_MISMATCH");
    expect(() =>
      resolveSettlementEmergence({
        ...input,
        metricEvidence: [
          input.metricEvidence[0]!,
          input.metricEvidence[0]!,
          ...input.metricEvidence.slice(2),
        ],
      })
    ).toThrow("SETTLEMENT_METRIC_DUPLICATE");
    expect(() =>
      resolveSettlementEmergence({
        ...input,
        metricEvidence: input.metricEvidence.map(metric =>
          metric.kind === "water_access"
            ? { ...metric, sourceRevision: OTHER_REVISION }
            : metric
        ),
      })
    ).toThrow("SETTLEMENT_EVIDENCE_REVISION_MISMATCH");
    expect(() =>
      resolveSettlementEmergence({
        ...input,
        thresholdManifest: {
          ...manifest,
          tiers: manifest.tiers.map((tier, index) =>
            index === 1
              ? {
                  ...tier,
                  minPopulation: 1,
                  minStableResidents: 1,
                  minShelterCapacity: 1,
                }
              : tier
          ),
        },
      })
    ).toThrow("SETTLEMENT_THRESHOLD_POPULATION_NOT_STRICT");
  });
});
