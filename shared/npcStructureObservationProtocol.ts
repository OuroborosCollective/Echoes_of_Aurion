import { z } from "zod";
import type { StructureProjectionContract } from "./structureProjectionProtocol";

export const NPC_STRUCTURE_OBSERVATION_INPUT_PROTOCOL = "aurion.npc-structure-observation-input.v1" as const;

const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const bareSha256 = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().regex(/^[a-f0-9]{40}$/);
const identifier = z.string().trim().min(1).max(128);

export const npcStructureObservationInputSchema = z.strictObject({
  protocol: z.literal(NPC_STRUCTURE_OBSERVATION_INPUT_PROTOCOL),
  logicalTick: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  observationKey: sha256,
  worldId: identifier,
  chunkCoordinate: z.strictObject({ x: z.number().int(), z: z.number().int() }),
  structureId: identifier,
  anchorId: identifier,
  grammarId: identifier,
  grammarVersion: identifier,
  confirmedChunkAuthorityStateHash: sha256,
  sourceCausalRoot: sha256,
  sourceRevision: revision,
  recipeHash: bareSha256,
  materializationHash: sha256,
});

export type NpcStructureObservationInput = Readonly<z.infer<typeof npcStructureObservationInputSchema>>;

export function createNpcStructureObservationInput(
  projection: StructureProjectionContract,
  logicalTick: number,
): NpcStructureObservationInput {
  if (!Number.isSafeInteger(logicalTick) || logicalTick < 1) throw new Error("NPC_STRUCTURE_OBSERVATION_TICK_INVALID");
  const value = {
    protocol: NPC_STRUCTURE_OBSERVATION_INPUT_PROTOCOL,
    logicalTick,
    observationKey: projection.observationKey,
    worldId: projection.npcProjection.worldId,
    chunkCoordinate: { ...projection.npcProjection.chunkCoordinate },
    structureId: projection.npcProjection.structureId,
    anchorId: projection.npcProjection.anchorId,
    grammarId: projection.npcProjection.grammarId,
    grammarVersion: projection.npcProjection.grammarVersion,
    confirmedChunkAuthorityStateHash: projection.npcProjection.confirmedChunkAuthorityStateHash,
    sourceCausalRoot: projection.npcProjection.sourceCausalRoot,
    sourceRevision: projection.npcProjection.sourceRevision,
    recipeHash: projection.npcProjection.recipeHash,
    materializationHash: projection.npcProjection.materializationHash,
  };
  return Object.freeze(npcStructureObservationInputSchema.parse(value));
}

export function sameNpcStructureObservation(
  left: NpcStructureObservationInput,
  right: NpcStructureObservationInput,
): boolean {
  npcStructureObservationInputSchema.parse(left);
  npcStructureObservationInputSchema.parse(right);
  return left.observationKey === right.observationKey &&
    left.recipeHash === right.recipeHash &&
    left.materializationHash === right.materializationHash &&
    left.confirmedChunkAuthorityStateHash === right.confirmedChunkAuthorityStateHash &&
    left.sourceCausalRoot === right.sourceCausalRoot &&
    left.sourceRevision === right.sourceRevision;
}
