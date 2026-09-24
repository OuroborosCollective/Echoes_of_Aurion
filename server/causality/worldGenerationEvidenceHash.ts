import { createHash } from "node:crypto";
import type { WorldGenerationArtifactChecksum, WorldGenerationParityEvidence } from "./worldGenerationEvidenceContract";
import { canonicalWorldGenerationEvidenceJson, canonicalWorldGenerationHash } from "./worldGenerationEvidenceContract";

export function computeWorldGenerationDeterminismHash(
  evidence: Omit<WorldGenerationParityEvidence, "determinismHash" | "artifactIntegrityHash">,
): string {
  return canonicalWorldGenerationHash({
    schema: "aurion.world-generation.determinism.v1",
    worldId: evidence.worldId,
    chunkCoordinate: evidence.chunkCoordinate,
    anchorId: evidence.anchorId,
    worldSeedHash: evidence.worldSeedHash,
    causalRootHash: evidence.causalRootHash,
    grammarId: evidence.grammarId,
    grammarVersion: evidence.grammarVersion,
    recipeHash: evidence.recipeHash,
    dependencyRootHash: evidence.dependencyRootHash,
    observationKey: evidence.observationKey,
    confirmedChunkAuthorityStateHash: evidence.confirmedChunkAuthorityStateHash,
    materializationHash: evidence.materializationHash,
    sourceRevision: evidence.sourceRevision,
    causalTickSchema: evidence.causalTickSchema,
    rulesetVersion: evidence.rulesetVersion,
    fromTick: evidence.fromTick,
    toTick: evidence.toTick,
    inputRootHash: evidence.inputRootHash,
    preStateRootHash: evidence.preStateRootHash,
    orderedIntentRootHash: evidence.orderedIntentRootHash,
    authorityStageRootHash: evidence.authorityStageRootHash,
    rngRootHash: evidence.rngRootHash,
    postStateRootHash: evidence.postStateRootHash,
    receiptRootHash: evidence.receiptRootHash,
    oracleVerdict: evidence.oracleVerdict,
    oracleResultHash: evidence.oracleResultHash,
    sourceIntelligence: evidence.sourceIntelligence.status === "SUCCEEDED_VERIFIED"
      ? {
          status: evidence.sourceIntelligence.status,
          parserStructureHash: evidence.sourceIntelligence.parserStructureHash,
          inspectorFindingsHash: evidence.sourceIntelligence.inspectorFindingsHash,
          analysisVersion: evidence.sourceIntelligence.analysisVersion,
          requestSha256: evidence.sourceIntelligence.requestSha256,
          responseSha256: evidence.sourceIntelligence.responseSha256,
          analysisFingerprint: evidence.sourceIntelligence.analysisFingerprint,
        }
      : { status: evidence.sourceIntelligence.status },
  });
}

export function computeWorldGenerationArtifactIntegrityHash(
  checksums: readonly WorldGenerationArtifactChecksum[],
): string {
  const canonical = [...checksums]
    .sort((a, b) => a.path.localeCompare(b.path) || a.sha256.localeCompare(b.sha256))
    .map(checksum => ({ path: checksum.path, sha256: checksum.sha256 }));
  return canonicalWorldGenerationHash({
    schema: "aurion.world-generation.artifact-integrity.v1",
    artifacts: canonical,
  });
}

export function sha256Bytes(value: Uint8Array): string {
  return "sha256:" + createHash("sha256").update(value).digest("hex");
}

export function verifyWorldGenerationDeterminismHash(evidence: WorldGenerationParityEvidence): boolean {
  const { determinismHash: _determinismHash, artifactIntegrityHash: _artifactIntegrityHash, ...unsigned } = evidence;
  return computeWorldGenerationDeterminismHash(unsigned) === evidence.determinismHash;
}

export function verifyWorldGenerationArtifactIntegrityHash(evidence: WorldGenerationParityEvidence): boolean {
  return computeWorldGenerationArtifactIntegrityHash(evidence.artifactChecksums) === evidence.artifactIntegrityHash;
}

export function verifyWorldGenerationEvidenceBytes(value: string): string {
  return canonicalWorldGenerationHash(JSON.parse(value) as unknown);
}

export function canonicalEvidencePayload(value: unknown): string {
  return canonicalWorldGenerationEvidenceJson(value);
}
