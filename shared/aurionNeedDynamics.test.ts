import { describe, expect, it } from "vitest";
import {
  AURION_NEED_DYNAMICS_PROTOCOL,
  NEED_DYNAMICS_ACTION_THRESHOLD_BPS,
  assertNeedDynamicsState,
  createInitialNeedDynamicsState,
  deriveNeedDynamicsActionCandidates,
  resolveNeedDynamicsStep,
  verifyNeedDynamicsReplay,
  type NeedDynamicsActionOpportunity,
  type NeedDynamicsNeeds,
} from "./aurionNeedDynamics";

const baseNeeds: NeedDynamicsNeeds = {
  survival: 3_000,
  hydration: 3_000,
  shelter: 3_000,
  health: 1_000,
  safety: 3_000,
  energy: 3_000,
  inventory_sufficiency: 3_000,
  wealth: 3_000,
  belonging: 3_000,
  status: 3_000,
  family: 3_000,
  occupation: 3_000,
  knowledge_adventure: 3_000,
};

function state(needs: Partial<NeedDynamicsNeeds> = {}, resolutionIndex = 4) {
  return createInitialNeedDynamicsState({
    entityId: "npc:need-546",
    regionId: "observatory_threshold",
    resolutionIndex,
    needs: { ...baseNeeds, ...needs },
  });
}

function opportunities(
  resolutionIndex: number
): readonly NeedDynamicsActionOpportunity[] {
  return [
    {
      id: "op:forage",
      sourceReceiptId: "receipt:op:forage",
      action: "forage",
      resolutionIndex,
      constraintStatus: "eligible",
      constraintCode: null,
    },
    {
      id: "op:farm",
      sourceReceiptId: "receipt:op:farm",
      action: "farm",
      resolutionIndex,
      constraintStatus: "eligible",
      constraintCode: null,
    },
    {
      id: "op:trade",
      sourceReceiptId: "receipt:op:trade",
      action: "trade",
      resolutionIndex,
      constraintStatus: "eligible",
      constraintCode: null,
    },
    {
      id: "op:migrate",
      sourceReceiptId: "receipt:op:migrate",
      action: "migrate",
      resolutionIndex,
      constraintStatus: "eligible",
      constraintCode: null,
    },
    {
      id: "op:raid",
      sourceReceiptId: "receipt:op:raid",
      action: "raid",
      resolutionIndex,
      constraintStatus: "eligible",
      constraintCode: null,
    },
    {
      id: "op:defend",
      sourceReceiptId: "receipt:op:defend",
      action: "defend",
      resolutionIndex,
      constraintStatus: "eligible",
      constraintCode: null,
    },
    {
      id: "op:fortify",
      sourceReceiptId: "receipt:op:fortify",
      action: "fortify",
      resolutionIndex,
      constraintStatus: "eligible",
      constraintCode: null,
    },
    {
      id: "op:join",
      sourceReceiptId: "receipt:op:join",
      action: "join_group",
      resolutionIndex,
      constraintStatus: "eligible",
      constraintCode: null,
    },
    {
      id: "op:diplomacy",
      sourceReceiptId: "receipt:op:diplomacy",
      action: "diplomacy",
      resolutionIndex,
      constraintStatus: "eligible",
      constraintCode: null,
    },
    {
      id: "op:build",
      sourceReceiptId: "receipt:op:build",
      action: "build",
      resolutionIndex,
      constraintStatus: "eligible",
      constraintCode: null,
    },
    {
      id: "op:buy",
      sourceReceiptId: "receipt:op:buy",
      action: "buy",
      resolutionIndex,
      constraintStatus: "eligible",
      constraintCode: null,
    },
    {
      id: "op:blocked",
      sourceReceiptId: "receipt:op:blocked",
      action: "migrate",
      resolutionIndex,
      constraintStatus: "blocked",
      constraintCode: "ROUTE_UNSAFE",
    },
  ];
}

