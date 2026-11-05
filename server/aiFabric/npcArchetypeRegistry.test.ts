import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { behaviorTemplate } from "./behaviorForge";
import { verifyArchetypeCandidate } from "./npcArchetypeRegistry";

// Explicit synthetic authoring fixture; never a production approval.
export function candidate(version = 1) {
  const artifact = { ...behaviorTemplate("blacksmith", "utility"), version };
  return {
    schemaVersion: "NpcArchetypeControllerRegistry.v1" as const,
    archetypeId: "aurion.merchant.economy.v1",
    observationSchema: "aurion-npc-utility-planner.v1",
    actionSchema: "wasd-npc-action-gateway.v1",
    execution: "shadow" as const,
    artifact, artifactHash: canonicalSha256(artifact),
    regression: { sourceRevision: "e97a0027d69c6a3a3bf32c3590fdcac38b2d114b", suite: "npc-archetype-regression.v1", resultDigest: canonicalSha256({ synthetic: true, version }), verdict: "passed" as const },
  };
}

describe("NPC archetype candidate boundary (offline)", () => {
  it("checks artifact integrity and rejects a different archetype's offers", () => {
    expect(verifyArchetypeCandidate(candidate()).artifact.version).toBe(1);
    expect(() => verifyArchetypeCandidate({ ...candidate(), artifactHash: "sha256:" + "0".repeat(64) })).toThrow("ARTIFACT_HASH");
    expect(() => verifyArchetypeCandidate({ ...candidate(), archetypeId: "aurion.resident.social.v1" })).toThrow("ACTION_NOT_ALLOWED");
  });
});
