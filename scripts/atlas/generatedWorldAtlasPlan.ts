import {
  evaluateGeneratedWorldAtlasInput,
  type AtlasWorldGenerationGateContext,
} from "./worldGenerationAtlasAdmission";
import {
  buildDeterministicAtlasPlan,
} from "./deterministicAtlasPack.mjs";

export const AURION_GENERATED_WORLD_ATLAS_PLAN_SCHEMA = "aurion.generated-world-atlas-plan.v1" as const;

export type GeneratedWorldAtlasPlanInput = Readonly<{
  evidence: unknown;
  gateContext: AtlasWorldGenerationGateContext;
  atlas: Readonly<Record<string, unknown>>;
}>;

export function buildGeneratedWorldAtlasPlan(input: GeneratedWorldAtlasPlanInput) {
  const admission = evaluateGeneratedWorldAtlasInput(input.evidence, input.gateContext);
  if (admission.verdict !== "ADMIT") {
    throw new Error("ATLAS_WORLD_GENERATION_EVIDENCE_GATE_" + admission.reason);
  }

  const plan = buildDeterministicAtlasPlan(input.atlas);
  return Object.freeze({
    schemaVersion: AURION_GENERATED_WORLD_ATLAS_PLAN_SCHEMA,
    consumer: admission.consumer,
    admissionHash: admission.admissionHash,
    evidenceDeterminismHash: admission.evidenceDeterminismHash,
    evidenceArtifactIntegrityHash: admission.evidenceArtifactIntegrityHash,
    plan,
  });
}
