import { describe, it, expect } from "vitest";
import {
  CapacityEnvelopeService,
  CANONICAL_SCENARIOS,
} from "./capacityEnvelopeService";

describe("Aurion Performance & Capacity Envelope (Step 41)", () => {
  const service = new CapacityEnvelopeService();

  it("Evaluates SCENARIO A (1 player / 25 NPCs) comfortably within 10Hz tick budget", () => {
    const res = service.evaluateScenario(CANONICAL_SCENARIOS.SCENARIO_A);
    expect(res.status).toBe("HEALTHY");
    expect(res.tickDurationP95Ms).toBeLessThan(50); // Well under 100ms
    expect(res.tickOverrunCount).toBe(0);
  });

  it("Evaluates SCENARIO B (25 players / 250 NPCs) within 10Hz tick budget", () => {
    const res = service.evaluateScenario(CANONICAL_SCENARIOS.SCENARIO_B);
    expect(res.status).toBe("HEALTHY");
    expect(res.tickDurationP95Ms).toBeLessThan(100);
    expect(res.tickOverrunCount).toBe(0);
  });

  it("Evaluates SCENARIO C (100 players / 1000 NPCs) and detects capacity ceiling saturation", () => {
    const res = service.evaluateScenario(CANONICAL_SCENARIOS.SCENARIO_C);
    expect(res.status).toBe("TICK_BUDGET_EXCEEDED");
    expect(res.tickDurationP95Ms).toBeGreaterThan(100);
    expect(res.tickOverrunCount).toBeGreaterThan(0);
  });

  it("Generates Full Envelope Report identifying when Sharding is justified", () => {
    const report = service.generateFullEnvelope();
    expect(report.scenarios.length).toBe(3);
    expect(report.shardingRequired).toBe(true);
    expect(report.saturationBoundaryPlayerCount).toBe(50);
  });
});
