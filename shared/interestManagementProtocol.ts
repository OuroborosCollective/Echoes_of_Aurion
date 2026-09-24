import { z } from "zod";
import {
  WORLD_CHUNK_INTEREST_VERSION,
  type WorldChunkInterestPlan,
} from "./worldChunkInterestProtocol";
import type { WorldChunkCoordinate, WorldChunkStreamingTier } from "./worldChunkProtocol";
import type { StructureProjectionContract } from "./structureProjectionProtocol";

export const AURION_INTEREST_MANAGEMENT_PROTOCOL = "aurion.interest-management.v1" as const;
export const INTEREST_NETWORK_CACHE_KEY_DOMAIN = "aurion.interest-network-cache-key.v1" as const;

export type InterestPersistenceMode = "evidence-read-only" | "none";
export type StructureRequiredProjection = "simulation" | "full" | "hlod";

export type StructureInterestRequirement = Readonly<{
  observationKey: string;
  worldId: string;
  chunkCoordinate: WorldChunkCoordinate;
  structureId: string;
  anchorId: string;
  confirmedChunkAuthorityStateHash: string;
  sourceCausalRoot: string;
  sourceRevision: string;
  recipeHash: string;
  materializationHash: string;
  requiredProjection: StructureRequiredProjection;
  collisionRequired: boolean;
  networkCacheKey: string;
}>;

export type InterestManagementPlan = Readonly<{
  protocol: typeof AURION_INTEREST_MANAGEMENT_PROTOCOL;
  interestPolicyVersion: typeof WORLD_CHUNK_INTEREST_VERSION;
  worldId: string;
  canonicalStateHash: string;
  center: WorldChunkCoordinate;
  tier: WorldChunkStreamingTier;
  simulationChunks: readonly WorldChunkCoordinate[];
  networkChunks: readonly WorldChunkCoordinate[];
  persistenceChunks: readonly WorldChunkCoordinate[];
  persistenceMode: InterestPersistenceMode;
  presentation: Readonly<{
    full: readonly WorldChunkCoordinate[];
    prepared: readonly WorldChunkCoordinate[];
    hlod: readonly WorldChunkCoordinate[];
  }>;
  structureRequirements: readonly StructureInterestRequirement[];
  structureRequirementHash: string;
  relevanceHash: string;
}>;

const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
const coordinate = z.strictObject({
  x: z.number().int(),
  z: z.number().int(),
});
const revision = z.string().regex(/^[a-f0-9]{40}$/);

const structureRequirementSchema = z.strictObject({
  observationKey: sha256,
  worldId: identifier,
  chunkCoordinate: coordinate,
  structureId: identifier,
  anchorId: identifier,
  confirmedChunkAuthorityStateHash: sha256,
  sourceCausalRoot: sha256,
  sourceRevision: revision,
  recipeHash: z.string().regex(/^[a-f0-9]{64}$/),
  materializationHash: sha256,
  requiredProjection: z.enum(["simulation", "full", "hlod"]),
  collisionRequired: z.boolean(),
  networkCacheKey: sha256,
});

export const interestManagementPlanSchema = z.strictObject({
  protocol: z.literal(AURION_INTEREST_MANAGEMENT_PROTOCOL),
  interestPolicyVersion: z.literal(WORLD_CHUNK_INTEREST_VERSION),
  worldId: identifier,
  canonicalStateHash: sha256,
  center: coordinate,
  tier: z.enum(["phone", "tablet", "desktop"]),
  simulationChunks: z.array(coordinate).max(25),
  networkChunks: z.array(coordinate).max(25),
  persistenceChunks: z.array(coordinate).max(25),
  persistenceMode: z.enum(["evidence-read-only", "none"]),
  presentation: z.strictObject({
    full: z.array(coordinate).max(25),
    prepared: z.array(coordinate).max(25),
    hlod: z.array(coordinate).max(25),
  }),
  structureRequirements: z.array(structureRequirementSchema).max(4096),
  structureRequirementHash: sha256,
  relevanceHash: sha256,
});

export function networkCacheKey(requirement: Pick<
  StructureInterestRequirement,
  "observationKey" | "materializationHash" | "requiredProjection"
>): string {
  return sha256.parse(
    canonicalSha256({
      domain: INTEREST_NETWORK_CACHE_KEY_DOMAIN,
      observationKey: requirement.observationKey,
      materializationHash: requirement.materializationHash,
      requiredProjection: requirement.requiredProjection,
    }),
  );
}

export function validateInterestManagementPlan(
  value: unknown,
): InterestManagementPlan {
  return interestManagementPlanSchema.parse(value);
}

function canonicalSha256(value: unknown): string {
  const canonical = (input: unknown): string => {
    if (input === null || typeof input !== "object") return JSON.stringify(input);
    if (Array.isArray(input)) return `[${input.map(canonical).join(",")}]`;
    const record = input as Record<string, unknown>;
    return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
  };
  let hash = 0x811c9dc5;
  const text = canonical(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  const first = (hash >>> 0).toString(16).padStart(8, "0");
  let second = 0x9e3779b9;
  for (let index = text.length - 1; index >= 0; index -= 1) {
    second ^= text.charCodeAt(index);
    second = Math.imul(second, 0x85ebca6b);
  }
  const tail = (second >>> 0).toString(16).padStart(8, "0");
  return `sha256:${first}${tail}${first}${tail}${first}${tail}${first}${tail}`;
}

export function buildInterestManagementPlanHashInput(
  input: Pick<InterestManagementPlan, "protocol" | "interestPolicyVersion" | "worldId" | "canonicalStateHash" | "center" | "tier" | "simulationChunks" | "networkChunks" | "persistenceChunks" | "persistenceMode" | "presentation" | "structureRequirements">,
): unknown {
  return {
    protocol: input.protocol,
    interestPolicyVersion: input.interestPolicyVersion,
    worldId: input.worldId,
    canonicalStateHash: input.canonicalStateHash,
    center: input.center,
    tier: input.tier,
    simulationChunks: input.simulationChunks,
    networkChunks: input.networkChunks,
    persistenceChunks: input.persistenceChunks,
    persistenceMode: input.persistenceMode,
    presentation: input.presentation,
    structureRequirements: input.structureRequirements.map(requirement => ({
      observationKey: requirement.observationKey,
      requiredProjection: requirement.requiredProjection,
      collisionRequired: requirement.collisionRequired,
      networkCacheKey: requirement.networkCacheKey,
    })),
  };
}

export function assertStructureInterestRequirements(
  requirements: readonly StructureInterestRequirement[],
): void {
  structureRequirementSchema.array().max(4096).parse(requirements);
}
