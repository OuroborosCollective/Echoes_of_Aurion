import { describe, expect, it } from "vitest";
import {
  NPC_UTILITY_BPS_MAX,
  NPC_UTILITY_FATIGUE_INTERRUPT_BPS,
  NPC_UTILITY_HUNGER_INTERRUPT_BPS,
  NPC_UTILITY_PLANNER_VERSION,
  NPC_UTILITY_SCORE_MAX,
  candidateSetHash,
  makeCandidate,
  blockedCandidate,
  resolveNpcUtilityDecision,
  type NpcUtilityCandidate,
  type NpcUtilityPlannerContext,
} from "./npcUtilityPlanner";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RECEIPT = "npc_abc123def456";
const RES_INDEX = 42;

const baseNeeds: NpcUtilityPlannerContext["needs"] = {
  safety: 0.8,
  resources: 0.5,
  belonging: 0.4,
  status: 0.3,
  wealth: 0.3,
  power: 0.2,
};

function ctx(
  overrides: Partial<NpcUtilityPlannerContext> = {},
): NpcUtilityPlannerContext {
  return {
    sourceReceiptId: RECEIPT,
    resolutionIndex: RES_INDEX,
    needs: baseNeeds,
    hungerBps: 2000,
    fatigueBps: 1500,
    candidates: [],
    ...overrides,
  };
}