describe("AIM-546 Need Dynamics & Survival Pressure", () => {
  it("creates a bounded, hash-verified dynamic state rather than a static NPC label", () => {
    const initial = state();
    expect(initial.protocol).toBe(AURION_NEED_DYNAMICS_PROTOCOL);
    expect(initial.needs).toEqual(baseNeeds);
    expect(initial.lifeStatus).toBe("alive");
    expect(initial.stateHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() => assertNeedDynamicsState(initial)).not.toThrow();
    expect(() =>
      assertNeedDynamicsState({
        ...initial,
        stateHash: "sha256:" + "0".repeat(64),
      })
    ).toThrow("NEED_DYNAMICS_STATE_HASH_MISMATCH");
  });

  it("applies the exact integer recurrence and reduces only the confirmed target need", () => {
    const prior = state({ survival: 7_900, hydration: 9_200, health: 1_000 });
    const result = resolveNeedDynamicsStep({
      currentState: prior,
      resolutionIndex: 5,
      pressures: [
        {
          id: "pressure:food:5",
          sourceReceiptId: "receipt:weather:5",
          need: "survival",
          pressureBps: 300,
          decayBps: 150,
          resolutionIndex: 5,
        },
      ],
      impacts: [
        {
          id: "impact:food:5",
          sourceReceiptId: "receipt:drought:5",
          need: "survival",
          magnitudeBps: 900,
          resolutionIndex: 5,
        },
      ],
      satisfactions: [
        {
          id: "satisfaction:food:5",
          sourceReceiptId: "receipt:meal:5",
          confirmationReceiptId: "receipt:meal-confirmed:5",
          need: "survival",
          magnitudeBps: 2_000,
          resolutionIndex: 5,
        },
        {
          id: "satisfaction:water:5",
          sourceReceiptId: "receipt:water:5",
          confirmationReceiptId: "receipt:water-confirmed:5",
          need: "hydration",
          magnitudeBps: 1_700,
          resolutionIndex: 5,
        },
      ],
    });

    // Wolfram reference: clamp(7900 + 300 + 150 + 900 - 2000) = 7250.
    expect(result.nextState.needs.survival).toBe(7_250);
    // Wolfram reference: clamp(9200 - 1700) = 7500.
    expect(result.nextState.needs.hydration).toBe(7_500);
    expect(result.nextState.needs.health).toBe(1_000);
    expect(result.nextState.needs.safety).toBe(prior.needs.safety);
    expect(result.derivedHealthImpacts).toEqual({
      starvationBps: 0,
      dehydrationBps: 0,
    });
  });

  it("is replayable and invariant to input ordering", () => {
    const prior = state({ survival: 7_900, shelter: 6_200, safety: 6_500 });
    const input = {
      currentState: prior,
      resolutionIndex: 5,
      pressures: [
        {
          id: "pressure:shelter:5",
          sourceReceiptId: "receipt:rain:5",
          need: "shelter" as const,
          pressureBps: 100,
          decayBps: 250,
          resolutionIndex: 5,
        },
        {
          id: "pressure:food:5",
          sourceReceiptId: "receipt:weather:5",
          need: "survival" as const,
          pressureBps: 300,
          decayBps: 150,
          resolutionIndex: 5,
        },
      ],
      impacts: [
        {
          id: "impact:safety:5",
          sourceReceiptId: "receipt:raid:5",
          need: "safety" as const,
          magnitudeBps: 700,
          resolutionIndex: 5,
        },
        {
          id: "impact:food:5",
          sourceReceiptId: "receipt:drought:5",
          need: "survival" as const,
          magnitudeBps: 900,
          resolutionIndex: 5,
        },
      ],
      satisfactions: [
        {
          id: "satisfaction:food:5",
          sourceReceiptId: "receipt:meal:5",
          confirmationReceiptId: "receipt:meal-confirmed:5",
          need: "survival" as const,
          magnitudeBps: 2_000,
          resolutionIndex: 5,
        },
      ],
      opportunities: opportunities(5),
    };
    const first = resolveNeedDynamicsStep(input);
    const replay = resolveNeedDynamicsStep({
      ...input,
      pressures: [...input.pressures].reverse(),
      impacts: [...input.impacts].reverse(),
      satisfactions: [...input.satisfactions].reverse(),
      opportunities: [...input.opportunities].reverse(),
    });

    expect(first).toEqual(replay);
    expect(verifyNeedDynamicsReplay(first, replay)).toBe(true);
    expect(first.resolutionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.nextState.stateHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("derives deterministic starvation, dehydration, health criticality, and death", () => {
    const prior = state(
      { survival: 9_200, hydration: 9_200, health: 8_500 },
      1
    );
    const result = resolveNeedDynamicsStep({
      currentState: prior,
      resolutionIndex: 2,
      pressures: [],
      impacts: [],
      satisfactions: [],
      opportunities: opportunities(2),
    });

    // Wolfram reference: floor((9200 - 8000)/2) = 600; floor(3*(9200 - 8000)/4) = 900.
    expect(result.derivedHealthImpacts).toEqual({
      starvationBps: 600,
      dehydrationBps: 900,
    });
    expect(result.nextState.needs.health).toBe(10_000);
    expect(result.nextState.lifeStatus).toBe("dead");
    expect(result.nextState.conditions).toEqual([
      "starving",
      "dehydrated",
      "health_critical",
      "dead",
    ]);
    expect(result.candidates).toEqual([]);
    expect(() =>
      resolveNeedDynamicsStep({
        currentState: result.nextState,
        resolutionIndex: 3,
        pressures: [],
        impacts: [],
        satisfactions: [],
      })
    ).toThrow("NEED_DYNAMICS_DEAD_ENTITY");
  });

  it("generates the required receipt-backed action candidates at need thresholds", () => {
    const current = state(
      { survival: 7_100, safety: 6_800, shelter: 6_900 },
      5
    );
    const candidates = deriveNeedDynamicsActionCandidates({
      state: current,
      opportunities: opportunities(5),
    });
    const actionsFor = (need: string) =>
      candidates
        .filter(candidate => candidate.need === need)
        .map(candidate => candidate.action)
        .sort();

    expect(NEED_DYNAMICS_ACTION_THRESHOLD_BPS).toBe(6_000);
    expect(actionsFor("survival")).toEqual([
      "farm",
      "forage",
      "migrate",
      "raid",
      "trade",
    ]);
    expect(actionsFor("safety")).toEqual([
      "defend",
      "diplomacy",
      "fortify",
      "join_group",
      "migrate",
    ]);
    expect(actionsFor("shelter")).toEqual(["build", "buy", "migrate"]);
    expect(
      candidates.some(candidate => candidate.opportunityId === "op:blocked")
    ).toBe(false);
    expect(
      candidates.every(candidate =>
        candidate.sourceReceiptId.startsWith("receipt:op:")
      )
    ).toBe(true);
  });

  it("rejects an unsupported direct city command and never emits one", () => {
    const current = state({ survival: 7_000 }, 5);
    expect(() =>
      deriveNeedDynamicsActionCandidates({
        state: current,
        opportunities: [
          {
            id: "op:found-city",
            sourceReceiptId: "receipt:found-city",
            action: "found_city",
            resolutionIndex: 5,
            constraintStatus: "eligible",
            constraintCode: null,
          } as unknown as NeedDynamicsActionOpportunity,
        ],
      })
    ).toThrow();
    const candidates = deriveNeedDynamicsActionCandidates({
      state: current,
      opportunities: opportunities(5),
    });
    expect(candidates.map(candidate => candidate.action)).not.toContain(
      "found_city"
    );
  });

  it("clamps both boundaries without floating point drift", () => {
    const high = resolveNeedDynamicsStep({
      currentState: state({ survival: 9_800 }),
      resolutionIndex: 5,
      pressures: [
        {
          id: "pressure:high",
          sourceReceiptId: "receipt:high",
          need: "survival",
          pressureBps: 800,
          decayBps: 0,
          resolutionIndex: 5,
        },
      ],
      impacts: [],
      satisfactions: [],
    });
    const low = resolveNeedDynamicsStep({
      currentState: state({ survival: 200 }),
      resolutionIndex: 5,
      pressures: [
        {
          id: "pressure:low",
          sourceReceiptId: "receipt:low",
          need: "survival",
          pressureBps: -500,
          decayBps: 0,
          resolutionIndex: 5,
        },
      ],
      impacts: [],
      satisfactions: [],
    });
    // Wolfram reference: clamp(9800 + 800) = 10000; clamp(200 - 500) = 0.
    expect(high.nextState.needs.survival).toBe(10_000);
    expect(low.nextState.needs.survival).toBe(0);
  });

  it("fails closed on unconfirmed satisfactions, duplicate receipt inputs, and non-sequential transitions", () => {
    const prior = state();
    const satisfaction = {
      id: "satisfaction:1",
      sourceReceiptId: "receipt:meal:1",
      confirmationReceiptId: "receipt:meal-confirmed:1",
      need: "survival" as const,
      magnitudeBps: 500,
      resolutionIndex: 5,
    };
    expect(() =>
      resolveNeedDynamicsStep({
        currentState: prior,
        resolutionIndex: 5,
        pressures: [],
        impacts: [],
        satisfactions: [satisfaction, satisfaction],
      })
    ).toThrow("NEED_DYNAMICS_SATISFACTION_DUPLICATE");
    expect(() =>
      resolveNeedDynamicsStep({
        currentState: prior,
        resolutionIndex: 5,
        pressures: [],
        impacts: [],
        satisfactions: [
          satisfaction,
          { ...satisfaction, id: "satisfaction:second" },
        ],
      })
    ).toThrow("NEED_DYNAMICS_SATISFACTION_CONFIRMATION_DUPLICATE");
    expect(() =>
      resolveNeedDynamicsStep({
        currentState: prior,
        resolutionIndex: 5,
        pressures: [],
        impacts: [],
        satisfactions: [{ ...satisfaction, confirmationReceiptId: "" }],
      })
    ).toThrow();
    expect(() =>
      resolveNeedDynamicsStep({
        currentState: prior,
        resolutionIndex: 6,
        pressures: [],
        impacts: [],
        satisfactions: [],
      })
    ).toThrow("NEED_DYNAMICS_RESOLUTION_INDEX_NOT_NEXT");
  });
});
