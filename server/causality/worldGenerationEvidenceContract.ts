import { createHash } from "node:crypto";
import { z } from "zod";
import type { StructureGrammarCompilation } from "../../shared/deterministicStructureGrammarProtocol";
import type { AurionCausalTickReceipt } from "../../shared/aurionCausalTickContract";
import type { AurionHeadlessCausalOracleResult } from "../../shared/aurionHeadlessCausalOracleContract";

export const AURION_WORLD_GENERATION_PARITY_SCHEMA = "aurion.world-generation.parity.v1" as const;

export type WorldGenerationParityStatus = "MATCH" | "FIRST_DIVERGENCE" | "UNPROVABLE";

export type WorldGenerationParityBoundary =
  | "GENERATION_INPUT"
  | "RECIPE"
  | "SOURCE_INTELLIGENCE"
  | "OBSERVATION"
  | "MATERIALIZATION"
  | "RUNTIME_IDENTITY"
  | "PRE_STATE"
  | "INPUT_ORDER"
  | "AUTHORITY_STAGE"
  | "RNG_ROOT"
  | "POST_STATE"
  | "RECEIPT"
  | "ARTIFACT";

export type WorldGenerationSourceIntelligenceStatus =
  | "NOT_CONFIGURED"
  | "UNAVAILABLE"
  | "INCONCLUSIVE"
  | "SUCCEEDED_UNVERIFIED"
  | "SUCCEEDED_VERIFIED";

export type WorldGenerationRuntimeIdentity = Readonly<{
  sourceRevision: string;
  runtimeRevision: string;
  runtimeImageDigest: string;
  causalTickSchema: string;
  rulesetVersion: string;
}>;

export type WorldGenerationSourceIntelligence = Readonly<{
  status: WorldGenerationSourceIntelligenceStatus;
  parserVersion: string | null;
  parserRevision: string | null;
  parserStructureHash: string | null;
  inspectorVersion: string | null;
  inspectorRevision: string | null;
  inspectorFindingsHash: string | null;
  analysisVersion: string | null;
  requestSha256: string | null;
  responseSha256: string | null;
  analysisFingerprint: string | null;
  sourceBoundary: string;
}>;

export type WorldGenerationTiming = Readonly<{
  grammarCompileMs: number;
  cagAnalysisMs: number;
  observationMs: number;
  materializationMs: number;
  simulationMs: number;
  referenceReplayMs: number;
  persistenceMs: number;
  serializationMs: number;
  evidenceWriteMs: number;
}>;

export type WorldGenerationArtifactChecksum = Readonly<{
  path: string;
  sha256: string;
}>;

export type WorldGenerationCausalGameplayEvidence = Readonly<{
  worldId: string;
  zoneId: string;
  causalTickSchema: string;
  rulesetVersion: string;
  fromTick: number;
  toTick: number;
  inputRootHash: string;
  preStateRootHash: string;
  orderedIntentRootHash: string;
  authorityStageRootHash: string;
  rngRootHash: string;
  postStateRootHash: string;
  receiptRootHash: string;
}>;

export type WorldGenerationParityEvidence = Readonly<{
  schema: typeof AURION_WORLD_GENERATION_PARITY_SCHEMA;
  mutationAuthority: "none";
  status: WorldGenerationParityStatus;
  runId: string;
  worldId: string;
  chunkCoordinate: Readonly<{ x: number; z: number }>;
  anchorId: string;
  worldSeedHash: string;
  causalRootHash: string;
  grammarId: string;
  grammarVersion: string;
  recipeHash: string;
  dependencyRootHash: string;
  observationKey: string;
  confirmedChunkAuthorityStateHash: string;
  materializationHash: string;
  sourceRevision: string;
  runtimeRevision: string;
  runtimeImageDigest: string;
  causalTickSchema: string;
  rulesetVersion: string;
  fromTick: number;
  toTick: number;
  inputRootHash: string;
  preStateRootHash: string;
  orderedIntentRootHash: string;
  authorityStageRootHash: string;
  rngRootHash: string;
  postStateRootHash: string;
  receiptRootHash: string;
  oracleVerdict: AurionHeadlessCausalOracleResult["status"] | null;
  oracleResultHash: string | null;
  firstDivergenceBoundary: WorldGenerationParityBoundary | null;
  firstDivergenceStage: string | null;
  firstDivergenceTick: number | null;
  firstDivergenceExpectedHash: string | null;
  firstDivergenceObservedHash: string | null;
  referenceRuntimeIdentity: WorldGenerationRuntimeIdentity;
  productionRuntimeIdentity: WorldGenerationRuntimeIdentity;
  sourceIntelligence: WorldGenerationSourceIntelligence;
  sourceIntelligenceStatus: WorldGenerationSourceIntelligenceStatus;
  determinismHash: string;
  artifactIntegrityHash: string;
  timing: WorldGenerationTiming;
  artifactChecksums: readonly WorldGenerationArtifactChecksum[];
  createdAt: string;
}>;

