import { describe, it, expect } from "vitest";
import { runWorldContextEvaluationSuite } from "./evaluation";

describe("AIM-299: Context Capsule Evaluation Suite", () => {
  it("passes 100% critical fact recall, 0 scope violations, and 100% replay match rate", async () => {
    const metrics = await runWorldContextEvaluationSuite();

    expect(metrics.totalScenarios).toBeGreaterThanOrEqual(2);
    expect(metrics.criticalFactRecall).toBe(1.0);
    expect(metrics.scopeViolationCount).toBe(0);
    expect(metrics.replayMatchRate).toBe(1.0);
    expect(metrics.averageCompressionRatioTokens).toBeLessThan(1.0);
    expect(metrics.passed).toBe(true);
  });
});
