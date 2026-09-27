import { z } from "zod";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  assertStructureProjectionContract,
  type StructureProjectionContract,
} from "../shared/structureProjectionProtocol";

const SHA256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const BARE_SHA256 = z.string().regex(/^[a-f0-9]{64}$/);
const REVISION = z.string().regex(/^[0-9a-f]{40}$/);

export const WORLD_MODEL_PROJECTION_VERIFIER_SCHEMA =
  "aurion.world-model-projection-boundary.v1" as const;

export type WorldModelProjectionVerificationStatus =
  | "MATCH"
  | "FIRST_DIVERGENCE"
  | "UNPROVABLE";

export type WorldModelProjectionDivergenceBoundary =
  | "WORLD_REVISION"
  | "CANONICAL_STATE"
  | "PROJECTION_IDENTITY"
  | "PROJECTION_PAYLOAD";

export type WorldModelProjectionVerificationInput = Readonly<{
  worldRevision: string;
  worldStateHash: string;
  projectionHash: string;
  recipeHash?: string;
  observationKey?: string;
  projectionContract?: unknown;
}>;

export type WorldModelProjectionVerification = Readonly<{
  schema: typeof WORLD_MODEL_PROJECTION_VERIFIER_SCHEMA;
  status: WorldModelProjectionVerificationStatus;
  evidenceHash: string;
  worldRevision: string;
  worldStateHash: string;
  recipeHash: string | null;
  observationKey: string | null;
  projectionHash: string;
  projectionChanged: boolean;
  divergenceBoundary: WorldModelProjectionDivergenceBoundary | null;
  diagnostic: string | null;
}>;

const inputSchema = z.strictObject({
  worldRevision: REVISION,
  worldStateHash: SHA256,
  projectionHash: SHA256,
  recipeHash: BARE_SHA256.optional(),
  observationKey: SHA256.optional(),
  projectionContract: z.unknown().optional(),
});

function canonicalBoundaryEvidence(value: {
  worldRevision: string;
  worldStateHash: string;
  recipeHash: string | null;
  observationKey: string | null;
  projectionHash: string;
  status: WorldModelProjectionVerificationStatus;
  divergenceBoundary: WorldModelProjectionDivergenceBoundary | null;
  projectionChanged: boolean;
}): string {
  return canonicalSha256({
    domain: WORLD_MODEL_PROJECTION_VERIFIER_SCHEMA,
    value,
  });
}

function normalizeInput(input: WorldModelProjectionVerificationInput) {
  const parsed = inputSchema.parse(input);

  if (input.projectionContract === undefined) {
    return Object.freeze({
      ...parsed,
      contract: null as StructureProjectionContract | null,
    });
  }

  try {
    assertStructureProjectionContract(input.projectionContract);
  } catch {
    return Object.freeze({
      ...parsed,
      contract: null as StructureProjectionContract | null,
    });
  }

  return Object.freeze({
    ...parsed,
    contract: input.projectionContract as StructureProjectionContract,
  });
}

function finalize(
  input: ReturnType<typeof normalizeInput>,
  status: WorldModelProjectionVerificationStatus,
  projectionChanged: boolean,
  divergenceBoundary: WorldModelProjectionDivergenceBoundary | null,
  diagnostic: string | null,
): WorldModelProjectionVerification {
  const recipeHash = input.recipeHash ?? input.contract?.recipeHash ?? null;
  const observationKey = input.observationKey ?? input.contract?.observationKey ?? null;
  const evidence = {
    worldRevision: input.worldRevision,
    worldStateHash: input.worldStateHash,
    recipeHash,
    observationKey,
    projectionHash: input.projectionHash,
    status,
    divergenceBoundary,
    projectionChanged,
  };

  return Object.freeze({
    schema: WORLD_MODEL_PROJECTION_VERIFIER_SCHEMA,
    status,
    evidenceHash: canonicalBoundaryEvidence(evidence),
    worldRevision: input.worldRevision,
    worldStateHash: input.worldStateHash,
    recipeHash,
    observationKey,
    projectionHash: input.projectionHash,
    projectionChanged,
    divergenceBoundary,
    diagnostic,
  });
}

