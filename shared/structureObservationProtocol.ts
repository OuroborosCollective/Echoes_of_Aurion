import { z } from "zod";
import type { StructureRecipe, StructuralPrimitive, DeterministicStructureGrammar } from "./deterministicStructureGrammarProtocol";
import type { WorldChunkCoordinate } from "./worldChunkProtocol";

export const AURION_STRUCTURE_OBSERVATION_PROTOCOL = "aurion.structure-observation.v1" as const;
export const AURION_STRUCTURE_MATERIALIZATION_PROTOCOL = "aurion.structure-materialization.v1" as const;
export const STRUCTURE_OBSERVATION_CACHE_MAX_ENTRIES = 256 as const;

const identifier = z.string().trim().min(1).max(128);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const bareSha256 = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const coordinate = z.strictObject({
  x: z.number().int(),
  z: z.number().int(),
});
const positiveInteger = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

export const structureObservationRequestSchema = z.strictObject({
  worldId: identifier,
  epoch: positiveInteger,
  chunkCoordinate: coordinate,
  structureId: identifier,
  anchorId: identifier,
  grammar: z.custom<DeterministicStructureGrammar>(),
});

export type StructureObservationRequest = Readonly<z.infer<typeof structureObservationRequestSchema>>;

export const structureObservationIdentitySchema = z.strictObject({
  protocol: z.literal(AURION_STRUCTURE_OBSERVATION_PROTOCOL),
  worldId: identifier,
  epoch: positiveInteger,
  chunkCoordinate: coordinate,
  structureId: identifier,
  anchorId: identifier,
  grammarId: identifier,
  grammarVersion: identifier,
  worldSeedHash: sha256,
  confirmedChunkAuthorityStateHash: sha256,
  sourceRevision: revision,
  sourceCausalRoot: sha256,
});

export type StructureObservationIdentity = Readonly<z.infer<typeof structureObservationIdentitySchema>>;

export type StructureObservationState = "BASE_GRAMMAR" | "DELTA_OVERRIDE";

export type StructureObservationPrimitive = Readonly<{
  id: string;
  source: "grammar";
  primitive: StructuralPrimitive["primitive"];
  assetKey?: string;
  materialKey?: string;
  positionMm: Readonly<{ x: number; y: number; z: number }>;
  rotationDiscrete: Readonly<{ x: number; y: number; z: number }>;
  sizeMm: Readonly<{ x: number; y: number; z: number }>;
}>;

export type StructureObservationDeltaOverride = Readonly<{
  source: "structure_placed_delta";
  deltaId: string;
  targetId: string;
  assetKey: string;
  positionMm: Readonly<{ x: number; z: number }>;
  deterministicHash: string;
}>;

export type StructureObservationCollisionDescriptor = Readonly<{
  protocol: "aurion.structure-collision-descriptor.v1";
  semantics: "projection-only";
  primitiveIds: readonly string[];
  deltaOverride: boolean;
}>;

export type StructureObservationPresentationDescriptor = Readonly<{
  protocol: "aurion.structure-presentation-descriptor.v1";
  semantics: "presentation-only";
  assetKeys: readonly string[];
  primitiveKinds: readonly StructuralPrimitive["primitive"][];
}>;

export type StructureObservationFootprint = Readonly<{
  protocol: "aurion.structure-footprint.v1";
  semantics: "projection-only";
  primitives: readonly Readonly<{
    id: string;
    positionMm: Readonly<{ x: number; z: number }>;
    sizeMm: Readonly<{ x: number; z: number }>;
    rotationDiscrete: Readonly<{ x: number; y: number; z: number }>;
  }>[];
  deltaOverridePositionMm: Readonly<{ x: number; z: number }> | null;
}>;

export type StructureMaterialization = Readonly<{
  protocol: typeof AURION_STRUCTURE_MATERIALIZATION_PROTOCOL;
  observationKey: string;
  recipeHash: string;
  state: StructureObservationState;
  primitives: readonly StructureObservationPrimitive[];
  deltaOverride: StructureObservationDeltaOverride | null;
  footprint: StructureObservationFootprint;
  collision: StructureObservationCollisionDescriptor;
  presentation: StructureObservationPresentationDescriptor;
  materializationHash: string;
}>;

export type StructureObservationReceipt = Readonly<{
  schema: "aurion.structure-observation-receipt.v1";
  observationKey: string;
  worldId: string;
  epoch: number;
  chunkCoordinate: WorldChunkCoordinate;
  structureId: string;
  anchorId: string;
  grammarId: string;
  grammarVersion: string;
  sourceRevision: string;
  sourceCausalRoot: string;
  confirmedChunkHash: string;
  /** Exact #512 compiler fingerprint; #512 currently emits a bare SHA-256 hex digest. */
  recipeHash: string;
  materializationHash: string;
  previousReceiptHash: string | null;
  receiptHash: string;
}>;

export const structureObservationReceiptSchema = z.strictObject({
  schema: z.literal("aurion.structure-observation-receipt.v1"),
  observationKey: sha256,
  worldId: identifier,
  epoch: positiveInteger,
  chunkCoordinate: coordinate,
  structureId: identifier,
  anchorId: identifier,
  grammarId: identifier,
  grammarVersion: identifier,
  sourceRevision: revision,
  sourceCausalRoot: sha256,
  confirmedChunkHash: sha256,
  recipeHash: bareSha256,
  materializationHash: sha256,
  previousReceiptHash: sha256.nullable(),
  receiptHash: sha256,
});

export type StructureObservationResult =
  | Readonly<{
      status: "VERIFIED";
      identity: StructureObservationIdentity;
      observationKey: string;
      recipe: StructureRecipe;
      recipeHash: string;
      materialization: StructureMaterialization;
      receipt: StructureObservationReceipt;
      cacheHit: boolean;
    }>
  | Readonly<{
      status: "REMOVED";
      identity: StructureObservationIdentity;
      observationKey: string;
      reason: "CONFIRMED_STRUCTURE_REMOVED";
      sourceDeltaId: string;
    }>
  | Readonly<{
      status: "UNPROVABLE";
      reason: string;
    }>;
