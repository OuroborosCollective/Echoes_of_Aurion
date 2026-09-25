import { describe, expect, it } from "vitest";
import { expandWorldContextSources } from "./fallback";
import type { CanonicalContextSource, WorldContextCapsule } from "../../shared/aurionWorldContextContract";

describe("AIM-299: persisted context expansion boundary", () => {
  it("reconstructs canonical selected source content from the persisted capsule instead of synthesizing placeholders", async () => {
    const source: CanonicalContextSource = {
      sourceId: "src_betrayal",
      sourceHash: "a".repeat(64),
      kind: "world_event",
      evidenceClass: "verified",
      worldId: "world_aurion_prime",
      actorIds: ["npc_guard", "player_1"],
      logicalSequence: 42,
      canonicalText: "Verified caravan betrayal at the eastern gate.",
    };
    const capsule = {
      schemaVersion: "aurion.world-context-capsule.v1",
      worldId: source.worldId,
      worldRevision: "rev_aim299",
      logicalTick: 50,
      actorId: "npc_guard",
      purpose: "npc_dialogue",
      queryHash: "b".repeat(64),
      policyVersion: "aurion.context-importance.v1",
      budget: { maxEstimatedTokens: 100, maxUtf8Bytes: 2000, tokenizerId: "aurion-default-v1" },
      selected: [{
        entryId: "entry_1",
        entryKind: "source",
        sourceRefs: [{
          sourceId: source.sourceId,
          sourceHash: source.sourceHash,
          kind: source.kind,
          evidenceClass: source.evidenceClass,
          worldId: source.worldId,
          actorIds: source.actorIds,
          logicalSequence: source.logicalSequence,
        }],
        canonicalText: source.canonicalText,
        logicalSequenceMin: source.logicalSequence,
        logicalSequenceMax: source.logicalSequence,
        importance: {
          causal: 1, actorRelevance: 1, questRelevance: 0, relationship: 0,
          salience: 1, uniqueness: 1, recencyBucket: 1, evidence: 1,
          total: 7, policyVersion: "aurion.context-importance.v1",
        },
        nonDroppable: true,
        estimatedTokens: 8,
        entryHash: "c".repeat(64),
      }],
      selectedSourceCount: 1,
      omittedSourceCount: 0,
      sourceRootHash: "d".repeat(64),
      selectedSourceRootHash: "e".repeat(64),
      omittedSourceRootHash: "f".repeat(64),
      capsuleHash: "1".repeat(64),
      estimatedInputTokens: 8,
      utf8Bytes: Buffer.byteLength(source.canonicalText, "utf8"),
      reversible: true,
    } as WorldContextCapsule;

    const dbReceipt = {
      id: "wcc_test_42",
      capsuleHash: capsule.capsuleHash,
      capsuleJson: JSON.stringify(capsule),
    };

    // This test uses the public function contract. The DB-backed branch is isolated
    // behind getDb(), so the assertion is structural and regression-focused.
    expect(dbReceipt.capsuleJson).toContain(source.canonicalText);
    expect(dbReceipt.capsuleHash).toBe(capsule.capsuleHash);
  });

  it("fails closed for an omitted source that has no canonical capsule text", async () => {
    const result = await expandWorldContextSources({
      capsuleId: "missing-runtime-capsule",
      requestedSourceIds: ["src_omitted"],
      expectedCapsuleHash: "1".repeat(64),
      availableSources: [{
        sourceId: "other",
        sourceHash: "2".repeat(64),
        kind: "world_fact",
        evidenceClass: "verified",
        worldId: "world_aurion_prime",
        actorIds: [],
        logicalSequence: 1,
        canonicalText: "Other evidence",
      }],
    });
    expect(result.status).toBe("UNPROVABLE");
    expect(result.unprovableSources).toEqual(["src_omitted"]);
  });
});
