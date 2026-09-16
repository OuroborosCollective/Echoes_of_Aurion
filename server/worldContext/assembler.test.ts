import { describe, it, expect } from "vitest";
import { buildWorldContextCapsule } from "./assembler";
import { hashWorldContextQuery } from "../../shared/aurionWorldContextCanonicalHash";
import type {
  CanonicalContextSource,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";

describe("AIM-299: Context Capsule Assembler", () => {
  const worldId = "world_aurion_alpha";

  const queryDraft = {
    schemaVersion: "aurion.world-context-query.v1" as const,
    worldId,
    worldRevision: "rev_2026_09",
    logicalTick: 500,
    actorId: "npc_guard_captain",
    purpose: "npc_dialogue" as const,
    subjectIds: ["player_99"],
    policyVersion: "aurion.context-importance.v1",
    budget: {
      maxEstimatedTokens: 500,
      maxUtf8Bytes: 4000,
      tokenizerId: "aurion-default-v1",
    },
  };

  const query: WorldContextQuery = {
    ...queryDraft,
    queryHash: hashWorldContextQuery(queryDraft),
  };

  const sources: CanonicalContextSource[] = [
    {
      sourceId: "src_gate_incident",
      sourceHash: "9".repeat(64),
      kind: "world_event",
      evidenceClass: "verified",
      worldId,
      actorIds: ["npc_guard_captain", "player_99"],
      logicalSequence: 480,
      canonicalText: "Gate incident: Player alerted garrison to infiltration.",
      nonDroppable: true,
    },
    {
      sourceId: "src_patrol_log",
      sourceHash: "8".repeat(64),
      kind: "world_event",
      evidenceClass: "observed",
      worldId,
      actorIds: ["npc_guard_captain"],
      logicalSequence: 490,
      canonicalText: "Routine patrol log: East wall secured.",
    },
  ];

  it("builds an immutable, hash-bound WorldContextCapsule", async () => {
    const { capsule, selectionResult } = await buildWorldContextCapsule(null, query, {
      additionalSources: sources,
    });

    expect(capsule.schemaVersion).toBe("aurion.world-context-capsule.v1");
    expect(capsule.worldId).toBe(worldId);
    expect(capsule.actorId).toBe("npc_guard_captain");
    expect(capsule.selectedSourceCount).toBeGreaterThanOrEqual(1);
    expect(capsule.capsuleHash).toMatch(/^[a-f0-9]{64}$/);
    expect(capsule.reversible).toBe(true);

    // Reproducibility test
    const secondRun = await buildWorldContextCapsule(null, query, {
      additionalSources: [...sources].reverse(),
    });
    expect(secondRun.capsule.capsuleHash).toBe(capsule.capsuleHash);
    expect(secondRun.capsule.sourceRootHash).toBe(capsule.sourceRootHash);
  });
});