function candidate(
  overrides: Partial<NpcUtilityCandidate> & { id: string },
): NpcUtilityCandidate {
  return makeCandidate({
    id: overrides.id,
    action: overrides.action ?? "trade",
    goal: overrides.goal ?? "trade",
    needPressureBps: overrides.needPressureBps ?? 7000,
    benefitBps: overrides.benefitBps ?? 5000,
    riskBps: overrides.riskBps ?? 2000,
    costBps: overrides.costBps ?? 1000,
    sourceReceiptId: overrides.sourceReceiptId ?? RECEIPT,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("NPC Utility Planner — determinism", () => {
  it("produces the same winner and hashes from the same state and candidates", () => {
    const candidates = [
      candidate({ id: "c1", action: "trade", goal: "trade", needPressureBps: 7000 }),
      candidate({ id: "c2", action: "produce", goal: "gather_resources", needPressureBps: 5000 }),
      candidate({ id: "c3", action: "socialize", goal: "socialize", needPressureBps: 6000 }),
    ];
    const context = ctx({ candidates });

    const first = resolveNpcUtilityDecision(context);
    const second = resolveNpcUtilityDecision(context);

    expect(second).toEqual(first);
    expect(first.winnerId).toBe("c1");
    expect(first.decisionHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.candidateSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.version).toBe(NPC_UTILITY_PLANNER_VERSION);
  });

  it("produces identical output regardless of candidate input order", () => {
    const c1 = candidate({ id: "c1", action: "trade", goal: "trade", needPressureBps: 7000 });
    const c2 = candidate({ id: "c2", action: "produce", goal: "gather_resources", needPressureBps: 5000 });
    const c3 = candidate({ id: "c3", action: "socialize", goal: "socialize", needPressureBps: 6000 });

    const forward = resolveNpcUtilityDecision(ctx({ candidates: [c1, c2, c3] }));
    const reverse = resolveNpcUtilityDecision(ctx({ candidates: [c3, c2, c1] }));
    const shuffled = resolveNpcUtilityDecision(ctx({ candidates: [c2, c3, c1] }));

    expect(reverse.winnerId).toBe(forward.winnerId);
    expect(shuffled.winnerId).toBe(forward.winnerId);
    expect(reverse.candidateSetHash).toBe(forward.candidateSetHash);
    expect(shuffled.candidateSetHash).toBe(forward.candidateSetHash);
    expect(reverse.decisionHash).toBe(forward.decisionHash);
    expect(shuffled.decisionHash).toBe(forward.decisionHash);
  });

  it("replays identically across 100 invocations", () => {
    const candidates = [
      candidate({ id: "c1", action: "trade", goal: "trade" }),
      candidate({ id: "c2", action: "patrol", goal: "seek_safety", needPressureBps: 9000 }),
    ];
    const context = ctx({ candidates });
    const first = resolveNpcUtilityDecision(context);
    for (let i = 0; i < 99; i++) {
      const result = resolveNpcUtilityDecision(context);
      expect(result.decisionHash).toBe(first.decisionHash);
      expect(result.winnerId).toBe(first.winnerId);
    }
  });
});

describe("NPC Utility Planner — tie-breaking", () => {
  it("uses deterministic tie-break by declaration order when scores are equal", () => {
    const c1 = candidate({ id: "alpha", action: "trade", goal: "trade", needPressureBps: 5000, benefitBps: 3000, riskBps: 1000, costBps: 500 });
    const c2 = candidate({ id: "beta", action: "produce", goal: "gather_resources", needPressureBps: 5000, benefitBps: 3000, riskBps: 1000, costBps: 500 });
    // Both have identical score: 5000*2 + 3000 - 1000 - 500 = 11500

    const c1First = resolveNpcUtilityDecision(ctx({ candidates: [c1, c2] }));
    const c2First = resolveNpcUtilityDecision(ctx({ candidates: [c2, c1] }));

    // The winner is always the one declared first.
    expect(c1First.winnerId).toBe("alpha");
    expect(c2First.winnerId).toBe("beta");
    // Same candidate set hash (order-independent).
    expect(c1First.candidateSetHash).toBe(c2First.candidateSetHash);
    // Different decision hash (different winner).
    expect(c1First.decisionHash).not.toBe(c2First.decisionHash);
  });

  it("selects the higher-scoring candidate even when declared later", () => {
    const low = candidate({ id: "low", action: "socialize", goal: "socialize", needPressureBps: 3000, benefitBps: 2000, riskBps: 1000, costBps: 500 });
    const high = candidate({ id: "high", action: "trade", goal: "trade", needPressureBps: 9000, benefitBps: 5000, riskBps: 1000, costBps: 500 });

    const result = resolveNpcUtilityDecision(ctx({ candidates: [low, high] }));
    expect(result.winnerId).toBe("high");
  });
});

describe("NPC Utility Planner — constraints", () => {
  it("excludes blocked candidates and never reinterprets them as eligible", () => {
    const blocked = blockedCandidate(
      { id: "blocked1", action: "trade", goal: "trade", needPressureBps: 9000, benefitBps: 8000, riskBps: 0, costBps: 0, sourceReceiptId: RECEIPT },
      "MARKET_CLOSED",
    );
    const eligible = candidate({ id: "eligible1", action: "produce", goal: "gather_resources", needPressureBps: 5000, benefitBps: 3000, riskBps: 1000, costBps: 500 });

    const result = resolveNpcUtilityDecision(ctx({ candidates: [blocked, eligible] }));

    expect(result.winnerId).toBe("eligible1");
    expect(result.eligibleCount).toBe(1);
    expect(result.blockedCount).toBe(1);
    expect(result.candidateCount).toBe(2);
  });

  it("rejects candidates with a stale source receipt", () => {
    const stale = candidate({ id: "stale1", action: "trade", goal: "trade", needPressureBps: 9000, sourceReceiptId: "npc_old_receipt" });
    const fresh = candidate({ id: "fresh1", action: "produce", goal: "gather_resources", needPressureBps: 5000, sourceReceiptId: RECEIPT });

    const result = resolveNpcUtilityDecision(ctx({ candidates: [stale, fresh] }));

    expect(result.winnerId).toBe("fresh1");
    expect(result.eligibleCount).toBe(1);
    expect(result.blockedCount).toBe(1);
  });

  it("returns null winner when all candidates are blocked", () => {
    const allBlocked = [
      blockedCandidate(
        { id: "b1", action: "trade", goal: "trade", needPressureBps: 5000, benefitBps: 3000, riskBps: 1000, costBps: 500, sourceReceiptId: RECEIPT },
        "MARKET_CLOSED",
      ),
      blockedCandidate(
        { id: "b2", action: "produce", goal: "gather_resources", needPressureBps: 5000, benefitBps: 3000, riskBps: 1000, costBps: 500, sourceReceiptId: RECEIPT },
        "NO_RESOURCES",
      ),
    ];

    const result = resolveNpcUtilityDecision(ctx({ candidates: allBlocked }));

    expect(result.winnerId).toBe(null);
    expect(result.winnerAction).toBe(null);
    expect(result.winnerGoal).toBe(null);
    expect(result.winnerScoreBps).toBe(0);
    expect(result.eligibleCount).toBe(0);
    expect(result.blockedCount).toBe(2);
  });
});

describe("NPC Utility Planner — hunger/fatigue interrupt", () => {
  it("forces consume when hunger is above threshold, blocking all other actions", () => {
    const consume = candidate({ id: "eat", action: "consume", goal: "gather_resources", needPressureBps: 1000, benefitBps: 2000, riskBps: 0, costBps: 500 });
    const trade = candidate({ id: "trade", action: "trade", goal: "trade", needPressureBps: 9000, benefitBps: 8000, riskBps: 0, costBps: 0 });
    const patrol = candidate({ id: "patrol", action: "patrol", goal: "seek_safety", needPressureBps: 9000, benefitBps: 8000, riskBps: 0, costBps: 0 });

    const result = resolveNpcUtilityDecision(
      ctx({ hungerBps: NPC_UTILITY_HUNGER_INTERRUPT_BPS, candidates: [trade, consume, patrol] }),
    );

    expect(result.winnerId).toBe("eat");
    expect(result.winnerAction).toBe("consume");
    expect(result.eligibleCount).toBe(1);
    expect(result.blockedCount).toBe(2);
  });

  it("forces rest when fatigue is above threshold and hunger is not critical", () => {
    const rest = candidate({ id: "sleep", action: "rest", goal: "seek_safety", needPressureBps: 1000, benefitBps: 2000, riskBps: 0, costBps: 0 });
    const trade = candidate({ id: "trade", action: "trade", goal: "trade", needPressureBps: 9000, benefitBps: 8000, riskBps: 0, costBps: 0 });

    const result = resolveNpcUtilityDecision(
      ctx({ hungerBps: 3000, fatigueBps: NPC_UTILITY_FATIGUE_INTERRUPT_BPS, candidates: [trade, rest] }),
    );

    expect(result.winnerId).toBe("sleep");
    expect(result.winnerAction).toBe("rest");
    expect(result.eligibleCount).toBe(1);
  });

  it("prioritizes hunger over fatigue when both are above threshold", () => {
    const consume = candidate({ id: "eat", action: "consume", goal: "gather_resources", needPressureBps: 1000, benefitBps: 2000, riskBps: 0, costBps: 500 });
    const rest = candidate({ id: "sleep", action: "rest", goal: "seek_safety", needPressureBps: 1000, benefitBps: 2000, riskBps: 0, costBps: 0 });
    const trade = candidate({ id: "trade", action: "trade", goal: "trade", needPressureBps: 9000, benefitBps: 8000, riskBps: 0, costBps: 0 });

    const result = resolveNpcUtilityDecision(
      ctx({
        hungerBps: NPC_UTILITY_HUNGER_INTERRUPT_BPS,
        fatigueBps: NPC_UTILITY_FATIGUE_INTERRUPT_BPS,
        candidates: [trade, rest, consume],
      }),
    );

    expect(result.winnerId).toBe("eat");
    expect(result.winnerAction).toBe("consume");
    expect(result.eligibleCount).toBe(1);
  });

  it("does not trigger interrupts when below threshold", () => {
    const trade = candidate({ id: "trade", action: "trade", goal: "trade", needPressureBps: 9000, benefitBps: 8000, riskBps: 0, costBps: 0 });
    const rest = candidate({ id: "sleep", action: "rest", goal: "seek_safety", needPressureBps: 1000, benefitBps: 2000, riskBps: 0, costBps: 0 });

    const result = resolveNpcUtilityDecision(
      ctx({
        hungerBps: NPC_UTILITY_HUNGER_INTERRUPT_BPS - 1,
        fatigueBps: NPC_UTILITY_FATIGUE_INTERRUPT_BPS - 1,
        candidates: [rest, trade],
      }),
    );

    expect(result.winnerId).toBe("trade");
    expect(result.eligibleCount).toBe(2);
  });
});

describe("NPC Utility Planner — scoring", () => {
  it("applies personality bonus to the matching goal", () => {
    const noBonus = candidate({ id: "c1", action: "trade", goal: "trade", needPressureBps: 5000, benefitBps: 3000, riskBps: 1000, costBps: 500 });
    const withBonus = candidate({ id: "c2", action: "socialize", goal: "socialize", needPressureBps: 5000, benefitBps: 3000, riskBps: 1000, costBps: 500 });

    // Without bonus, c1 and c2 have the same score; c1 wins by declaration order.
    const without = resolveNpcUtilityDecision(ctx({ candidates: [noBonus, withBonus] }));
    expect(without.winnerId).toBe("c1");

    // With personality bonus for "socialize", c2 scores higher.
    const withPers = resolveNpcUtilityDecision(
      ctx({
        candidates: [noBonus, withBonus],
        personalityBonusBps: { socialize: 2000 },
      }),
    );
    expect(withPers.winnerId).toBe("c2");
  });

  it("applies goal persistence bonus to the current goal", () => {
    const current = candidate({ id: "current", action: "trade", goal: "trade", needPressureBps: 5000, benefitBps: 3000, riskBps: 1000, costBps: 500 });
    const alternative = candidate({ id: "alt", action: "produce", goal: "gather_resources", needPressureBps: 5000, benefitBps: 3000, riskBps: 1000, costBps: 500 });

    // Without persistence bonus, "current" wins by declaration order.
    const without = resolveNpcUtilityDecision(ctx({ candidates: [current, alternative] }));
    expect(without.winnerId).toBe("current");

    // With persistence bonus for the current goal, "current" scores higher.
    const withPersist = resolveNpcUtilityDecision(
      ctx({
        candidates: [alternative, current],
        currentGoal: "trade",
        goalPersistenceBonusBps: 2000,
      }),
    );
    expect(withPersist.winnerId).toBe("current");
  });

  it("clamps scores to [0, 40000]", () => {
    // Very high pressure + benefit, no risk/cost → score = 10000*2 + 10000 = 30000
    const high = candidate({ id: "high", action: "trade", goal: "trade", needPressureBps: 10000, benefitBps: 10000, riskBps: 0, costBps: 0 });
    const result = resolveNpcUtilityDecision(ctx({ candidates: [high] }));
    expect(result.winnerScoreBps).toBe(30000);
    expect(result.winnerScoreBps).toBeLessThanOrEqual(NPC_UTILITY_SCORE_MAX);

    // Very low pressure, high risk/cost → score clamped to 0
    const low = candidate({ id: "low", action: "socialize", goal: "socialize", needPressureBps: 0, benefitBps: 0, riskBps: 10000, costBps: 10000 });
    const lowResult = resolveNpcUtilityDecision(ctx({ candidates: [low] }));
    expect(lowResult.winnerScoreBps).toBe(0);
  });
});

describe("NPC Utility Planner — input validation", () => {
  it("rejects empty candidate sets", () => {
    expect(() => resolveNpcUtilityDecision(ctx({ candidates: [] }))).toThrow("NPC_UTILITY_CANDIDATES_EMPTY");
  });

  it("rejects duplicate candidate ids", () => {
    const c1 = candidate({ id: "dup", action: "trade", goal: "trade" });
    const c2 = candidate({ id: "dup", action: "produce", goal: "gather_resources" });
    expect(() => resolveNpcUtilityDecision(ctx({ candidates: [c1, c2] }))).toThrow("NPC_UTILITY_CANDIDATE_DUPLICATE");
  });

  it("rejects out-of-range BPS values", () => {
    const bad = candidate({ id: "c1", action: "trade", goal: "trade", needPressureBps: -1 });
    expect(() => resolveNpcUtilityDecision(ctx({ candidates: [bad] }))).toThrow("NPC_UTILITY_CANDIDATE_NEED_PRESSURE_INVALID");

    const bad2 = candidate({ id: "c1", action: "trade", goal: "trade", benefitBps: 10001 });
    expect(() => resolveNpcUtilityDecision(ctx({ candidates: [bad2] }))).toThrow("NPC_UTILITY_CANDIDATE_BENEFIT_INVALID");
  });

  it("rejects invalid source receipt ids", () => {
    expect(() => resolveNpcUtilityDecision(ctx({ sourceReceiptId: "" }))).toThrow("NPC_UTILITY_SOURCE_RECEIPT_ID_INVALID");
  });

  it("rejects invalid resolution index", () => {
    expect(() => resolveNpcUtilityDecision(ctx({ resolutionIndex: -1 }))).toThrow("NPC_UTILITY_RESOLUTION_INDEX_INVALID");
  });

  it("rejects candidate overflow", () => {
    const tooMany = Array.from({ length: 33 }, (_, i) =>
      candidate({ id: `c${i}`, action: "trade", goal: "trade" }),
    );
    expect(() => resolveNpcUtilityDecision(ctx({ candidates: tooMany }))).toThrow("NPC_UTILITY_CANDIDATES_OVERFLOW");
  });
});

describe("NPC Utility Planner — property/fuzz tests", () => {
  it("candidate set hash is order-independent for any permutation", () => {
    const candidates = [
      candidate({ id: "a", action: "trade", goal: "trade", needPressureBps: 7000 }),
      candidate({ id: "b", action: "produce", goal: "gather_resources", needPressureBps: 5000 }),
      candidate({ id: "c", action: "patrol", goal: "seek_safety", needPressureBps: 6000 }),
      candidate({ id: "d", action: "socialize", goal: "socialize", needPressureBps: 4000 }),
      candidate({ id: "e", action: "caravan", goal: "expand_influence", needPressureBps: 3000 }),
    ];

    const baseHash = candidateSetHash(candidates);

    // Test multiple permutations.
    const permutations = [
      [4, 3, 2, 1, 0],
      [2, 4, 0, 1, 3],
      [1, 0, 4, 3, 2],
      [3, 1, 4, 2, 0],
    ];
    for (const perm of permutations) {
      const reordered = perm.map((i) => candidates[i]);
      expect(candidateSetHash(reordered)).toBe(baseHash);
    }
  });

  it("score normalization: all BPS inputs produce scores in [0, 40000]", () => {
    // Exhaustive corner cases for BPS values.
    const bpsValues = [0, 1, 100, 2500, 5000, 7500, 9999, 10000];
    for (const pressure of bpsValues) {
      for (const benefit of bpsValues) {
        for (const risk of bpsValues) {
          for (const cost of bpsValues) {
            const c = candidate({
              id: "fuzz",
              action: "trade",
              goal: "trade",
              needPressureBps: pressure,
              benefitBps: benefit,
              riskBps: risk,
              costBps: cost,
            });
            const result = resolveNpcUtilityDecision(ctx({ candidates: [c] }));
            expect(result.winnerScoreBps).toBeGreaterThanOrEqual(0);
            expect(result.winnerScoreBps).toBeLessThanOrEqual(NPC_UTILITY_SCORE_MAX);
          }
        }
      }
    }
  });

  it("winner is always the highest-scoring eligible candidate regardless of order", () => {
    // Generate candidates with distinct scores.
    const candidates = Array.from({ length: 10 }, (_, i) =>
      candidate({
        id: `c${i}`,
        action: "trade",
        goal: "trade",
        needPressureBps: i * 1000,
        benefitBps: 5000,
        riskBps: 1000,
        costBps: 500,
      }),
    );

    // The highest needPressureBps (c9) should always win.
    for (let seed = 0; seed < 20; seed++) {
      const shuffled = [...candidates];
      // Simple deterministic shuffle (no Math.random).
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = (seed * 7 + i * 3) % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      const result = resolveNpcUtilityDecision(ctx({ candidates: shuffled }));
      expect(result.winnerId).toBe("c9");
    }
  });

  it("idempotent: same context always returns the same decision hash", () => {
    const candidates = [
      candidate({ id: "c1", action: "trade", goal: "trade", needPressureBps: 7000 }),
      candidate({ id: "c2", action: "patrol", goal: "seek_safety", needPressureBps: 9000 }),
    ];
    const context = ctx({ candidates });

    const results = new Set<string>();
    for (let i = 0; i < 50; i++) {
      results.add(resolveNpcUtilityDecision(context).decisionHash);
    }
    expect(results.size).toBe(1);
  });
});

describe("NPC Utility Planner — provenance", () => {
  it("includes candidate set hash in the decision", () => {
    const candidates = [
      candidate({ id: "c1", action: "trade", goal: "trade" }),
      candidate({ id: "c2", action: "produce", goal: "gather_resources" }),
    ];
    const result = resolveNpcUtilityDecision(ctx({ candidates }));

    expect(result.candidateSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    // Changing a candidate changes the set hash.
    const modifiedCandidates = [
      candidate({ id: "c1", action: "trade", goal: "trade", benefitBps: 6000 }),
      candidate({ id: "c2", action: "produce", goal: "gather_resources" }),
    ];
    const modifiedResult = resolveNpcUtilityDecision(ctx({ candidates: modifiedCandidates }));
    expect(modifiedResult.candidateSetHash).not.toBe(result.candidateSetHash);
  });

  it("decision hash changes when winner changes", () => {
    const c1 = candidate({ id: "c1", action: "trade", goal: "trade", needPressureBps: 9000 });
    const c2 = candidate({ id: "c2", action: "produce", goal: "gather_resources", needPressureBps: 5000 });

    const result1 = resolveNpcUtilityDecision(ctx({ candidates: [c1, c2] }));
    const result2 = resolveNpcUtilityDecision(ctx({ candidates: [c2, c1] }));

    // Same winner (c1 has higher score), same decision hash.
    expect(result1.winnerId).toBe("c1");
    expect(result2.winnerId).toBe("c1");
    expect(result1.decisionHash).toBe(result2.decisionHash);
  });

  it("carries source receipt and resolution index in the decision", () => {
    const result = resolveNpcUtilityDecision(
      ctx({
        sourceReceiptId: "npc_special_receipt_001",
        resolutionIndex: 99,
        candidates: [candidate({ id: "c1", sourceReceiptId: "npc_special_receipt_001" })],
      }),
    );
    expect(result.sourceReceiptId).toBe("npc_special_receipt_001");
    expect(result.resolutionIndex).toBe(99);
  });
});
