import { describe, it, expect } from "vitest";
import {
  compactStructuredEpisode,
  episodeToCanonicalSource,
} from "./episodeCompactor";
import type { CanonicalContextSource } from "../../shared/aurionWorldContextContract";

describe("AIM-299: Structured Episode Compactor", () => {
  const worldId = "world_aurion_1";

  const rawSources: CanonicalContextSource[] = [
    {
      sourceId: "ev_caravan_attack",
      sourceHash: "a".repeat(64),
      kind: "world_event",
      evidenceClass: "verified",
      worldId,
      actorIds: ["player_42", "npc_merchant_1"],
      logicalSequence: 100,
      canonicalText: "Bandit raiders attacked the south pass caravan.",
    },
    {
      sourceId: "ev_bandits_defeated",
      sourceHash: "b".repeat(64),
      kind: "world_event",
      evidenceClass: "verified",
      worldId,
      actorIds: ["player_42"],
      logicalSequence: 120,
      canonicalText: "Player defeated bandit vanguard.",
    },
    {
      sourceId: "ev_prisoner_rescued",
      sourceHash: "c".repeat(64),
      kind: "world_event",
      evidenceClass: "verified",
      worldId,
      actorIds: ["player_42", "npc_apprentice"],
      logicalSequence: 130,
      canonicalText: "Player rescued kidnapped apprentice.",
    },
  ];

  it("compacts raw source sequence into a verifiable structured episode", () => {
    const episode = compactStructuredEpisode({
      episodeId: "ep_caravan_crisis_01",
      kind: "caravan_bandit_crisis",
      worldId,
      actorIds: ["player_42", "npc_merchant_1", "npc_apprentice"],
      sources: rawSources,
      outcomes: ["caravan_saved", "bandits_neutralized", "apprentice_rescued"],
      relationshipEffects: [
        {
          from: "npc_merchant_1",
          to: "player_42",
          relation: "trust",
          confirmedDelta: 40,
        },
      ],
      tags: ["combat", "rescue", "trade"],
      canonicalSummary: "Player defended the south caravan and rescued the apprentice.",
    });

    expect(episode.episodeId).toBe("ep_caravan_crisis_01");
    expect(episode.sourceSequenceMin).toBe(100);
    expect(episode.sourceSequenceMax).toBe(130);
    expect(episode.sourceRefs.length).toBe(3);
    expect(episode.episodeHash).toMatch(/^[a-f0-9]{64}$/);

    // Transforming to canonical source
    const canonical = episodeToCanonicalSource(episode);
    expect(canonical.kind).toBe("episode");
    expect(canonical.sourceHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("produces identical episode hash when called twice with same sources", () => {
    const ep1 = compactStructuredEpisode({
      episodeId: "ep_1",
      kind: "test_kind",
      worldId,
      actorIds: ["p1"],
      sources: rawSources,
      outcomes: ["success"],
      canonicalSummary: "Test summary",
    });

    const ep2 = compactStructuredEpisode({
      episodeId: "ep_1",
      kind: "test_kind",
      worldId,
      actorIds: ["p1"],
      sources: [...rawSources],
      outcomes: ["success"],
      canonicalSummary: "Test summary",
    });

    expect(ep1.episodeHash).toBe(ep2.episodeHash);
    expect(ep1.sourceRootHash).toBe(ep2.sourceRootHash);
  });
});
