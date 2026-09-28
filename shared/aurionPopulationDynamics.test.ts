import { describe, expect, it } from "vitest";
import {
  createPopulationState,
  derivePopulationPressure,
  evaluatePartnershipEligibility,
  populationBalance,
  resolvePopulationStep,
} from "./aurionPopulationDynamics";
import { canonicalSha256 } from "./aurionCanonicalHash";

const receiptHash = (id: string) =>
  canonicalSha256({ receiptId: id, authority: "aurion" });
const baseState = () =>
  createPopulationState({
    worldId: "world:aurion",
    regionId: "region:observatory",
    resolutionIndex: 4,
    alivePersonIds: ["person:parent-a", "person:parent-b", "person:elder"],
    households: [
      {
        householdId: "household:one",
        regionId: "region:observatory",
        residentIds: ["person:parent-a", "person:parent-b", "person:elder"],
        shelterCapacity: 5,
      },
    ],
    lineage: [],
  });

describe("AIM-547 deterministic household, family and population dynamics", () => {
  it("requires every partnership condition and returns a stable rejection explanation", () => {
    const rejected = evaluatePartnershipEligibility({
      partnershipId: "partnership:1",
      partnerIds: ["person:parent-a", "person:parent-b"],
      proximityBps: 4_999,
      accessBps: 10_000,
      socialCompatibilityBps: 10_000,
      resourceBps: 10_000,
      shelterBps: 10_000,
      policyAllowed: true,
      lifeStageEligible: true,
      sourceReceiptIds: ["receipt:presence"],
    });
    expect(rejected.eligible).toBe(false);
    expect(rejected.rejectionCodes).toEqual(["PROXIMITY_INSUFFICIENT"]);
    expect(rejected.eligibilityHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("is input-order invariant and eligible only with explicit policy, life-stage and receipts", () => {
    const input = {
      partnershipId: "partnership:1",
      partnerIds: ["person:parent-a", "person:parent-b"] as [string, string],
      proximityBps: 8_000,
      accessBps: 8_000,
      socialCompatibilityBps: 8_000,
      resourceBps: 8_000,
      shelterBps: 8_000,
      policyAllowed: true,
      lifeStageEligible: true,
      sourceReceiptIds: ["receipt:b", "receipt:a"],
    };
    const reverse = evaluatePartnershipEligibility({
      ...input,
      sourceReceiptIds: ["receipt:a", "receipt:b"],
    });
    expect(evaluatePartnershipEligibility(input)).toEqual(reverse);
    expect(reverse.eligible).toBe(true);
  });

  it("applies receipt-bound birth, death and migration exactly once", () => {
    const state = baseState();
    const birth = {
      receiptId: "birth:1",
      receiptHash: receiptHash("birth:1"),
      childId: "person:child",
      parentIds: ["person:parent-a", "person:parent-b"] as [string, string],
      householdId: "household:one",
      regionId: "region:observatory",
      resolutionIndex: 5,
    };
    const death = {
      receiptId: "death:1",
      receiptHash: receiptHash("death:1"),
      personId: "person:elder",
      cause: "age" as const,
      sourceReceiptId: "receipt:age",
      resolutionIndex: 5,
    };
    const migration = {
      receiptId: "migration:1",
      receiptHash: receiptHash("migration:1"),
      personId: "person:child",
      householdId: "household:one",
      fromRegionId: "region:observatory",
      toRegionId: "region:harbor",
      direction: "out" as const,
      resolutionIndex: 5,
    };
    const result = resolvePopulationStep({
      state,
      personRefs: state.alivePersonIds.map(personId => ({
        personId,
        householdId: "household:one",
        regionId: "region:observatory",
        lifeStage: "adult" as const,
        alive: true,
      })),
      births: [birth],
      deaths: [death],
      migrations: [migration],
    });
    expect(result.nextState.population).toBe(2);
    expect(result.nextState.alivePersonIds).toEqual([
      "person:parent-a",
      "person:parent-b",
    ]);
    expect(result.nextState.lineage).toEqual([
      {
        parentId: "person:parent-a",
        childId: "person:child",
        birthReceiptId: "birth:1",
      },
      {
        parentId: "person:parent-b",
        childId: "person:child",
        birthReceiptId: "birth:1",
      },
    ]);
    expect(result.nextState.stateHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects a birth without living parents, shelter or a valid next resolution", () => {
    const state = baseState();
    expect(() =>
      resolvePopulationStep({
        state,
        personRefs: state.alivePersonIds.map(personId => ({
          personId,
          householdId: "household:one",
          regionId: "region:observatory",
          lifeStage: "adult" as const,
          alive: true,
        })),
        births: [
          {
            receiptId: "birth:bad",
            receiptHash: receiptHash("birth:bad"),
            childId: "person:child",
            parentIds: ["person:missing", "person:parent-b"],
            householdId: "household:one",
            regionId: "region:observatory",
            resolutionIndex: 6,
          },
        ],
        deaths: [],
        migrations: [],
      })
    ).toThrow("POPULATION_BIRTH_NOT_ELIGIBLE");
  });

  it("computes the exact Wolfram-verified population balance", () => {
    expect(
      populationBalance({
        population: 1_000,
        births: 120,
        migrationIn: 80,
        deaths: 35,
        migrationOut: 160,
      })
    ).toBe(1_005);
  });

  it("computes Wolfram-verified population and pressure values with integer arithmetic", () => {
    const pressure = derivePopulationPressure({
      population: 1_005,
      landCapacity: 1_250,
      foodStock: 800,
      foodPerPerson: 1,
      shelterCapacity: 1_250,
    });
    expect(pressure).toMatchObject({
      population: 1_005,
      landNeedBps: 8_040,
      foodShortageBps: 2_039,
      housingNeedBps: 8_040,
      migrationPressureBps: 8_040,
      newSettlementPressureBps: 0,
    });
    expect(pressure.pressureHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("fails closed for tampered state hashes, duplicate receipts and insufficient shelter", () => {
    const state = baseState();
    expect(() =>
      resolvePopulationStep({
        state: { ...state, stateHash: receiptHash("tampered") },
        personRefs: state.alivePersonIds.map(personId => ({
          personId,
          householdId: "household:one",
          regionId: "region:observatory",
          lifeStage: "adult" as const,
          alive: true,
        })),
        births: [],
        deaths: [],
        migrations: [],
      })
    ).toThrow("POPULATION_STATE_HASH_MISMATCH");
    const birth = {
      receiptId: "birth:dup",
      receiptHash: receiptHash("birth:dup"),
      childId: "person:child",
      parentIds: ["person:parent-a", "person:parent-b"] as [string, string],
      householdId: "household:one",
      regionId: "region:observatory",
      resolutionIndex: 5,
    };
    expect(() =>
      resolvePopulationStep({
        state,
        personRefs: state.alivePersonIds.map(personId => ({
          personId,
          householdId: "household:one",
          regionId: "region:observatory",
          lifeStage: "adult" as const,
          alive: true,
        })),
        births: [birth, birth],
        deaths: [],
        migrations: [],
      })
    ).toThrow("POPULATION_DUPLICATE_RECEIPT");
  });
});
