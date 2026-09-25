import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import {
  assertStructureProjectionContract,
  type StructureProjectionContract,
} from "../../shared/structureProjectionProtocol";

export const AURION_GENERATED_STRUCTURE_PRESENTATION_PROVENANCE_PROTOCOL =
  "aurion.generated-structure.presentation-provenance.v1" as const;

export type GeneratedStructurePresentationProvenance = Readonly<{
  protocol: typeof AURION_GENERATED_STRUCTURE_PRESENTATION_PROVENANCE_PROTOCOL;
  projectionHash: string;
  observationKey: string;
  worldId: string;
  epoch: number;
  chunkCoordinate: Readonly<{ x: number; z: number }>;
  structureId: string;
  anchorId: string;
  grammarId: string;
  grammarVersion: string;
  sourceRevision: string;
  sourceCausalRoot: string;
  confirmedChunkAuthorityStateHash: string;
  recipeHash: string;
  materializationHash: string;
  presentation: Readonly<{
    assetKeys: readonly string[];
    primitiveKinds: readonly ("box" | "cylinder" | "wedge")[];
  }>;
  provenanceHash: string;
}>;

export function buildGeneratedStructurePresentationProvenance(
  projection: unknown,
): GeneratedStructurePresentationProvenance {
  assertStructureProjectionContract(projection);
  const contract = projection as StructureProjectionContract;
  const identity = contract.identity;
  const assetKeys = Object.freeze([...contract.presentation.assetKeys].sort());
  const primitiveKinds = Object.freeze([...contract.presentation.primitiveKinds].sort());

  const unsigned = {
    protocol: AURION_GENERATED_STRUCTURE_PRESENTATION_PROVENANCE_PROTOCOL,
    projectionHash: contract.projectionHash,
    observationKey: contract.observationKey,
    worldId: identity.worldId,
    epoch: identity.epoch,
    chunkCoordinate: { ...identity.chunkCoordinate },
    structureId: identity.structureId,
    anchorId: identity.anchorId,
    grammarId: identity.grammarId,
    grammarVersion: identity.grammarVersion,
    sourceRevision: identity.sourceRevision,
    sourceCausalRoot: identity.sourceCausalRoot,
    confirmedChunkAuthorityStateHash: identity.confirmedChunkAuthorityStateHash,
    recipeHash: contract.recipeHash,
    materializationHash: contract.materializationHash,
    presentation: {
      assetKeys,
      primitiveKinds,
    },
  } as const;

  return Object.freeze({
    ...unsigned,
    provenanceHash: canonicalSha256({
      domain: AURION_GENERATED_STRUCTURE_PRESENTATION_PROVENANCE_PROTOCOL,
      value: unsigned,
    }),
  });
}

export function assertGeneratedStructurePresentationProvenance(
  value: unknown,
): asserts value is GeneratedStructurePresentationProvenance {
  if (!value || typeof value !== "object") {
    throw new Error("GENERATED_STRUCTURE_PRESENTATION_PROVENANCE_INVALID");
  }
  const candidate = value as Partial<GeneratedStructurePresentationProvenance>;
  const provenanceHash = candidate.provenanceHash;
  const { provenanceHash: _ignored, ...unsigned } = candidate as GeneratedStructurePresentationProvenance;
  const expected = canonicalSha256({
    domain: AURION_GENERATED_STRUCTURE_PRESENTATION_PROVENANCE_PROTOCOL,
    value: unsigned,
  });
  if (provenanceHash !== expected) {
    throw new Error("GENERATED_STRUCTURE_PRESENTATION_PROVENANCE_HASH_MISMATCH");
  }
}
