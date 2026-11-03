import { afterEach, describe, expect, it, vi } from "vitest";

// The lifecycle loop is replaced only to drive the runtime's diagnostic wiring;
// this test asserts logging, never NPC truth.
const loop = vi.hoisted(() => ({ entries: [] as Array<Record<string, unknown>>, civilizationAction: null as string | null, failureCode: null as string | null }));
vi.mock("./aurion/livingHistoryLoop.js", async importOriginal => ({
  ...(await importOriginal<typeof import("./aurion/livingHistoryLoop.js")>()),
  executeLivingHistoryCycle: async () => ({ entries: loop.entries, interactions: [], interactionsHash: null, economicImpact: null, civilizationAction: loop.civilizationAction, failureCode: loop.failureCode }),
}));
vi.mock("./wasdAurionRuntime", () => ({ readConfirmedNpcState: async () => null }));
vi.mock("./npcActionGatewayPersistence", () => ({ readConfirmedMerchantActionSource: async () => null }));
vi.mock("./npcMultiMemoryPersistence", () => ({ readConfirmedNpcMultiMemory: async () => null }));
vi.mock("./aurion/npcGuildRuntime.js", () => ({ createNpcGuildRuntime: () => ({ executeCycle: async () => undefined, readback: () => null }) }));

const { createAutonomousNpcLifeRuntime, AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS, AUTONOMOUS_NPC_LIFE_NPC_ID } = await import("./autonomousNpcLifeRuntime");

const entry = (status: string, failureCode: string | null) => ({
  hubId: "observatory_threshold", npcId: AUTONOMOUS_NPC_LIFE_NPC_ID, status, action: null, goal: null, longTermGoal: null,
  resolutionIndex: null, decisionHash: null, worldReactionHash: null, actionReceiptId: null, effectReadbackHash: null, receiptSource: null, failureCode,
});

describe("autonomous NPC life runtime degradation logging", () => {
  afterEach(() => { vi.restoreAllMocks(); loop.civilizationAction = null; loop.failureCode = null; });

  it("logs a coded degradation once and keeps the lifecycle readback unchanged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const runtime = createAutonomousNpcLifeRuntime({ enabled: true });
    loop.entries = [entry("degraded", "NPC_SEMANTIC_GRAPH_PROVENANCE_CONFLICT")];
    for (let cycle = 1; cycle <= 3; cycle++) await runtime.resolveOnce({ tick: cycle * AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS });
    const lines = warn.mock.calls.map(call => String(call[0])).filter(line => line.startsWith("[NpcLife] "));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0].slice("[NpcLife] DEGRADED ".length))).toMatchObject({
      event: "degraded", npcId: AUTONOMOUS_NPC_LIFE_NPC_ID, failureCode: "NPC_SEMANTIC_GRAPH_PROVENANCE_CONFLICT", consecutiveCycles: 1, cycle: 1,
    });
    expect(runtime.readback()).toMatchObject({ status: "degraded", failureCode: "NPC_SEMANTIC_GRAPH_PROVENANCE_CONFLICT", livingHistoryCycle: 3 });
  });

  it("logs a failed civilization step of the cycle and its recovery", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const runtime = createAutonomousNpcLifeRuntime({ enabled: true });
    loop.entries = [entry("confirmed", null)];
    loop.failureCode = "CIVILIZATION_ORCHESTRATION_FAILED:CIVILIZATION_TRANSITION_CONFLICT";
    await runtime.resolveOnce({ tick: AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS });
    const degraded = warn.mock.calls.map(call => String(call[0])).filter(line => line.startsWith("[NpcLife] DEGRADED "));
    expect(degraded).toHaveLength(1);
    expect(JSON.parse(degraded[0].slice("[NpcLife] DEGRADED ".length))).toMatchObject({
      npcId: "aurion_civilization_loop", failureCode: loop.failureCode, consecutiveCycles: 1, cycle: 1,
    });

    // IDLE records no civilization transition and must not count as recovery.
    loop.failureCode = null;
    loop.civilizationAction = "IDLE";
    await runtime.resolveOnce({ tick: 2 * AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS });
    const recoveredLines = () => info.mock.calls.map(call => String(call[0])).filter(line => line.startsWith("[NpcLife] RECOVERED "));
    expect(recoveredLines()).toHaveLength(0);

    loop.civilizationAction = "ADVANCED";
    await runtime.resolveOnce({ tick: 3 * AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS });
    const recovered = recoveredLines();
    expect(recovered).toHaveLength(1);
    expect(JSON.parse(recovered[0].slice("[NpcLife] RECOVERED ".length))).toMatchObject({ npcId: "aurion_civilization_loop", cycle: 3 });
  });
});
