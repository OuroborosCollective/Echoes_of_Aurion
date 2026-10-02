// Native Aurion authority constants.
// Historical provenance: WASD repository OuroborosCollective/Wasd @ 28ecb7aec84271bd3bcc4fa5e1e7deef530804b6
// These pins are native hardcoded constants (provenance only); the capsule pin is no longer a live external authority.

export const WASD_NPC_MEMORY_RULESET = "wasd-aurion-npc-memory.v4" as const;

const SOURCE_REVISION = "28ecb7aec84271bd3bcc4fa5e1e7deef530804b6";
const SOURCE_SHA256 = "466c835cbae412e9c6a0aa851f99228216f31ae065cb944e4e8232ea59db7a85";
const MANIFEST_SHA256 = "a0e4641a1a3a88741dcca726b69d3e6af78bbf5ffcaeb4c80ee0f169c85d8e20";

export const NPC_CAPSULE_MANIFEST_SHA256 = MANIFEST_SHA256;

/**
 * Native capsule pin — replaces the historical config/wasd-npc-capsule.json import.
 * Provenance only; not a live external authority.
 */
export const npcCapsulePin = Object.freeze({
  schemaVersion: "aurion-wasd-npc-pin.v1",
  repository: "OuroborosCollective/Wasd",
  sourceRevision: SOURCE_REVISION,
  sourceSha256: SOURCE_SHA256,
  manifestSha256: MANIFEST_SHA256,
  verifierSha256: "387190ba8d830ef9d1acd5f378dca7b16a95c628f399fbfb54c1b075d032eadc",
} as const);

export function npcAuthority(): Readonly<{
  rulesetVersion: typeof WASD_NPC_MEMORY_RULESET;
  sourceRevision: string;
  sourceSha256: string;
}> {
  return Object.freeze({
    rulesetVersion: WASD_NPC_MEMORY_RULESET,
    sourceRevision: SOURCE_REVISION,
    sourceSha256: SOURCE_SHA256,
  });
}
