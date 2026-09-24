import type { StructureGrammarCompilation } from "../../shared/deterministicStructureGrammarProtocol";
import type { StructureObservationResult } from "../../shared/structureObservationProtocol";
import type { StructureProjectionContract } from "../../shared/structureProjectionProtocol";
import type { AurionHeadlessCausalOracleResult } from "../../shared/aurionHeadlessCausalOracleContract";
import type { AurionCausalTickReceipt } from "../../shared/aurionCausalTickContract";
import {
  AURION_WORLD_GENERATION_PARITY_SCHEMA,
  createGameplayEvidence,
  dependencyRootFromCompilation,
  canonicalWorldGenerationHash,
  type WorldGenerationCausalGameplayEvidence,
  type WorldGenerationParityBoundary,
  type WorldGenerationParityEvidence,
  type WorldGenerationParityEvidenceInput,
  type WorldGenerationRuntimeIdentity,
  type WorldGenerationSourceIntelligence,
  type WorldGenerationTiming,
  worldGenerationParityEvidenceSchema,
  worldGenerationCausalGameplayEvidenceSchema,
  worldGenerationRuntimeIdentitySchema,
  worldGenerationSourceIntelligenceSchema,
  worldGenerationTimingSchema,
} from "./worldGenerationEvidenceContract";
import {
  computeWorldGenerationArtifactIntegrityHash,
  computeWorldGenerationDeterminismHash,
} from "./worldGenerationEvidenceHash";

const ZERO_TIMING: WorldGenerationTiming = Object.freeze({
  grammarCompileMs: 0,
  cagAnalysisMs: 0,
  observationMs: 0,
  materializationMs: 0,
  simulationMs: 0,
  referenceReplayMs: 0,
  persistenceMs: 0,
  serializationMs: 0,
  evidenceWriteMs: 0,
});

const NOT_CONFIGURED_SOURCE_INTELLIGENCE: WorldGenerationSourceIntelligence = Object.freeze({
  status: "NOT_CONFIGURED",
  parserVersion: null,
  parserRevision: null,
  parserStructureHash: null,
  inspectorVersion: null,
  inspectorRevision: null,
  inspectorFindingsHash: null,
  analysisVersion: null,
  requestSha256: null,
  responseSha256: null,
  analysisFingerprint: null,
  sourceBoundary: "not_configured",
});

export type WorldGenerationParityInput = Readonly<{
  runId: string;
  generation: StructureGrammarCompilation;
  observation: StructureObservationResult;
  projection: StructureProjectionContract;
  runtime: WorldGenerationRuntimeIdentity;
  referenceRuntime?: WorldGenerationRuntimeIdentity;
  gameplay: WorldGenerationCausalGameplayEvidence;
  oracle: AurionHeadlessCausalOracleResult;
  sourceIntelligence?: WorldGenerationSourceIntelligence;
  timing?: WorldGenerationTiming;
  artifactChecksums?: readonly Readonly<{ path: string; sha256: string }>[];
  createdAt?: string;
}>;

export type WorldGenerationParityVerification = Readonly<{
  evidence: WorldGenerationParityEvidence;
  verified: boolean;
  diagnostic: string | null;
}>;

function timing(value?: WorldGenerationTiming): WorldGenerationTiming {
  return Object.freeze(worldGenerationTimingSchema.parse(value ?? ZERO_TIMING));
}

function sourceIntelligence(value?: WorldGenerationSourceIntelligence): WorldGenerationSourceIntelligence {
  return Object.freeze(worldGenerationSourceIntelligenceSchema.parse(value ?? NOT_CONFIGURED_SOURCE_INTELLIGENCE));
}

function isSha256(value: string): boolean {
  return /^sha256:[a-f0-9]{64}$/.test(value);
}