const SHA = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const BARE_SHA = z.string().regex(/^[a-f0-9]{64}$/);
const REVISION = z.string().regex(/^[a-f0-9]{40}$/);
const IDENTIFIER = z.string().trim().min(1).max(256);

export const worldGenerationRuntimeIdentitySchema = z.strictObject({
  sourceRevision: REVISION,
  runtimeRevision: REVISION,
  runtimeImageDigest: SHA,
  causalTickSchema: IDENTIFIER,
  rulesetVersion: IDENTIFIER,
});

export const worldGenerationSourceIntelligenceSchema = z.strictObject({
  status: z.enum([
    "NOT_CONFIGURED",
    "UNAVAILABLE",
    "INCONCLUSIVE",
    "SUCCEEDED_UNVERIFIED",
    "SUCCEEDED_VERIFIED",
  ]),
  parserVersion: IDENTIFIER.nullable(),
  parserRevision: IDENTIFIER.nullable(),
  parserStructureHash: SHA.nullable(),
  inspectorVersion: IDENTIFIER.nullable(),
  inspectorRevision: IDENTIFIER.nullable(),
  inspectorFindingsHash: SHA.nullable(),
  analysisVersion: IDENTIFIER.nullable(),
  requestSha256: SHA.nullable(),
  responseSha256: SHA.nullable(),
  analysisFingerprint: SHA.nullable(),
  sourceBoundary: IDENTIFIER,
});

export const worldGenerationTimingSchema = z.strictObject({
  grammarCompileMs: z.number().finite().nonnegative(),
  cagAnalysisMs: z.number().finite().nonnegative(),
  observationMs: z.number().finite().nonnegative(),
  materializationMs: z.number().finite().nonnegative(),
  simulationMs: z.number().finite().nonnegative(),
  referenceReplayMs: z.number().finite().nonnegative(),
  persistenceMs: z.number().finite().nonnegative(),
  serializationMs: z.number().finite().nonnegative(),
  evidenceWriteMs: z.number().finite().nonnegative(),
});

export const worldGenerationArtifactChecksumSchema = z.strictObject({
  path: IDENTIFIER,
  sha256: SHA,
});

export const worldGenerationCausalGameplayEvidenceSchema = z.strictObject({
  worldId: IDENTIFIER,
  zoneId: IDENTIFIER,
  causalTickSchema: IDENTIFIER,
  rulesetVersion: IDENTIFIER,
  fromTick: z.number().int().positive(),
  toTick: z.number().int().positive(),
  inputRootHash: SHA,
  preStateRootHash: SHA,
  orderedIntentRootHash: SHA,
  authorityStageRootHash: SHA,
  rngRootHash: SHA,
  postStateRootHash: SHA,
  receiptRootHash: SHA,
}).refine(value => value.toTick >= value.fromTick, "WORLD_GENERATION_RANGE_INVALID");

export type WorldGenerationParityEvidenceInput = Omit<
  WorldGenerationParityEvidence,
  "determinismHash" | "artifactIntegrityHash"
>;

