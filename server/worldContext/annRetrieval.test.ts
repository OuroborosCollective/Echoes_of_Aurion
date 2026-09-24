import { describe, expect, it } from "vitest";
import {
  DEFAULT_ANN_CONFIG,
  DeterministicHnswIndex,
  deterministicTextVector,
  searchCanonicalContextSources,
  verifyCanonicalSources,
} from "./deterministicAnnRetrieval";
import { hashCanonicalSource } from "../../shared/aurionWorldContextCanonicalHash";
import type { CanonicalContextSource } from "../../shared/aurionWorldContextContract";

function source(sourceId: string, text: string): CanonicalContextSource {
  const draft: Omit<CanonicalContextSource, "sourceHash"> = {
    sourceId,
    kind: "world_fact",
    evidenceClass: "verified",
    worldId: "world_aurion_prime",
    actorIds: ["npc_test"],
    logicalSequence: Number(sourceId.replace(/\D/g, "")) || 0,
    canonicalText: text,
    metadata: {},
  };
  return { ...draft, sourceHash: hashCanonicalSource(draft) };
}

describe("deterministic semantic ANN retrieval", () => {
  it("produces byte-stable vectors", () => {
    expect(Array.from(deterministicTextVector("Aurion clockwork woods", 96)))
      .toEqual(Array.from(deterministicTextVector("Aurion clockwork woods", 96)));
  });

  it("rejects a forged canonical source hash", () => {
    const valid = source("s1", "The observatory watches the northern gate.");
    expect(() => verifyCanonicalSources([{
      ...valid,
      canonicalText: "forged",
    }])).toThrow("AURION_ANN_SOURCE_HASH_MISMATCH");
  });

  it("rejects duplicate source identity", () => {
    const valid = source("s1", "The observatory watches the northern gate.");
    expect(() => verifyCanonicalSources([valid, valid])).toThrow("AURION_ANN_DUPLICATE_SOURCE_ID");
  });

  it("is deterministic across build order", () => {
    const items = [
      source("s1", "clockwork woods and northern gate"),
      source("s2", "forge district bronze weapons"),
      source("s3", "southern river caravan"),
      source("s4", "observatory aether research"),
      source("s5", "guild bank treasury"),
    ];
    const a = searchCanonicalContextSources(items, "clockwork woods", 3);
    const b = searchCanonicalContextSources([...items].reverse(), "clockwork woods", 3);
    expect(a.receipt.indexHash).toBe(b.receipt.indexHash);
    expect(a.receipt.exactResultHash).toBe(b.receipt.exactResultHash);
    expect(a.receipt.results).toEqual(b.receipt.results);
  });

  it("readbacks exact results after ANN candidate generation", () => {
    const items = [
      source("s1", "clockwork woods and northern gate"),
      source("s2", "forge district bronze weapons"),
      source("s3", "southern river caravan"),
      source("s4", "observatory aether research"),
      source("s5", "guild bank treasury"),
    ];
    const result = searchCanonicalContextSources(items, "clockwork woods", 2);
    expect(result.receipt.exactRescore).toBe(true);
    expect(result.receipt.candidateCount).toBeGreaterThanOrEqual(2);
    expect(result.receipt.returnedCount).toBe(2);
    expect(result.sources.map((item) => item.sourceId)).toEqual(
      result.receipt.results.map((item) => item.sourceId),
    );
  });

  it("matches exact brute force on a deterministic fixture when efSearch covers the fixture", () => {
    const items = [
      { id: "a", sourceHash: "a".repeat(64), text: "red crystal northern shrine" },
      { id: "b", sourceHash: "b".repeat(64), text: "blue crystal southern forge" },
      { id: "c", sourceHash: "c".repeat(64), text: "red crystal northern gate" },
      { id: "d", sourceHash: "d".repeat(64), text: "golden river caravan" },
    ];
    const index = new DeterministicHnswIndex(items, {
      ...DEFAULT_ANN_CONFIG,
      efSearch: 64,
    });
    const exactTexts = new Map(items.map((item) => [item.id, item.text] as const));
    const actual = index.search("red crystal northern", 2, exactTexts).exact.map((item) => item.sourceId);

    const query = deterministicTextVector("red crystal northern", 96);
    const expected = items.map((item) => ({
      id: item.id,
      similarity: 1 - (() => {
        const vector = deterministicTextVector(item.text, 96);
        let dot = 0; let qn = 0; let vn = 0;
        for (let i = 0; i < 96; i += 1) {
          dot += query[i]! * vector[i]!;
          qn += query[i]! * query[i]!;
          vn += vector[i]! * vector[i]!;
        }
        return 1 - (qn && vn ? dot / Math.sqrt(qn * vn) : 0);
      })(),
    })).sort((a, b) => b.similarity - a.similarity || a.id.localeCompare(b.id)).slice(0, 2).map((item) => item.id);

    expect(actual).toEqual(expected);
  });

  it("fails closed on empty query and exposes a stable receipt schema", () => {
    const item = source("s1", "clockwork observatory");
    expect(() => searchCanonicalContextSources([item], "   ", 1)).toThrow("AURION_ANN_QUERY_EMPTY");
    const result = searchCanonicalContextSources([item], "clockwork", 1);
    expect(result.receipt.schemaVersion).toBe("aurion.semantic-ann-retrieval.v1");
    expect(result.receipt.exactRescore).toBe(true);
  });
});