function firstMismatch(
  generation: StructureGrammarCompilation,
  observation: Extract<StructureObservationResult, { status: "VERIFIED" }>,
  projection: StructureProjectionContract,
): { boundary: WorldGenerationParityBoundary; reason: string } | null {
  const recipe = generation.recipe;
  const identity = observation.identity;

  if (recipe.worldId !== identity.worldId ||
      recipe.worldSeedHash !== identity.worldSeedHash ||
      recipe.chunkCoordinate.x !== identity.chunkCoordinate.x ||
      recipe.chunkCoordinate.z !== identity.chunkCoordinate.z ||
      recipe.anchorId !== identity.anchorId ||
      recipe.grammarId !== identity.grammarId ||
      recipe.grammarVersion !== identity.grammarVersion ||
      recipe.sourceRevision !== identity.sourceRevision ||
      recipe.sourceCausalRoot !== identity.sourceCausalRoot) {
    return { boundary: "GENERATION_INPUT", reason: "GENERATION_INPUT_IDENTITY_MISMATCH" };
  }

  if (observation.recipeHash !== generation.deterministicFingerprint ||
      observation.materialization.recipeHash !== observation.recipeHash) {
    return { boundary: "RECIPE", reason: "WORLD_GENERATION_RECIPE_HASH_MISMATCH" };
  }

  if (projection.observationKey !== observation.observationKey ||
      projection.recipeHash !== observation.recipeHash ||
      projection.materializationHash !== observation.materialization.materializationHash) {
    return { boundary: "OBSERVATION", reason: "WORLD_GENERATION_PROJECTION_BINDING_MISMATCH" };
  }

  if (observation.materialization.observationKey !== observation.observationKey) {
    return { boundary: "MATERIALIZATION", reason: "WORLD_GENERATION_MATERIALIZATION_KEY_MISMATCH" };
  }

  return null;
}

function oracleBoundary(stage: string): WorldGenerationParityBoundary {
  if (stage === "CHECKPOINT_HASH" || stage === "CHECKPOINT_ANCHOR" || stage === "PRE_STATE") return "PRE_STATE";
  if (stage === "INPUT_ORDER") return "INPUT_ORDER";
  if (stage === "RNG_ROOT") return "RNG_ROOT";
  if (stage === "POST_STATE") return "POST_STATE";
  if (stage === "RECEIPT" || stage === "RECEIPT_CHAIN") return "RECEIPT";
  return "AUTHORITY_STAGE";
}

function verifyGameplay(
  input: WorldGenerationParityInput,
): { boundary: WorldGenerationParityBoundary; stage: string; tick: number; expected: string; observed: string } | null {
  const oracle = input.oracle;
  if (oracle.requestedRange.fromTick !== input.gameplay.fromTick ||
      oracle.requestedRange.toTick !== input.gameplay.toTick) {
    return {
      boundary: "PRE_STATE",
      stage: "REQUEST_RANGE",
      tick: input.gameplay.fromTick,
      expected: String(input.gameplay.fromTick) + ":" + String(input.gameplay.toTick),
      observed: String(oracle.requestedRange.fromTick) + ":" + String(oracle.requestedRange.toTick),
    };
  }

  if (oracle.sourceRevision !== input.generation.recipe.sourceRevision) {
    return {
      boundary: "RECEIPT",
      stage: "SOURCE_REVISION",
      tick: input.gameplay.fromTick,
      expected: input.generation.recipe.sourceRevision,
      observed: oracle.sourceRevision ?? "NULL",
    };
  }

  if (oracle.rulesetVersion !== input.runtime.rulesetVersion) {
    return {
      boundary: "RECEIPT",
      stage: "RULESET_VERSION",
      tick: input.gameplay.fromTick,
      expected: input.runtime.rulesetVersion,
      observed: oracle.rulesetVersion ?? "NULL",
    };
  }

  if (oracle.status === "FIRST_DIVERGENCE" && oracle.firstDivergence) {
    return {
      boundary: oracleBoundary(oracle.firstDivergence.stage),
      stage: oracle.firstDivergence.stage,
      tick: oracle.firstDivergence.tick,
      expected: oracle.firstDivergence.expectedHash,
      observed: oracle.firstDivergence.observedHash,
    };
  }

  if (oracle.status === "UNPROVABLE") {
    return {
      boundary: "RECEIPT",
      stage: "ORACLE_UNPROVABLE",
      tick: input.gameplay.fromTick,
      expected: "MATCH",
      observed: oracle.reason ?? "UNPROVABLE",
    };
  }

  const expectedTicks = Array.from(
    { length: input.gameplay.toTick - input.gameplay.fromTick + 1 },
    (_, index) => input.gameplay.fromTick + index,
  );
  if (oracle.verifiedTicks.join(",") !== expectedTicks.join(",")) {
    return {
      boundary: "RECEIPT",
      stage: "VERIFIED_TICK_SET",
      tick: input.gameplay.fromTick,
      expected: expectedTicks.join(","),
      observed: oracle.verifiedTicks.join(","),
    };
  }

  return null;
}

