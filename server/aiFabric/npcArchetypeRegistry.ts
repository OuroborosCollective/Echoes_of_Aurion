import { z } from "zod";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { NPC_UTILITY_ACTION_KEYS } from "../../shared/npcUtilityPlannerProtocol";
import { BehaviorArtifact } from "./behaviorForge";

export const NPC_ARCHETYPE_REGISTRY_VERSION = "NpcArchetypeControllerRegistry.v1" as const;
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const actionCapability = {
  consume: "needs", rest: "needs", produce: "production", trade: "commerce",
  caravan: "caravan", patrol: "patrol", socialize: "social",
} as const;

// Technical controller archetypes, NOT profession labels or monster species.
// Possessing a capability only permits an offer. The action gateway retains all
// target, inventory, navigation, lease, world and combat execution checks.
export const NPC_CONTROLLER_ARCHETYPES = Object.freeze({
  "aurion.merchant.economy.v1": Object.freeze({
    capabilities: Object.freeze(["needs", "production", "commerce", "caravan", "patrol", "social"]),
    allowedOffers: Object.freeze([...NPC_UTILITY_ACTION_KEYS]),
  }),
  "aurion.resident.social.v1": Object.freeze({
    capabilities: Object.freeze(["needs", "social"]),
    allowedOffers: Object.freeze(["consume", "rest", "socialize"] as const),
  }),
});

export const ArchetypeCandidate = z.object({
  schemaVersion: z.literal(NPC_ARCHETYPE_REGISTRY_VERSION),
  archetypeId: z.string().min(1).max(96),
  observationSchema: z.literal("aurion-npc-utility-planner.v1"),
  actionSchema: z.literal("wasd-npc-action-gateway.v1"),
  // A saved/approved candidate is not production execution authorization.
  // Admission to the authoritative tick remains blocked pending the release gate.
  execution: z.literal("shadow"),
  artifact: BehaviorArtifact,
  artifactHash: digest,
  regression: z.object({ sourceRevision: revision, suite: z.literal("npc-archetype-regression.v1"), resultDigest: digest, verdict: z.literal("passed") }).strict(),
}).strict();
export type ArchetypeCandidateType = z.infer<typeof ArchetypeCandidate>;

export function verifyArchetypeCandidate(raw: unknown): ArchetypeCandidateType {
  const candidate = ArchetypeCandidate.parse(raw);
  const definition = NPC_CONTROLLER_ARCHETYPES[candidate.archetypeId as keyof typeof NPC_CONTROLLER_ARCHETYPES];
  if (!definition) throw new Error("NPC_ARCHETYPE_UNKNOWN");
  if (canonicalSha256(candidate.artifact) !== candidate.artifactHash) throw new Error("NPC_CONTROLLER_ARTIFACT_HASH_MISMATCH");
  if (candidate.artifact.mode === "micro-shadow") throw new Error("NPC_NEURAL_REGISTRY_ADMISSION_BLOCKED");
  for (const action of candidate.artifact.allowedActions) {
    if (!(definition.allowedOffers as readonly string[]).includes(action) || !definition.capabilities.includes(actionCapability[action]))
      throw new Error("NPC_ARCHETYPE_ACTION_NOT_ALLOWED");
  }
  return candidate;
}

/** Explicit canonical identity mapping. No guessed role/species -> rights mapping. */
export function controllerArchetypeForNpc(npcId: string): string | null {
  if (["observatory_threshold", "windhollow", "emberfall", "cinder_vault"].some(hub => npcId === `ax1_merchant_${hub}`))
    return "aurion.merchant.economy.v1";
  // Lyra/Orun and zone mobs use other execution contracts; no automatic escalation.
  return null;
}

export const CANONICAL_NPC_FALLBACK = Object.freeze({
  id: "aurion.npc-existing-runtime.v1",
  recommendation: null,
  authority: "aurion" as const,
  behavior: "KEEP_EXISTING_CANONICAL_RULES" as const,
});
