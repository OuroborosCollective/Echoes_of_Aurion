import { describe, it, expect } from "vitest";
import { buildWorldContextCapsule } from "./assembler";
import { replayWorldContextCapsule } from "./replay";
import { hashWorldContextQuery } from "../../shared/aurionWorldContextCanonicalHash";
import type {
  CanonicalContextSource,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";

describe("AIM-299: Context Capsule Replay Verification", () => {
  const worldId = "world_aurion_beta";

  const queryDraft = {
    schemaVersion: "aurion.world-context-query.v1" as const,
    worldId,
    worldRevision: "rev_replay_01",
    logicalTick: 600,
    actorId: "npc_archivist",
    purpose: "historical_narrative" as const,
    subjectIds: ["player_1"],
    policyVersion: "aurion.context-importance.v1",
    budget: {
      maxEstimatedTokens: 800,
      maxUtf8Bytes: 6000,
      tokenizerId: "aurion-default-v1",
    },
  };

  const query: WorldContextQuery = {
    ...queryDraft,
    queryHash: hashWorldContextQuery(queryDraft),
  };

  const sources: CanonicalContextSource[] = [
    {
      sourceId: "src_ruin_discovery",
      sourceHash: "a".repeat(64),
      kind: "world_fact",
      evidenceClass: "verified",
      worldId,
      actorIds: ["npc_archivist", "player_1"],
      logicalSequence: 550,
      canonicalText: "Historical Fact: Ancient Solarium gate unearthed at central caldera.",
      nonDroppable: true,
    },
    {
      sourceId: "src_minor_glyph",
      sourceHash: "b".repeat(64),
      kind: "world_fact",
      evidenceClass: "observed",
      worldId,
      actorIds: ["npc_archivist"],
      logicalSequence: 580,
      canonicalText: "Glyph transcription note: Minor solar symbol cataloged.",
    },
  ];

  it("yields MATCH when replaying identical source evidence", async () => {
    const { capsule } = await buildWorldContextCapsule(null, query, {
      additionalSources: sources,
    });

    const verdict = replayWorldContextCapsule({
      expectedCapsule: capsule,
      query,
      sources,
    });

    expect(verdict.status).toBe("MATCH");
    if (verdict.status === "MATCH") {
      expect(verdict.capsuleHash).toBe(capsule.capsuleHash);
      expect(verdict.stagesVerified).toBeGreaterThanOrEqual(4);
    }
  });

  it("detects FIRST_DIVERGENCE when a source fact is altered", async () => {
    const { capsule } = await buildWorldContextCapsule(null, query, {
      additionalSources: sources,
    });

    const modifiedSources = [
      {
        ...sources[0],
        sourceHash: "f".repeat(64), // Altered hash
      },
      sources[1],
    ];

    const verdict = replayWorldContextCapsule({
      expectedCapsule: capsule,
      query,
      sources: modifiedSources,
    });

    expect(verdict.status).toBe("FIRST_DIVERGENCE");
  });

  it("yields UNPROVABLE if sources are missing", async () => {
    const { capsule } = await buildWorldContextCapsule(null, query, {
      additionalSources: sources,
    });

    const verdict = replayWorldContextCapsule({
      expectedCapsule: capsule,
      query,
      sources: [],
    });

    expect(verdict.status).toBe("UNPROVABLE");
  });
});
