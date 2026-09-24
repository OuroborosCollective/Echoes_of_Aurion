import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";
import {
  AURION_STRUCTURE_MATERIALIZATION_PROTOCOL,
  structureObservationIdentitySchema,
  type StructureMaterialization,
  type StructureObservationIdentity,
} from "./structureObservationProtocol";

export const AURION_STRUCTURE_PROJECTION_PROTOCOL = "aurion.structure-projection.v1" as const;
export const AURION_STRUCTURE_COLLISION_PROJECTION_PROTOCOL = "aurion.structure-collision-projection.v1" as const;
export const AURION_STRUCTURE_NPC_PROJECTION_PROTOCOL = "aurion.structure-npc-projection.v1" as const;
export const AURION_STRUCTURE_NETWORK_PROJECTION_PROTOCOL = "aurion.structure-network-projection.v1" as const;
export const AURION_STRUCTURE_AX1_PROJECTION_PROTOCOL = "aurion.structure-ax1-projection.v1" as const;

const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const identifier = z.string().trim().min(1).max(128);
const coordinate = z.strictObject({ x: z.number().int(), z: z.number().int() });

export type StructureProjectionContract = Readonly<{
  protocol: typeof AURION_STRUCTURE_PROJECTION_PROTOCOL;
  observationKey: string;
  identity: StructureObservationIdentity;
  recipeHash: string;
  materializationHash: string;
  footprint: StructureMaterialization["footprint"];
  collision: StructureMaterialization["collision"];
  presentation: StructureMaterialization["presentation"];
  collisionProjection: Readonly<{
    protocol: typeof AURION_STRUCTURE_COLLISION_PROJECTION_PROTOCOL;
    observationKey: string;
    confirmedChunkAuthorityStateHash: string;
    footprint: StructureMaterialization["footprint"];
    collision: StructureMaterialization["collision"];
  }>;
  npcProjection: Readonly<{
    protocol: typeof AURION_STRUCTURE_NPC_PROJECTION_PROTOCOL;
    observationKey: string;
    worldId: string;
    chunkCoordinate: { x: number; z: number };
    structureId: string;
    anchorId: string;
    grammarId: string;
    grammarVersion: string;
    confirmedChunkAuthorityStateHash: string;
    sourceCausalRoot: string;
    sourceRevision: string;
    recipeHash: string;
    materializationHash: string;
  }>;
  networkProjection: Readonly<{
    protocol: typeof AURION_STRUCTURE_NETWORK_PROJECTION_PROTOCOL;
    observationKey: string;
    worldId: string;
    chunkCoordinate: { x: number; z: number };
    structureId: string;
    anchorId: string;
    recipeHash: string;
    materializationHash: string;
    footprint: StructureMaterialization["footprint"];
  }>;
  ax1Projection: Readonly<{
    protocol: typeof AURION_STRUCTURE_AX1_PROJECTION_PROTOCOL;
    observationKey: string;
    worldId: string;
    chunkCoordinate: { x: number; z: number };
    structureId: string;
    anchorId: string;
    grammarId: string;
    grammarVersion: string;
    recipeHash: string;
    materializationHash: string;
    presentation: StructureMaterialization["presentation"];
  }>;
  projectionHash: string;
}>;

export const structureProjectionContractSchema = z.strictObject({
  protocol: z.literal(AURION_STRUCTURE_PROJECTION_PROTOCOL),
  observationKey: sha256,
  identity: structureObservationIdentitySchema,
  recipeHash: z.string().min(1).max(128),
  materializationHash: sha256,
  footprint: z.unknown(),
  collision: z.unknown(),
  presentation: z.unknown(),
  collisionProjection: z.strictObject({ protocol: z.literal(AURION_STRUCTURE_COLLISION_PROJECTION_PROTOCOL), observationKey: sha256, confirmedChunkAuthorityStateHash: sha256, footprint: z.unknown(), collision: z.unknown() }),
  npcProjection: z.strictObject({ protocol: z.literal(AURION_STRUCTURE_NPC_PROJECTION_PROTOCOL), observationKey: sha256, worldId: identifier, chunkCoordinate: coordinate, structureId: identifier, anchorId: identifier, grammarId: identifier, grammarVersion: identifier, confirmedChunkAuthorityStateHash: sha256, sourceCausalRoot: sha256, sourceRevision: revision, recipeHash: z.string().min(1).max(128), materializationHash: sha256 }),
  networkProjection: z.strictObject({ protocol: z.literal(AURION_STRUCTURE_NETWORK_PROJECTION_PROTOCOL), observationKey: sha256, worldId: identifier, chunkCoordinate: coordinate, structureId: identifier, anchorId: identifier, recipeHash: z.string().min(1).max(128), materializationHash: sha256, footprint: z.unknown() }),
  ax1Projection: z.strictObject({ protocol: z.literal(AURION_STRUCTURE_AX1_PROJECTION_PROTOCOL), observationKey: sha256, worldId: identifier, chunkCoordinate: coordinate, structureId: identifier, anchorId: identifier, grammarId: identifier, grammarVersion: identifier, recipeHash: z.string().min(1).max(128), materializationHash: sha256, presentation: z.unknown() }),
  projectionHash: sha256,
});

