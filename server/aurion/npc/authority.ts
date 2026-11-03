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

/**
 * Documented lineage of NPC capsule pins, oldest first. Historical source identity
 * only: it validates where a recorded NPC decision came from and never acts as a
 * gameplay input. Values are the pins recorded in production NPC memory receipts
 * (ddce5911: 2026-09-09..19, 002e7c35: 2026-09-19, current: since 2026-11-03).
 */
export const NPC_CAPSULE_PIN_LINEAGE = Object.freeze([
  Object.freeze({ sourceRevision: "ddce5911e7969f26a9c5b2739d3426004b32260d", sourceSha256: "fcd4cbc5cfa3deae9389cf1aba6d7d376eec216834b877c30876fb488821442f" }),
  Object.freeze({ sourceRevision: "002e7c35309816cd043295f47398e52fdb388694", sourceSha256: "7a524e3d329dd34205c41fdc00dc088e3b3187ab39c9f17a42a0c2cd8294e82f" }),
  Object.freeze({ sourceRevision: SOURCE_REVISION, sourceSha256: SOURCE_SHA256 }),
]);

export function isKnownNpcCapsulePin(value: Readonly<{ sourceRevision: unknown; sourceSha256: unknown }>): boolean {
  return NPC_CAPSULE_PIN_LINEAGE.some((pin) => pin.sourceRevision === value.sourceRevision && pin.sourceSha256 === value.sourceSha256);
}

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