export const worldGenerationParityEvidenceSchema = z.strictObject({
  schema: z.literal(AURION_WORLD_GENERATION_PARITY_SCHEMA),
  mutationAuthority: z.literal("none"),
  status: z.enum(["MATCH", "FIRST_DIVERGENCE", "UNPROVABLE"]),
  runId: IDENTIFIER,
  worldId: IDENTIFIER,
  chunkCoordinate: z.strictObject({ x: z.number().int(), z: z.number().int() }),
  anchorId: IDENTIFIER,
  worldSeedHash: SHA,
  causalRootHash: SHA,
  grammarId: IDENTIFIER,
  grammarVersion: IDENTIFIER,
  recipeHash: BARE_SHA,
  dependencyRootHash: SHA,
  observationKey: SHA,
  confirmedChunkAuthorityStateHash: SHA,
  materializationHash: SHA,
  sourceRevision: REVISION,
  runtimeRevision: REVISION,
  runtimeImageDigest: SHA,
  causalTickSchema: IDENTIFIER,
  rulesetVersion: IDENTIFIER,
  fromTick: z.number().int().positive(),
  toTick: z.number().int().positive(),
  inputRootHash: SHA,
  preStateRootHash: SHA,
  orderedIntentRootHash: SHA,
  authorityStageRootHash: SHA,
  rngRootHash: SHA,
  postStateRootHash: SHA,
  receiptRootHash: SHA,
  oracleVerdict: z.enum(["MATCH", "FIRST_DIVERGENCE", "UNPROVABLE"]).nullable(),
  oracleResultHash: SHA.nullable(),
  firstDivergenceBoundary: z.enum([
    "GENERATION_INPUT",
    "RECIPE",
    "SOURCE_INTELLIGENCE",
    "OBSERVATION",
    "MATERIALIZATION",
    "RUNTIME_IDENTITY",
    "PRE_STATE",
    "INPUT_ORDER",
    "AUTHORITY_STAGE",
    "RNG_ROOT",
    "POST_STATE",
    "RECEIPT",
    "ARTIFACT",
  ]).nullable(),
  firstDivergenceStage: IDENTIFIER.nullable(),
  firstDivergenceTick: z.number().int().positive().nullable(),
  firstDivergenceExpectedHash: SHA.nullable(),
  firstDivergenceObservedHash: SHA.nullable(),
  referenceRuntimeIdentity: worldGenerationRuntimeIdentitySchema,
  productionRuntimeIdentity: worldGenerationRuntimeIdentitySchema,
  sourceIntelligence: worldGenerationSourceIntelligenceSchema,
  sourceIntelligenceStatus: worldGenerationSourceIntelligenceSchema.shape.status,
  determinismHash: SHA,
  artifactIntegrityHash: SHA,
  timing: worldGenerationTimingSchema,
  artifactChecksums: z.array(worldGenerationArtifactChecksumSchema).max(128),
  createdAt: z.string().trim().min(1).max(64),
}).refine(value => value.toTick >= value.fromTick, "WORLD_GENERATION_RANGE_INVALID");

export function canonicalWorldGenerationEvidenceJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalWorldGenerationEvidenceJson).join(",") + "]";
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return "{" + Object.keys(record).sort().map(key => JSON.stringify(key) + ":" + canonicalWorldGenerationEvidenceJson(record[key])).join(",") + "}";
  }
  return JSON.stringify(String(value));
}

export function canonicalWorldGenerationHash(value: unknown): string {
  return "sha256:" + createHash("sha256")
    .update(canonicalWorldGenerationEvidenceJson(value), "utf8")
    .digest("hex");
}

export function dependencyRootFromCompilation(compilation: StructureGrammarCompilation): string {
  return canonicalWorldGenerationHash({
    schema: "aurion.world-generation.dependencies.v1",
    ruleIds: [...compilation.dependencies.ruleIds].sort(),
    assetKeys: [...compilation.dependencies.assetKeys].sort(),
    materialKeys: [...compilation.dependencies.materialKeys].sort(),
  });
}

