import { describe, it, expect } from "vitest";
import {
  compareContextSources,
  isSourceNonDroppable,
  scoreContextSource,
} from "./importancePolicy";
import type {
  CanonicalContextSource,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";

describe("AIM-299: Importance Policy & Deterministic Sorting", () => {
  const query: WorldContextQuery = {
    schemaVersion: "aurion.world-context-query.v1",
    worldId: "world_aurion_1",
    worldRevision: "rev_1",
    logicalTick: 500,
    actorId: "npc_smith",
    purpose: "npc_dialogue",
    subjectIds: ["player_1"],
    queryHash: "0".repeat(64),
    policyVersion: "aurion.context-importance.v1",
    budget: {
      maxEstimatedTokens: 1000,
      maxUtf8Bytes: 8000,
      tokenizerId: "aurion-default-v1",
    },
  };

  const highSalienceBetrayal: CanonicalContextSource = {
    sourceId: "src_betrayal",
    sourceHash: "1".repeat(64),
    kind: "world_event",
    evidenceClass: "verified",
    worldId: "world_aurion_1",
    actorIds: ["npc_smith", "player_1"],
    logicalSequence: 450,
    canonicalText: "High-Salience Betrayal: Player sabotaged the fortress gate.",
    nonDroppable: true,
  };

  const trivialGreeting: CanonicalContextSource = {
    sourceId: "src_greeting",
    sourceHash: "2".repeat(64),
    kind: "world_event",
    evidenceClass: "observed",
    worldId: "world_aurion_1",
    actorIds: ["npc_smith", "player_1"],
    logicalSequence: 490,
    canonicalText: "Trivial encounter: Player waved at smith.",
  };

  it("scores high-salience events significantly higher than trivial greetings", () => {
    const scoreBetrayal = scoreContextSource(highSalienceBetrayal, query);
    const scoreGreeting = scoreContextSource(trivialGreeting, query);

    expect(scoreBetrayal.total).toBeGreaterThan(scoreGreeting.total);
    expect(scoreBetrayal.causal).toBeGreaterThan(scoreGreeting.causal);
  });

  it("marks betrayal and critical subjects as non-droppable", () => {
    expect(isSourceNonDroppable(highSalienceBetrayal, query)).toBe(true);
    expect(isSourceNonDroppable(trivialGreeting, query)).toBe(false);
  });

  it("sorts deterministically regardless of input array order", () => {
    const items = [
      {
        source: trivialGreeting,
        importance: scoreContextSource(trivialGreeting, query),
        nonDroppable: isSourceNonDroppable(trivialGreeting, query),
      },
      {
        source: highSalienceBetrayal,
        importance: scoreContextSource(highSalienceBetrayal, query),
        nonDroppable: isSourceNonDroppable(highSalienceBetrayal, query),
      },
    ];

    const sorted1 = [...items].sort(compareContextSources);
    const sorted2 = [...items].reverse().sort(compareContextSources);

    expect(sorted1[0].source.sourceId).toBe("src_betrayal");
    expect(sorted2[0].source.sourceId).toBe("src_betrayal");
    expect(sorted1).toEqual(sorted2);
  });
});
