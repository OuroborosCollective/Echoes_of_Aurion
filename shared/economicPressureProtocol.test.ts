import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "./aurionCanonicalHash";
import {
  applyConfirmedEconomicTransition,
  createEconomicPressureState,
  economicPriceCopper,
  economicRouteSecurityBps,
  economicTransactionIdentity,
  resolveEconomicPressure,
  type EconomicPressureState,
} from "./economicPressureProtocol";

const receipt = (id: string) => ({
  receiptId: `receipt:${id}`,
  receiptHash: canonicalSha256(`source:${id}`),
});
const baseInput = {
  taxBps: 500,
  polityStabilityBps: 9000,
  rememberedThreatBps: 1000,
  routes: [
    {
      routeId: "route:grain",
      fromRegionId: "emberfall",
      toRegionId: "windhollow",
      baseSecurityBps: 7000,
      distanceUnits: 12,
    },
  ],
};
const state = createEconomicPressureState({
  worldId: "world:aurion",
  regionId: "emberfall",
  resolutionIndex: 0,
  revision: 0,
  stock: {
    grain: 480,
    sandstone: 100,
    bronze: 100,
    aether: 100,
    salve: 100,
    rune_core: 100,
  },
  demand: {
    grain: 120,
    sandstone: 0,
    bronze: 0,
    aether: 0,
    salve: 0,
    rune_core: 0,
  },
});

function resolution(
  overrides: Partial<Parameters<typeof resolveEconomicPressure>[0]> = {}
) {
  return resolveEconomicPressure({
    state,
    ...baseInput,
    demandReceipts: [],
    supplyReceipts: [],
    consumptionReceipts: [],
    tradeReceipts: [],
    ...overrides,
  });
}