export function createGameplayEvidence(
  receipts: readonly AurionCausalTickReceipt[],
  fromTick: number,
  toTick: number,
): WorldGenerationCausalGameplayEvidence {
  if (!Number.isSafeInteger(fromTick) || !Number.isSafeInteger(toTick) || fromTick < 1 || toTick < fromTick) {
    throw new Error("WORLD_GENERATION_GAMEPLAY_RANGE_INVALID");
  }
  const selected = receipts
    .filter(receipt => receipt.tick >= fromTick && receipt.tick <= toTick)
    .sort((a, b) => a.tick - b.tick);
  if (selected.length !== toTick - fromTick + 1) throw new Error("WORLD_GENERATION_GAMEPLAY_RECEIPT_GAP");

  for (let index = 0; index < selected.length; index += 1) {
    const receipt = selected[index]!;
    if (receipt.tick !== fromTick + index) throw new Error("WORLD_GENERATION_GAMEPLAY_TICK_ORDER_INVALID");
    if (receipt.worldId !== firstIdentityWorldId || receipt.zoneId !== firstIdentityZoneId || receipt.sourceRevision !== firstIdentityRevision || receipt.rulesetVersion !== firstIdentityRuleset || receipt.schema !== firstIdentitySchema) {
      throw new Error("WORLD_GENERATION_GAMEPLAY_IDENTITY_MISMATCH");
    }
    if (index > 0 && receipt.previousReceiptHash !== selected[index - 1]!.receiptHash) {
      throw new Error("WORLD_GENERATION_GAMEPLAY_RECEIPT_CHAIN_INVALID");
    }
  }

  const first = selected[0]!;
  const firstIdentityWorldId = first.worldId;
  const firstIdentityZoneId = first.zoneId;
  const firstIdentityRevision = first.sourceRevision;
  const firstIdentityRuleset = first.rulesetVersion;
  const firstIdentitySchema = first.schema;
  const stageRows = selected.map(receipt => ({
    tick: receipt.tick,
    schema: receipt.schema,
    transitionHash: receipt.transitionHash,
    stages: receipt.schema === "aurion.causal.tick.v2"
      ? receipt.stages.map(stage => ({
          stageName: stage.stageName,
          stageOrdinal: stage.stageOrdinal,
          stageInputIdentity: stage.stageInputIdentity,
          canonicalStateHash: stage.canonicalStateHash,
          transitionHash: stage.transitionHash,
        }))
      : null,
  }));
  const root = (domain: string, values: unknown[]) => canonicalWorldGenerationHash({ domain, values });

  return Object.freeze({
    worldId: first.worldId,
    zoneId: first.zoneId,
    causalTickSchema: first.schema,
    rulesetVersion: first.rulesetVersion,
    fromTick,
    toTick,
    inputRootHash: root("aurion.world-generation.gameplay-input-root.v1", selected.map(r => ({
      tick: r.tick,
      preStateHash: r.preStateHash,
      orderedIntentHash: r.orderedIntentHash,
    }))),
    preStateRootHash: root("aurion.world-generation.pre-state-root.v1", selected.map(r => [r.tick, r.preStateHash])),
    orderedIntentRootHash: root("aurion.world-generation.ordered-intent-root.v1", selected.map(r => [r.tick, r.orderedIntentHash])),
    authorityStageRootHash: root("aurion.world-generation.authority-stage-root.v1", stageRows),
    rngRootHash: root("aurion.world-generation.rng-root.v1", selected.map(r => [r.tick, r.rngRootHash])),
    postStateRootHash: root("aurion.world-generation.post-state-root.v1", selected.map(r => [r.tick, r.postStateHash])),
    receiptRootHash: root("aurion.world-generation.receipt-root.v1", selected.map(r => [r.tick, r.receiptHash])),
  });
}

export function assertWorldGenerationRuntimeIdentity(value: unknown): asserts value is WorldGenerationRuntimeIdentity {
  worldGenerationRuntimeIdentitySchema.parse(value);
}

export function assertWorldGenerationSourceIntelligence(value: unknown): asserts value is WorldGenerationSourceIntelligence {
  worldGenerationSourceIntelligenceSchema.parse(value);
}

export function assertWorldGenerationEvidence(value: unknown): asserts value is WorldGenerationParityEvidence {
  const parsed = worldGenerationParityEvidenceSchema.parse(value);
  if (parsed.status === "MATCH" && parsed.firstDivergenceBoundary !== null) {
    throw new Error("WORLD_GENERATION_MATCH_WITH_DIVERGENCE");
  }
}
