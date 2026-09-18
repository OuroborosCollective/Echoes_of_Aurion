import { describe, it, expect } from "vitest";
import { buildWorldContextCapsule } from "./assembler";
import { replayWorldContextCapsule } from "./replay";
import { hashWorldContextQuery } from "../../shared/aurionWorldContextCanonicalHash";
import type {
  CanonicalContextSource,
  WorldContextQuery,
} from "../../shared/aurionWorldContextContract";
import { AURION_REPLAY_VERDICT_SCHEMA } from "../../shared/aurionReplayContract";

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
      expect(verdict.schemaVersion).toBe(AURION_REPLAY_VERDICT_SCHEMA);
      expect(verdict.domain).toBe("WORLD_CONTEXT");
      expect(verdict.scopeIdentity).toMatchObject({ worldId, actorId: "npc_archivist", capsuleHash: capsule.capsuleHash });
      expect(verdict.range).toEqual({ fromTick: 600, toTick: 600 });
      expect(verdict.capsuleHash).toBe(capsule.capsuleHash);
      expect(verdict.verifiedStages).toEqual([
        "QUERY_CONTRACT",
        "SOURCE_SCOPE",
        "SOURCE_ROOT_HASH",
        "SELECTED_SOURCE_COUNT",
        "SELECTED_SOURCE_ROOT_HASH",
        "OMITTED_SOURCE_ROOT_HASH",
        "CAPSULE_HASH",
      ]);
      expect(verdict.stagesVerified).toBe(verdict.verifiedStages.length);
      expect(verdict.firstDivergentStage).toBeNull();
      expect(verdict.reason).toBeNull();
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
    if (verdict.status === "FIRST_DIVERGENCE") {
      expect(verdict.firstDivergentStage).toBe("SOURCE_ROOT_HASH");
      expect(verdict.verifiedStages).toEqual(["QUERY_CONTRACT", "SOURCE_SCOPE"]);
      expect(verdict.expectedHash).toBe(capsule.sourceRootHash);
      expect(verdict.observedHash).not.toBe(capsule.sourceRootHash);
      expect(verdict.reason).toBeNull();
    }
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
    if (verdict.status === "UNPROVABLE") {
      expect(verdict.domain).toBe("WORLD_CONTEXT");
      expect(verdict.reason).toBe("WORLD_CONTEXT_SOURCE_EVIDENCE_MISSING");
      expect(verdict.verifiedStages).toEqual(["QUERY_CONTRACT"]);
      expect(verdict.firstDivergentStage).toBeNull();
      expect(verdict.expectedHash).toBeNull();
      expect(verdict.observedHash).toBeNull();
    }
  });
});
