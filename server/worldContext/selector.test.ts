import { describe, it, expect } from "vitest";
import { selectContextEntries } from "./selector";
import type {
  CanonicalContextSource,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";

describe("AIM-299: Deterministic Selector & Budgeting", () => {
  const baseQuery: WorldContextQuery = {
    schemaVersion: "aurion.world-context-query.v1",
    worldId: "world_aurion_1",
    worldRevision: "rev_1",
    logicalTick: 300,
    actorId: "npc_merchant",
    purpose: "npc_dialogue",
    subjectIds: ["player_1"],
    queryHash: "0".repeat(64),
    policyVersion: "aurion.context-importance.v1",
    budget: {
      maxEstimatedTokens: 80,
      maxUtf8Bytes: 600,
      tokenizerId: "aurion-default-v1",
    },
  };

  const sources: CanonicalContextSource[] = [
    {
      sourceId: "src_critical_betrayal",
      sourceHash: "1".repeat(64),
      kind: "world_event",
      evidenceClass: "verified",
      worldId: "world_aurion_1",
      actorIds: ["npc_merchant", "player_1"],
      logicalSequence: 100,
      canonicalText: "Critical Fact: Betrayal of caravan agreement confirmed.",
      nonDroppable: true,
    },
    {
      sourceId: "src_trivial_1",
      sourceHash: "2".repeat(64),
      kind: "world_event",
      evidenceClass: "observed",
      worldId: "world_aurion_1",
      actorIds: ["npc_merchant", "player_1"],
      logicalSequence: 110,
      canonicalText: "Trivial line 1: Weather was sunny at the market.",
    },
    {
      sourceId: "src_trivial_2",
      sourceHash: "3".repeat(64),
      kind: "world_event",
      evidenceClass: "observed",
      worldId: "world_aurion_1",
      actorIds: ["npc_merchant", "player_1"],
      logicalSequence: 120,
      canonicalText: "Trivial line 2: Cart wheels inspected by apprentice.",
    },
  ];

  it("always includes non-droppable critical facts", () => {
    const result = selectContextEntries(sources, baseQuery);
    const selectedIds = result.selectedSources.map(s => s.sourceId);

    expect(selectedIds).toContain("src_critical_betrayal");
    expect(result.selectedEntries.length).toBeGreaterThanOrEqual(1);
    expect(result.estimatedInputTokens).toBeLessThanOrEqual(baseQuery.budget.maxEstimatedTokens);
  });

  it("throws BUDGET_TOO_SMALL_FOR_CRITICAL_CONTEXT if critical facts cannot fit", () => {
    const impossibleQuery: WorldContextQuery = {
      ...baseQuery,
      budget: {
        maxEstimatedTokens: 2, // Too small to hold critical text
        maxUtf8Bytes: 10,
        tokenizerId: "aurion-default-v1",
      },
    };

    expect(() => selectContextEntries(sources, impossibleQuery)).toThrow(
      "BUDGET_TOO_SMALL_FOR_CRITICAL_CONTEXT"
    );
  });
});
