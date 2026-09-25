import { describe, expect, it } from "vitest";
import { reconstructPersistedSelectedSource } from "./fallback";

describe("AIM-299: persisted context expansion boundary", () => {
  const capsuleJson = JSON.stringify({
    selected: [{
      canonicalText: "Verified caravan betrayal at the eastern gate.",
      sourceRefs: [{
        sourceId: "src_betrayal",
        sourceHash: "a".repeat(64),
        kind: "world_event",
        evidenceClass: "verified",
        worldId: "world_aurion_prime",
        actorIds: ["npc_guard", "player_1"],
        logicalSequence: 42,
      }],
    }],
  });

  it("reconstructs canonical selected source content from persisted capsule data", () => {
    const source = reconstructPersistedSelectedSource(capsuleJson, {
      sourceId: "src_betrayal",
      sourceHash: "a".repeat(64),
      kind: "world_event",
      evidenceClass: "verified",
      worldId: "world_aurion_prime",
      logicalSequence: 42,
    });

    expect(source).toMatchObject({
      sourceId: "src_betrayal",
      sourceHash: "a".repeat(64),
      worldId: "world_aurion_prime",
      actorIds: ["npc_guard", "player_1"],
      logicalSequence: 42,
      canonicalText: "Verified caravan betrayal at the eastern gate.",
    });
  });

  it("fails closed when persisted linkage diverges from the capsule reference", () => {
    const source = reconstructPersistedSelectedSource(capsuleJson, {
      sourceId: "src_betrayal",
      sourceHash: "b".repeat(64),
      kind: "world_event",
      evidenceClass: "verified",
      worldId: "world_aurion_prime",
      logicalSequence: 42,
    });

    expect(source).toBeNull();
  });

  it("fails closed for an omitted source with no canonical capsule text", () => {
    const source = reconstructPersistedSelectedSource(capsuleJson, {
      sourceId: "src_omitted",
      sourceHash: "c".repeat(64),
      kind: "world_fact",
      evidenceClass: "verified",
      worldId: "world_aurion_prime",
      logicalSequence: 43,
    });

    expect(source).toBeNull();
  });
});
