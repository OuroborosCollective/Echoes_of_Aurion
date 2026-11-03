import { beforeEach, describe, expect, it, vi } from "vitest";

type Plan = Readonly<{ marketHubId: string; action: string; destination: string | null; ambushed: boolean; currentHubId: string; stabilityDelta: number }>;

const state = vi.hoisted(() => ({
  plans: new Map<string, Plan>(),
  civilizationError: null as Error | null,
  civilizationCalls: [] as unknown[][],
}));

const npcFor = (hubId: string) => `ax1_merchant_${hubId}`;

vi.mock("../ax1LivingWorldRuntime", () => ({
  resolveAndRecordAx1LivingWorld: async ({ regionId }: { regionId: string }) => {
    const plan = state.plans.get(regionId)!;
    return {
      status: "committed",
      actionReceiptId: `action:${regionId}`,
      effectReadbackHash: "e".repeat(64),
      resolution: {
        market: { hubId: plan.marketHubId },
        npc: { currentHubId: plan.currentHubId },
        action: plan.action,
        caravan: { destination: plan.destination, securityIndex: 50, ambushed: plan.ambushed },
        stabilityDelta: plan.stabilityDelta,
      },
      npc: { decision: { decisionHash: `d:${regionId}` }, lifeState: { stateHash: `s:${regionId}` }, multiMemory: { memoryHash: `m:${regionId}` } },
      world: { deterministicHash: `w:${regionId}` },
    };
  },
}));
vi.mock("../npcActionGatewayPersistence", () => ({
  readConfirmedMerchantActionSource: async (npcId: string) => ({ receiptId: `source:${npcId}`, resolutionIndex: 4 }),
}));
vi.mock("../wasdAurionRuntime", () => ({
  resolveAndRecordNpc: async () => { throw new Error("GENESIS_NOT_EXPECTED"); },
  readConfirmedNpcState: async (npcId: string) => {
    const hubId = npcId.replace("ax1_merchant_", "");
    const plan = state.plans.get(hubId)!;
    return {
      decision: { resolutionIndex: 5, decisionHash: `d:${hubId}`, goal: "trade" },
      lifeState: { stateHash: `s:${hubId}`, currentGoal: "trade", longTermGoal: "wealth", economy: { currentHubId: plan.currentHubId } },
    };
  },
}));
vi.mock("../npcMultiMemoryPersistence", () => ({
  readConfirmedNpcMultiMemory: async (npcId: string) => ({ lastResolutionIndex: 5, memoryHash: `m:${npcId.replace("ax1_merchant_", "")}` }),
}));
vi.mock("./civilizationService", () => ({
  orchestrateCivilizationLoop: async (...args: unknown[]) => {
    state.civilizationCalls.push(args);
    if (state.civilizationError) throw state.civilizationError;
    return { action: "ADVANCED", civilizationId: "civ" };
  },
}));

const { executeLivingHistoryCycle } = await import("./livingHistoryLoop");

describe("Living History Loop economic attribution", () => {
  beforeEach(() => {
    state.civilizationError = null;
    state.civilizationCalls = [];
    state.plans = new Map<string, Plan>([
      // The windhollow merchant travelled earlier and now trades in the emberfall market.
      ["windhollow", { marketHubId: "emberfall", action: "trade", destination: null, ambushed: false, currentHubId: "emberfall", stabilityDelta: 1 }],
      ["emberfall", { marketHubId: "emberfall", action: "trade", destination: null, ambushed: false, currentHubId: "emberfall", stabilityDelta: 1 }],
      ["observatory_threshold", { marketHubId: "observatory_threshold", action: "caravan", destination: "cinder_vault", ambushed: false, currentHubId: "cinder_vault", stabilityDelta: 1 }],
      ["cinder_vault", { marketHubId: "cinder_vault", action: "rest", destination: null, ambushed: false, currentHubId: "cinder_vault", stabilityDelta: 0 }],
    ]);
  });

  it("derives interactions and signals from the market each NPC acted in", async () => {
    const result = await executeLivingHistoryCycle(600, 7);

    expect(result.interactions.filter(i => i.kind === "trade").map(i => [i.hubId, i.sourceNpcId, i.targetNpcId])).toEqual([
      ["emberfall", npcFor("windhollow"), npcFor("emberfall")],
    ]);
    expect(result.interactions.filter(i => i.kind === "caravan_pressure").map(i => [i.hubId, i.targetNpcId])).toEqual([
      ["cinder_vault", npcFor("cinder_vault")],
    ]);
    const hubs = Object.fromEntries(result.economicImpact!.hubs.map(hub => [hub.hubId, hub]));
    expect(hubs.emberfall).toMatchObject({ signalCount: 2, tradeVolume: 0.08 });
    expect(hubs.windhollow).toMatchObject({ signalCount: 0, tradeVolume: 0 });
    expect(hubs.cinder_vault).toMatchObject({ caravanActivity: 1 });
    expect(state.civilizationCalls).toHaveLength(1);
    expect(state.civilizationCalls[0][3]).toBe(result.economicImpact);
    expect(result).toMatchObject({ civilizationAction: "ADVANCED", failureCode: null });
  });

  it("applies no caravan pressure when the caravan was ambushed", async () => {
    state.plans.set("observatory_threshold", { marketHubId: "observatory_threshold", action: "caravan", destination: "cinder_vault", ambushed: true, currentHubId: "observatory_threshold", stabilityDelta: -2 });
    const result = await executeLivingHistoryCycle(600, 7);
    expect(result.interactions.filter(i => i.kind === "caravan_pressure")).toEqual([]);
    const observatory = result.economicImpact!.hubs.find(hub => hub.hubId === "observatory_threshold")!;
    expect(observatory.hazardPressure).toBe(0.5);
  });

  it("reports a failed civilization orchestration instead of returning a clean cycle", async () => {
    state.civilizationError = new Error("CIVILIZATION_TRANSITION_CONFLICT");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const result = await executeLivingHistoryCycle(600, 7);
    warn.mockRestore();
    expect(result.civilizationAction).toBeNull();
    expect(result.failureCode).toBe("CIVILIZATION_ORCHESTRATION_FAILED:CIVILIZATION_TRANSITION_CONFLICT");
    expect(result.entries.every(entry => entry.status === "confirmed")).toBe(true);
  });
});
