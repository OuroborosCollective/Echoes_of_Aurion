import { describe, expect, it } from "vitest";
import {
  FORBIDDEN_IDENTIFIERS,
  runUtilityPlannerGuard,
  scanPlannerSource,
  scanSourceForForbiddenFunctions,
  validateContextBps,
  type GuardResult,
} from "./npcUtilityPlannerGuard";
import { makeCandidate } from "./npcUtilityPlanner";
import type { NpcUtilityPlannerContext } from "../shared/npcUtilityPlannerProtocol";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RECEIPT = "npc_guard_test_001";

function validContext(overrides: Partial<NpcUtilityPlannerContext> = {}): NpcUtilityPlannerContext {
  return {
    sourceReceiptId: RECEIPT,
    resolutionIndex: 1,
    needs: {
      safety: 0.8,
      resources: 0.5,
      belonging: 0.4,
      status: 0.3,
      wealth: 0.3,
      power: 0.2,
    },
    hungerBps: 2000,
    fatigueBps: 1500,
    candidates: [
      makeCandidate({
        id: "c1",
        action: "trade",
        goal: "trade",
        needPressureBps: 7000,
        benefitBps: 5000,
        riskBps: 2000,
        costBps: 1000,
        sourceReceiptId: RECEIPT,
      }),
    ],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// BPS integer validation
// ---------------------------------------------------------------------------

describe("Utility Planner Guard — BPS integer validation", () => {
  it("passes for a valid context with integer BPS values", () => {
    const violations = validateContextBps(validContext());
    expect(violations).toHaveLength(0);
  });

  it("detects non-integer hungerBps", () => {
    const violations = validateContextBps(validContext({ hungerBps: 2000.5 }));
    expect(violations).toHaveLength(1);
    expect(violations[0].field).toBe("hungerBps");
    expect(violations[0].reason).toBe("not a safe integer");
  });

  it("detects out-of-range BPS values", () => {
    const violations = validateContextBps(validContext({ fatigueBps: 10001 }));
    expect(violations).toHaveLength(1);
    expect(violations[0].field).toBe("fatigueBps");
    expect(violations[0].reason).toContain("out of range");
  });

  it("detects non-integer candidate BPS fields", () => {
    const badCandidate = makeCandidate({
      id: "bad",
      action: "trade",
      goal: "trade",
      needPressureBps: 7000.7,
      benefitBps: 5000,
      riskBps: 2000,
      costBps: 1000,
      sourceReceiptId: RECEIPT,
    });
    const violations = validateContextBps(validContext({ candidates: [badCandidate] }));
    expect(violations).toHaveLength(1);
    expect(violations[0].field).toBe("candidate.bad.needPressureBps");
  });

  it("detects missing personality bonus values", () => {
    const violations = validateContextBps(
      validContext({ personalityBonusBps: { trade: undefined } }),
    );
    // undefined values are skipped, not violations
    expect(violations).toHaveLength(0);
  });

  it("detects non-integer personality bonus", () => {
    const violations = validateContextBps(
      validContext({ personalityBonusBps: { trade: 1500.5 } }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].field).toBe("personalityBonusBps.trade");
  });

  it("detects out-of-range goal persistence bonus", () => {
    const violations = validateContextBps(
      validContext({ goalPersistenceBonusBps: -1 }),
    );
    expect(violations).toHaveLength(1);
    expect(violations[0].field).toBe("goalPersistenceBonusBps");
  });
});

// ---------------------------------------------------------------------------
// Forbidden function scan
// ---------------------------------------------------------------------------

describe("Utility Planner Guard — forbidden function scan", () => {
  it("finds no forbidden functions in the actual planner source", () => {
    const violations = scanPlannerSource();
    expect(violations).toHaveLength(0);
  });

  it("detects Date.now in source text", () => {
    const source = "const now = Date.now();";
    const found = scanSourceForForbiddenFunctions(source);
    expect(found).toContain("Date.now");
  });

  it("detects Math.random in source text", () => {
    const source = "const r = Math.random();";
    const found = scanSourceForForbiddenFunctions(source);
    expect(found).toContain("Math.random");
  });

  it("detects crypto.randomUUID in source text", () => {
    const source = "const id = crypto.randomUUID();";
    const found = scanSourceForForbiddenFunctions(source);
    expect(found).toContain("crypto.randomUUID");
  });

  it("detects performance.now in source text", () => {
    const source = "const t = performance.now();";
    const found = scanSourceForForbiddenFunctions(source);
    expect(found).toContain("performance.now");
  });

  it("detects new Date() in source text", () => {
    const source = "const d = new Date();";
    const found = scanSourceForForbiddenFunctions(source);
    expect(found).toContain("new Date(");
  });

  it("detects multiple forbidden functions at once", () => {
    const source = `
      const a = Date.now();
      const b = Math.random();
      const c = performance.now();
    `;
    const found = scanSourceForForbiddenFunctions(source);
    expect(found).toHaveLength(3);
  });

  it("returns empty array for clean source", () => {
    const source = "const x = 42; const y = x * 2;";
    const found = scanSourceForForbiddenFunctions(source);
    expect(found).toHaveLength(0);
  });

  it("FORBIDDEN_IDENTIFIERS covers all expected primitives", () => {
    expect(FORBIDDEN_IDENTIFIERS).toContain("Date.now");
    expect(FORBIDDEN_IDENTIFIERS).toContain("Math.random");
    expect(FORBIDDEN_IDENTIFIERS).toContain("crypto.randomUUID");
    expect(FORBIDDEN_IDENTIFIERS).toContain("process.hrtime");
    expect(FORBIDDEN_IDENTIFIERS).toContain("performance.now");
    expect(FORBIDDEN_IDENTIFIERS).toContain("new Date(");
  });
});

// ---------------------------------------------------------------------------
// Combined guard
// ---------------------------------------------------------------------------

describe("Utility Planner Guard — combined guard", () => {
  it("passes for a valid context and clean planner source", () => {
    const result = runUtilityPlannerGuard(validContext());
    expect(result.passed).toBe(true);
    expect(result.bpsViolations).toHaveLength(0);
    expect(result.forbiddenFunctionViolations).toHaveLength(0);
    expect(result.checkedFields).toBeGreaterThan(0);
  });

  it("fails when BPS values are invalid", () => {
    const result = runUtilityPlannerGuard(validContext({ hungerBps: 1.5 }));
    expect(result.passed).toBe(false);
    expect(result.bpsViolations.length).toBeGreaterThan(0);
  });

  it("fails when forbidden functions are found in source text", () => {
    const dirtySource = "const x = Date.now();";
    const result = runUtilityPlannerGuard(validContext(), dirtySource);
    expect(result.passed).toBe(false);
    expect(result.forbiddenFunctionViolations).toContain("Date.now");
  });

  it("reports checkedFields count correctly", () => {
    const context = validContext({
      candidates: [
        makeCandidate({ id: "a", action: "trade", goal: "trade", needPressureBps: 1000, benefitBps: 2000, riskBps: 500, costBps: 100, sourceReceiptId: RECEIPT }),
        makeCandidate({ id: "b", action: "rest", goal: "seek_safety", needPressureBps: 2000, benefitBps: 1000, riskBps: 200, costBps: 0, sourceReceiptId: RECEIPT }),
      ],
      personalityBonusBps: { trade: 500 },
      goalPersistenceBonusBps: 1000,
    });
    const result = runUtilityPlannerGuard(context);
    // 2 context fields + 2 candidates * 4 fields + 1 personality + 1 persistence = 12
    expect(result.checkedFields).toBe(12);
  });

  it("returns a frozen result object", () => {
    const result = runUtilityPlannerGuard(validContext());
    expect(Object.isFrozen(result)).toBe(true);
  });
});