export function createStructureProjectionContract(input: {
  identity: StructureObservationIdentity;
  recipeHash: string;
  materialization: StructureMaterialization;
}): StructureProjectionContract {
  const identityValue = Object.freeze(structureObservationIdentitySchema.parse(input.identity));
  if (input.materialization.protocol !== AURION_STRUCTURE_MATERIALIZATION_PROTOCOL) throw new Error("STRUCTURE_PROJECTION_MATERIALIZATION_PROTOCOL_INVALID");
  if (input.materialization.observationKey !== canonicalObservationKey(identityValue)) throw new Error("STRUCTURE_PROJECTION_OBSERVATION_KEY_MISMATCH");
  if (input.materialization.recipeHash !== input.recipeHash) throw new Error("STRUCTURE_PROJECTION_RECIPE_HASH_MISMATCH");
  const collisionProjection = Object.freeze({ protocol: AURION_STRUCTURE_COLLISION_PROJECTION_PROTOCOL, observationKey: input.materialization.observationKey, confirmedChunkAuthorityStateHash: identityValue.confirmedChunkAuthorityStateHash, footprint: input.materialization.footprint, collision: input.materialization.collision });
  const npcProjection = Object.freeze({ protocol: AURION_STRUCTURE_NPC_PROJECTION_PROTOCOL, observationKey: input.materialization.observationKey, worldId: identityValue.worldId, chunkCoordinate: { ...identityValue.chunkCoordinate }, structureId: identityValue.structureId, anchorId: identityValue.anchorId, grammarId: identityValue.grammarId, grammarVersion: identityValue.grammarVersion, confirmedChunkAuthorityStateHash: identityValue.confirmedChunkAuthorityStateHash, sourceCausalRoot: identityValue.sourceCausalRoot, sourceRevision: identityValue.sourceRevision, recipeHash: input.recipeHash, materializationHash: input.materialization.materializationHash });
  const networkProjection = Object.freeze({ protocol: AURION_STRUCTURE_NETWORK_PROJECTION_PROTOCOL, observationKey: input.materialization.observationKey, worldId: identityValue.worldId, chunkCoordinate: { ...identityValue.chunkCoordinate }, structureId: identityValue.structureId, anchorId: identityValue.anchorId, recipeHash: input.recipeHash, materializationHash: input.materialization.materializationHash, footprint: input.materialization.footprint });
  const ax1Projection = Object.freeze({ protocol: AURION_STRUCTURE_AX1_PROJECTION_PROTOCOL, observationKey: input.materialization.observationKey, worldId: identityValue.worldId, chunkCoordinate: { ...identityValue.chunkCoordinate }, structureId: identityValue.structureId, anchorId: identityValue.anchorId, grammarId: identityValue.grammarId, grammarVersion: identityValue.grammarVersion, recipeHash: input.recipeHash, materializationHash: input.materialization.materializationHash, presentation: input.materialization.presentation });
  const envelope = Object.freeze({ protocol: AURION_STRUCTURE_PROJECTION_PROTOCOL, observationKey: input.materialization.observationKey, identity: identityValue, recipeHash: input.recipeHash, materializationHash: input.materialization.materializationHash, footprint: input.materialization.footprint, collision: input.materialization.collision, presentation: input.materialization.presentation, collisionProjection, npcProjection, networkProjection, ax1Projection });
  return Object.freeze({ ...envelope, projectionHash: canonicalSha256({ domain: "aurion.structure-projection.v1", envelope }) }) as StructureProjectionContract;
}

function canonicalObservationKey(identity: StructureObservationIdentity): string {
  return canonicalSha256({ domain: "aurion.structure-observation-key.v1", identity });
}

export function assertStructureProjectionContract(value: unknown): asserts value is StructureProjectionContract {
  const parsed = structureProjectionContractSchema.parse(value);
  const { projectionHash, ...envelope } = parsed;
  if (projectionHash !== canonicalSha256({ domain: "aurion.structure-projection.v1", envelope })) throw new Error("STRUCTURE_PROJECTION_HASH_MISMATCH");
  if (parsed.collisionProjection.observationKey !== parsed.observationKey || parsed.npcProjection.observationKey !== parsed.observationKey || parsed.networkProjection.observationKey !== parsed.observationKey || parsed.ax1Projection.observationKey !== parsed.observationKey) throw new Error("STRUCTURE_PROJECTION_OBSERVATION_KEY_MISMATCH");
}

export function structureProjectionAssetKeys(contract: StructureProjectionContract): readonly string[] {
  return Object.freeze([...contract.presentation.assetKeys].sort());
}