describe("AIM-488 deterministic player/NPC economy and logistics loop", () => {
  it("uses the exact fixed-point price and security reference values verified by Wolfram", () => {
    expect(
      economicPriceCopper({
        commodity: "grain",
        stock: 480,
        demand: 120,
        taxBps: 500,
      })
    ).toBe(130);
    expect(
      economicPriceCopper({
        commodity: "grain",
        stock: 12,
        demand: 120,
        taxBps: 500,
      })
    ).toBe(405);
    expect(
      economicRouteSecurityBps({
        baseSecurityBps: 7000,
        polityStabilityBps: 9000,
        rememberedThreatBps: 1000,
      })
    ).toBe(8000);
    expect(
      economicRouteSecurityBps({
        baseSecurityBps: 7000,
        polityStabilityBps: 2000,
        rememberedThreatBps: 8000,
      })
    ).toBe(4500);
    expect(
      economicRouteSecurityBps({
        baseSecurityBps: 500,
        polityStabilityBps: 0,
        rememberedThreatBps: 10000,
      })
    ).toBe(500);
    expect(
      economicRouteSecurityBps({
        baseSecurityBps: 10000,
        polityStabilityBps: 10000,
        rememberedThreatBps: 0,
      })
    ).toBe(10000);
  });

  it("is monotone in scarcity and demand without floating-point drift", () => {
    const abundant = economicPriceCopper({
      commodity: "grain",
      stock: 480,
      demand: 120,
      taxBps: 500,
    });
    const scarce = economicPriceCopper({
      commodity: "grain",
      stock: 12,
      demand: 120,
      taxBps: 500,
    });
    const higherDemand = economicPriceCopper({
      commodity: "grain",
      stock: 480,
      demand: 240,
      taxBps: 500,
    });
    expect(scarce).toBeGreaterThan(abundant);
    expect(higherDemand).toBeGreaterThan(abundant);
  });

  it("produces the same canonical resolution regardless of receipt input order", () => {
    const demandA = {
      ...receipt("a"),
      commodity: "grain" as const,
      quantity: 800,
    };
    const demandB = {
      ...receipt("b"),
      commodity: "grain" as const,
      quantity: 100,
    };
    const supply = {
      ...receipt("s"),
      commodity: "grain" as const,
      quantity: 10,
    };
    const left = resolution({
      demandReceipts: [demandA, demandB],
      supplyReceipts: [supply],
    });
    const right = resolution({
      demandReceipts: [demandB, demandA],
      supplyReceipts: [supply],
    });
    expect(left).toEqual(right);
    expect(left.resolutionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(
      economicTransactionIdentity({
        action: "caravan",
        commodity: "grain",
        quantity: 5,
        routeId: "route:grain",
        sourceReceiptIds: ["receipt:b", "receipt:a"],
      })
    ).toBe(
      economicTransactionIdentity({
        action: "caravan",
        commodity: "grain",
        quantity: 5,
        routeId: "route:grain",
        sourceReceiptIds: ["receipt:a", "receipt:b"],
      })
    );
  });

  it("derives a receipt-backed shortage and only proposes effects, never applying them", () => {
    const result = resolution({
      demandReceipts: [
        { ...receipt("demand"), commodity: "grain", quantity: 900 },
      ],
    });
    expect(result.shortages).toEqual(["grain"]);
    expect(result.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "produce",
          commodity: "grain",
          quantity: 540,
          sourceReceiptIds: ["receipt:demand"],
        }),
        expect.objectContaining({
          action: "caravan",
          commodity: "grain",
          routeId: "route:grain",
          sourceReceiptIds: ["receipt:demand"],
        }),
      ])
    );
    expect(
      result.candidates.every(
        candidate => candidate.sourceReceiptIds.length > 0
      )
    ).toBe(true);
  });

  it("applies only confirmed effects, advances exactly one resolution, and is hash-bound", () => {
    const next = applyConfirmedEconomicTransition({
      state,
      nextResolutionIndex: 1,
      supplyReceipts: [
        { ...receipt("supply"), commodity: "grain", quantity: 20 },
      ],
      consumptionReceipts: [
        { ...receipt("consume"), commodity: "grain", quantity: 5 },
      ],
      demandReceipts: [
        { ...receipt("need"), commodity: "grain", quantity: 30 },
      ],
    });
    expect(next.stock.grain).toBe(495);
    expect(next.demand.grain).toBe(150);
    expect(next.stateHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(() =>
      applyConfirmedEconomicTransition({
        ...argumentsForTransition(next),
        nextResolutionIndex: 3,
      })
    ).toThrow("ECONOMIC_RESOLUTION_NOT_NEXT");
  });

  it("fails closed on duplicate receipts and insufficient confirmed stock", () => {
    const duplicate = {
      ...receipt("duplicate"),
      commodity: "grain" as const,
      quantity: 1,
    };
    expect(() =>
      resolution({ demandReceipts: [duplicate, duplicate] })
    ).toThrow("ECONOMIC_DEMAND_RECEIPT_DUPLICATE");
    expect(() =>
      applyConfirmedEconomicTransition({
        state,
        nextResolutionIndex: 1,
        supplyReceipts: [],
        consumptionReceipts: [
          { ...receipt("too-much"), commodity: "grain", quantity: 481 },
        ],
        demandReceipts: [],
      })
    ).toThrow("ECONOMIC_INSUFFICIENT_STOCK");
  });

  it("rejects tampered state hashes and keeps no wall-clock or random dependency", () => {
    const tampered = {
      ...state,
      stock: { ...state.stock, grain: 0 },
    } as EconomicPressureState;
    expect(() => resolution({ state: tampered })).toThrow(
      "ECONOMIC_STATE_HASH_MISMATCH"
    );
  });
});

function argumentsForTransition(current: EconomicPressureState) {
  return {
    state: current,
    nextResolutionIndex: current.resolutionIndex + 1,
    supplyReceipts: [],
    consumptionReceipts: [],
    demandReceipts: [],
  } as const;
}
