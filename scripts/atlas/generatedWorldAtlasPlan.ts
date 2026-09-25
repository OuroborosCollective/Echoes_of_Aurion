import {
  evaluateGeneratedWorldAtlasInput,
  type AtlasWorldGenerationGateContext,
} from "./worldGenerationAtlasAdmission";
import { buildDeterministicAtlasPlan } from "./deterministicAtlasPack.mjs";
import {
  buildGeneratedStructurePresentationProvenance,
  type GeneratedStructurePresentationProvenance,
} from "./generatedStructurePresentationProvenance";

export const AURION_GENERATED_WORLD_ATLAS_PLAN_SCHEMA = "aurion.generated-world-atlas-plan.v1" as const;

export type GeneratedWorldAtlasPlanInput = Readonly<{
  evidence: unknown;
  gateContext: AtlasWorldGenerationGateContext;
  atlas: Readonly<Record<string, unknown>>;
  structureProjection?: unknown;
}>;

function assertProjectionMatchesEvidence(
  provenance: GeneratedStructurePresentationProvenance,
  evidence: unknown,
): void {
  if (!evidence || typeof evidence !== "object") throw new Error("ATLAS_EVIDENCE_REQUIRED");
  const value = evidence as Record<string, unknown>;
  const checks: readonly [string, unknown, unknown][] = [
    ["worldId", provenance.worldId, value.worldId],
    ["observationKey", provenance.observationKey, value.observationKey],
    ["recipeHash", provenance.recipeHash, value.recipeHash],
    ["materializationHash", provenance.materializationHash, value.materializationHash],
    ["sourceRevision", provenance.sourceRevision, value.sourceRevision],
    ["sourceCausalRoot", provenance.sourceCausalRoot, value.causalRootHash],
    ["confirmedChunkAuthorityStateHash", provenance.confirmedChunkAuthorityStateHash, value.confirmedChunkAuthorityStateHash],
  ];
  const mismatch = checks.find(([, expected, observed]) => expected !== observed);
  if (mismatch) throw new Error("ATLAS_PRESENTATION_EVIDENCE_" + mismatch[0].toUpperCase() + "_MISMATCH");
}

export function buildGeneratedWorldAtlasPlan(input: GeneratedWorldAtlasPlanInput) {
  const admission = evaluateGeneratedWorldAtlasInput(input.evidence, input.gateContext);
  if (admission.verdict !== "ADMIT") {
    throw new Error("ATLAS_WORLD_GENERATION_EVIDENCE_GATE_" + admission.reason);
  }

  const presentationProvenance = input.structureProjection
    ? buildGeneratedStructurePresentationProvenance(input.structureProjection)
    : null;

  if (presentationProvenance) {
    assertProjectionMatchesEvidence(presentationProvenance, input.evidence);
  }

  const plan = buildDeterministicAtlasPlan(input.atlas);
  return Object.freeze({
    schemaVersion: AURION_GENERATED_WORLD_ATLAS_PLAN_SCHEMA,
    consumer: admission.consumer,
    admissionHash: admission.admissionHash,
    evidenceDeterminismHash: admission.evidenceDeterminismHash,
    evidenceArtifactIntegrityHash: admission.evidenceArtifactIntegrityHash,
    presentationProvenance,
    plan,
  });
}