export function verifyWorldModelProjection(
  input: WorldModelProjectionVerificationInput,
): WorldModelProjectionVerification {
  const normalized = normalizeInput(input);

  if (!normalized.contract) {
    return finalize(
      normalized,
      "UNPROVABLE",
      false,
      null,
      "PROJECTION_CONTRACT_UNPROVABLE",
    );
  }

  const contract = normalized.contract;

  if (contract.identity.sourceRevision !== normalized.worldRevision) {
    return finalize(
      normalized,
      "FIRST_DIVERGENCE",
      false,
      "WORLD_REVISION",
      "PROJECTION_WORLD_REVISION_MISMATCH",
    );
  }

  if (
    contract.identity.confirmedChunkAuthorityStateHash !==
    normalized.worldStateHash
  ) {
    return finalize(
      normalized,
      "FIRST_DIVERGENCE",
      false,
      "CANONICAL_STATE",
      "PROJECTION_CANONICAL_STATE_HASH_MISMATCH",
    );
  }

  if (contract.projectionHash !== normalized.projectionHash) {
    return finalize(
      normalized,
      "FIRST_DIVERGENCE",
      false,
      "PROJECTION_PAYLOAD",
      "PROJECTION_HASH_MISMATCH",
    );
  }

  if (
    normalized.recipeHash !== undefined &&
    contract.recipeHash !== normalized.recipeHash
  ) {
    return finalize(
      normalized,
      "FIRST_DIVERGENCE",
      false,
      "PROJECTION_IDENTITY",
      "PROJECTION_RECIPE_HASH_MISMATCH",
    );
  }

  if (
    normalized.observationKey !== undefined &&
    contract.observationKey !== normalized.observationKey
  ) {
    return finalize(
      normalized,
      "FIRST_DIVERGENCE",
      false,
      "PROJECTION_IDENTITY",
      "PROJECTION_OBSERVATION_KEY_MISMATCH",
    );
  }

  return finalize(normalized, "MATCH", false, null, null);
}

export function compareWorldModelProjections(
  baseline: WorldModelProjectionVerificationInput,
  candidate: WorldModelProjectionVerificationInput,
): WorldModelProjectionVerification {
  const first = verifyWorldModelProjection(baseline);
  if (first.status !== "MATCH") return first;

  const second = verifyWorldModelProjection(candidate);
  if (second.status !== "MATCH") return second;

  if (first.worldRevision !== second.worldRevision) {
    return Object.freeze({
      ...second,
      status: "FIRST_DIVERGENCE",
      projectionChanged: false,
      divergenceBoundary: "WORLD_REVISION",
      diagnostic: "PROJECTION_WORLD_REVISION_CHANGED",
      evidenceHash: canonicalBoundaryEvidence({
        worldRevision: second.worldRevision,
        worldStateHash: second.worldStateHash,
        recipeHash: second.recipeHash,
        observationKey: second.observationKey,
        projectionHash: second.projectionHash,
        status: "FIRST_DIVERGENCE",
        divergenceBoundary: "WORLD_REVISION",
        projectionChanged: false,
      }),
    });
  }

  if (first.worldStateHash !== second.worldStateHash) {
    return Object.freeze({
      ...second,
      status: "FIRST_DIVERGENCE",
      projectionChanged: false,
      divergenceBoundary: "CANONICAL_STATE",
      diagnostic: "PROJECTION_CANONICAL_STATE_CHANGED",
      evidenceHash: canonicalBoundaryEvidence({
        worldRevision: second.worldRevision,
        worldStateHash: second.worldStateHash,
        recipeHash: second.recipeHash,
        observationKey: second.observationKey,
        projectionHash: second.projectionHash,
        status: "FIRST_DIVERGENCE",
        divergenceBoundary: "CANONICAL_STATE",
        projectionChanged: false,
      }),
    });
  }

  if (first.recipeHash !== second.recipeHash) {
    return Object.freeze({
      ...second,
      status: "FIRST_DIVERGENCE",
      projectionChanged: false,
      divergenceBoundary: "PROJECTION_IDENTITY",
      diagnostic: "PROJECTION_RECIPE_CHANGED",
      evidenceHash: canonicalBoundaryEvidence({
        worldRevision: second.worldRevision,
        worldStateHash: second.worldStateHash,
        recipeHash: second.recipeHash,
        observationKey: second.observationKey,
        projectionHash: second.projectionHash,
        status: "FIRST_DIVERGENCE",
        divergenceBoundary: "PROJECTION_IDENTITY",
        projectionChanged: false,
      }),
    });
  }

  if (first.observationKey !== second.observationKey) {
    return Object.freeze({
      ...second,
      status: "FIRST_DIVERGENCE",
      projectionChanged: false,
      divergenceBoundary: "PROJECTION_IDENTITY",
      diagnostic: "PROJECTION_OBSERVATION_CHANGED",
      evidenceHash: canonicalBoundaryEvidence({
        worldRevision: second.worldRevision,
        worldStateHash: second.worldStateHash,
        recipeHash: second.recipeHash,
        observationKey: second.observationKey,
        projectionHash: second.projectionHash,
        status: "FIRST_DIVERGENCE",
        divergenceBoundary: "PROJECTION_IDENTITY",
        projectionChanged: false,
      }),
    });
  }

  return Object.freeze({
    ...second,
    status: "MATCH",
    projectionChanged: first.projectionHash !== second.projectionHash,
    divergenceBoundary: null,
    diagnostic: null,
    evidenceHash: canonicalBoundaryEvidence({
      worldRevision: second.worldRevision,
      worldStateHash: second.worldStateHash,
      recipeHash: second.recipeHash,
      observationKey: second.observationKey,
      projectionHash: second.projectionHash,
      status: "MATCH",
      divergenceBoundary: null,
      projectionChanged: first.projectionHash !== second.projectionHash,
    }),
  });
}
