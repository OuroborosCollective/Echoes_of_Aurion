import { describe, it, expect } from "vitest";
import {
  NpcMemorySourceAdapter,
  SemanticGraphSourceAdapter,
  WorldFactsSourceAdapter,
  collectCanonicalSources,
} from "./sourceAdapter";
import type {
  CanonicalContextSource,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";

describe("AIM-299: World Context Source Adapters", () => {
  const sampleQuery: WorldContextQuery = {
    schemaVersion: "aurion.world-context-query.v1",
    worldId: "world_aurion_1",
    worldRevision: "rev_1",
    logicalTick: 100,
    actorId: "npc_elena",
    purpose: "npc_dialogue",
    subjectIds: ["player_42"],
    queryHash: "a".repeat(64),
    policyVersion: "aurion.context-importance.v1",
    budget: {
      maxEstimatedTokens: 1000,
      maxUtf8Bytes: 8000,
      tokenizerId: "aurion-default-v1",
    },
  };

  it("gathers and sorts sources across multiple adapters deterministically", async () => {
    const memorySources: CanonicalContextSource[] = [
      {
        sourceId: "src_fact_2",
        sourceHash: "b".repeat(64),
        kind: "world_fact",
        evidenceClass: "verified",
        worldId: "world_aurion_1",
        actorIds: ["npc_elena"],
        logicalSequence: 50,
        canonicalText: "Trade outpost established at southern ridge.",
      },
      {
        sourceId: "src_fact_1",
        sourceHash: "c".repeat(64),
        kind: "world_fact",
        evidenceClass: "verified",
        worldId: "world_aurion_1",
        actorIds: ["npc_elena"],
        logicalSequence: 20,
        canonicalText: "Scout Elena arrived at settlement.",
      },
    ];

    const collected = await collectCanonicalSources({
      query: sampleQuery,
      additionalSources: memorySources,
    });

    expect(collected.length).toBe(2);
    expect(collected[0].sourceId).toBe("src_fact_1");
    expect(collected[1].sourceId).toBe("src_fact_2");
  });

  it("fails closed with SCOPE_VIOLATION when a source belongs to another world", async () => {
    const crossWorldSource: CanonicalContextSource = {
      sourceId: "src_alien_world",
      sourceHash: "d".repeat(64),
      kind: "world_fact",
      evidenceClass: "verified",
      worldId: "world_foreign_99",
      actorIds: ["npc_elena"],
      logicalSequence: 10,
      canonicalText: "Leaked fact from another world.",
    };

    await expect(
      collectCanonicalSources({
        query: sampleQuery,
        additionalSources: [crossWorldSource],
      })
    ).rejects.toThrow("SCOPE_VIOLATION");
  });
});