function baseEvidence(
  input: WorldGenerationParityInput,
  observation: Extract<StructureObservationResult, { status: "VERIFIED" }>,
  runtimeReference: WorldGenerationRuntimeIdentity,
  source: WorldGenerationSourceIntelligence,
  gameplay: WorldGenerationCausalGameplayEvidence,
): WorldGenerationParityEvidenceInput {
  const checksums = [...(input.artifactChecksums ?? [])]
    .map(checksum => ({ path: checksum.path, sha256: checksum.sha256 }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.sha256.localeCompare(b.sha256));

  return {
    schema: AURION_WORLD_GENERATION_PARITY_SCHEMA,
    mutationAuthority: "none",
    status: "MATCH",
    runId: input.runId,
    worldId: observation.identity.worldId,
    chunkCoordinate: { ...observation.identity.chunkCoordinate },
    anchorId: observation.identity.anchorId,
    worldSeedHash: observation.identity.worldSeedHash,
    causalRootHash: observation.identity.sourceCausalRoot,
    grammarId: observation.identity.grammarId,
    grammarVersion: observation.identity.grammarVersion,
    recipeHash: observation.recipeHash,
    dependencyRootHash: dependencyRootFromCompilation(input.generation),
    observationKey: observation.observationKey,
    confirmedChunkAuthorityStateHash: observation.identity.confirmedChunkAuthorityStateHash,
    materializationHash: observation.materialization.materializationHash,
    sourceRevision: observation.identity.sourceRevision,
    runtimeRevision: input.runtime.runtimeRevision,
    runtimeImageDigest: input.runtime.runtimeImageDigest,
    causalTickSchema: gameplay.causalTickSchema,
    rulesetVersion: gameplay.rulesetVersion,
    fromTick: gameplay.fromTick,
    toTick: gameplay.toTick,
    inputRootHash: gameplay.inputRootHash,
    preStateRootHash: gameplay.preStateRootHash,
    orderedIntentRootHash: gameplay.orderedIntentRootHash,
    authorityStageRootHash: gameplay.authorityStageRootHash,
    rngRootHash: gameplay.rngRootHash,
    postStateRootHash: gameplay.postStateRootHash,
    receiptRootHash: gameplay.receiptRootHash,
    oracleVerdict: input.oracle.status,
    oracleResultHash: input.oracle.oracleResultHash,
    firstDivergenceBoundary: null,
    firstDivergenceStage: null,
    firstDivergenceTick: null,
    firstDivergenceExpectedHash: null,
    firstDivergenceObservedHash: null,
    referenceRuntimeIdentity: runtimeReference,
    productionRuntimeIdentity: input.runtime,
    sourceIntelligence: source,
    sourceIntelligenceStatus: source.status,
    timing: timing(input.timing),
    artifactChecksums: Object.freeze(checksums),
    createdAt: input.createdAt ?? "UNVERIFIED",
  };
}

function finalizeEvidence(unsigned: WorldGenerationParityEvidenceInput): WorldGenerationParityEvidence {
  const determinismHash = computeWorldGenerationDeterminismHash(unsigned);
  const artifactIntegrityHash = computeWorldGenerationArtifactIntegrityHash(unsigned.artifactChecksums);
  const evidence = worldGenerationParityEvidenceSchema.parse({
    ...unsigned,
    determinismHash,
    artifactIntegrityHash,
  });
  return Object.freeze(evidence);
}

function withDivergence(
  unsigned: WorldGenerationParityEvidenceInput,
  divergence: { boundary: WorldGenerationParityBoundary; stage: string; tick: number; expected: string; observed: string },
): WorldGenerationParityEvidence {
  const hashValue = (value: string) => /^sha256:[a-f0-9]{64}$/.test(value) ? value : canonicalWorldGenerationHash(value);
  const next: WorldGenerationParityEvidenceInput = {
    ...unsigned,
    status: "FIRST_DIVERGENCE",
    firstDivergenceBoundary: divergence.boundary,
    firstDivergenceStage: divergence.stage,
    firstDivergenceTick: divergence.tick,
    firstDivergenceExpectedHash: hashValue(divergence.expected),
    firstDivergenceObservedHash: hashValue(divergence.observed),
  };
  return finalizeEvidence(next);
}

export function verifyWorldGenerationParity(
  input: WorldGenerationParityInput,
): WorldGenerationParityVerification {
  if (input.observation.status !== "VERIFIED") {
    throw new Error("WORLD_GENERATION_PARITY_REQUIRES_VERIFIED_OBSERVATION");
  }

  const source = sourceIntelligence(input.sourceIntelligence);
  const runtime = worldGenerationRuntimeIdentitySchema.parse(input.runtime);
  const reference = worldGenerationRuntimeIdentitySchema.parse(input.referenceRuntime ?? input.runtime);
  const observation = input.observation;

  if (!input.runId.trim()) throw new Error("WORLD_GENERATION_RUN_ID_REQUIRED");
  if (!isSha256(observation.identity.worldSeedHash) ||
      !isSha256(observation.identity.sourceCausalRoot) ||
      !isSha256(observation.identity.confirmedChunkAuthorityStateHash)) {
    throw new Error("WORLD_GENERATION_OBSERVATION_HASH_INVALID");
  }

  if (input.projection.identity.sourceRevision !== observation.identity.sourceRevision) {
    throw new Error("WORLD_GENERATION_PROJECTION_REVISION_MISMATCH");
  }

  const gameplay = worldGenerationGameplaySchema(input.gameplay);
  let unsigned = baseEvidence(input, observation, reference, source, gameplay);

  const structureMismatch = firstMismatch(input.generation, observation, input.projection);
  if (structureMismatch) {
    return Object.freeze({
      evidence: withDivergence(unsigned, {
        boundary: structureMismatch.boundary,
        stage: structureMismatch.boundary,
        tick: input.gameplay.fromTick,
        expected: structureMismatch.reason,
        observed: structureMismatch.reason,
      }),
      verified: false,
      diagnostic: structureMismatch.reason,
    });
  }

  if (
    runtime.sourceRevision !== input.generation.recipe.sourceRevision ||
    runtime.runtimeRevision !== input.generation.recipe.sourceRevision ||
    reference.sourceRevision !== input.generation.recipe.sourceRevision ||
    reference.runtimeRevision !== input.generation.recipe.sourceRevision ||
    runtime.causalTickSchema !== gameplay.causalTickSchema ||
    reference.causalTickSchema !== gameplay.causalTickSchema ||
    runtime.rulesetVersion !== gameplay.rulesetVersion ||
    reference.rulesetVersion !== gameplay.rulesetVersion
  ) {
    unsigned = { ...unsigned, status: "UNPROVABLE", firstDivergenceBoundary: "RUNTIME_IDENTITY" };
    return Object.freeze({
      evidence: finalizeEvidence(unsigned),
      verified: false,
      diagnostic: "WORLD_GENERATION_RUNTIME_IDENTITY_UNPROVABLE",
    });
  }

  const gameplayDivergence = verifyGameplay(input);
  if (gameplayDivergence) {
    return Object.freeze({
      evidence: withDivergence(unsigned, gameplayDivergence),
      verified: false,
      diagnostic: "WORLD_GENERATION_GAMEPLAY_" + gameplayDivergence.stage,
    });
  }

  if (input.oracle.status !== "MATCH" || !input.oracle.oracleResultHash) {
    unsigned = { ...unsigned, status: "UNPROVABLE", firstDivergenceBoundary: "RECEIPT" };
    return Object.freeze({
      evidence: finalizeEvidence(unsigned),
      verified: false,
      diagnostic: "WORLD_GENERATION_ORACLE_NOT_MATCH",
    });
  }

  return Object.freeze({
    evidence: finalizeEvidence(unsigned),
    verified: true,
    diagnostic: null,
  });
}

function worldGenerationGameplaySchema(
  gameplay: WorldGenerationCausalGameplayEvidence,
): WorldGenerationCausalGameplayEvidence {
  return Object.freeze({
    ...worldGenerationCausalGameplayEvidenceSchema.parse(gameplay),
  });
}

export function buildGameplayEvidenceFromReceipts(
  receipts: readonly AurionCausalTickReceipt[],
  fromTick: number,
  toTick: number,
): WorldGenerationCausalGameplayEvidence {
  return createGameplayEvidence(receipts, fromTick, toTick);
}
