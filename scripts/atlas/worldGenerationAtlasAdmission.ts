import {
  evaluateWorldGenerationEvidenceGate,
  type WorldGenerationEvidenceGateAdmission,
} from "../../server/causality/worldGenerationEvidenceGate";

export type AtlasWorldGenerationGateContext = Readonly<{
  expectedWorldId: string;
  expectedSourceRevision: string;
  expectedRuntimeRevision: string;
  expectedRuntimeImageDigest: string;
  expectedCausalTickSchema: string;
  expectedRulesetVersion: string;
}>;

/**
 * #505 build-time admission boundary.
 *
 * The atlas builder may consume a generated-world presentation descriptor only
 * after #510 parity evidence has been independently verified. This helper does
 * not generate, mutate or materialize world state.
 */
export function evaluateGeneratedWorldAtlasInput(
  evidence: unknown,
  context: AtlasWorldGenerationGateContext,
): WorldGenerationEvidenceGateAdmission {
  return evaluateWorldGenerationEvidenceGate(evidence, {
    consumer: "ATLAS_BUILD",
    expectedWorldId: context.expectedWorldId,
    expectedSourceRevision: context.expectedSourceRevision,
    expectedRuntimeRevision: context.expectedRuntimeRevision,
    expectedRuntimeImageDigest: context.expectedRuntimeImageDigest,
    expectedCausalTickSchema: context.expectedCausalTickSchema,
    expectedRulesetVersion: context.expectedRulesetVersion,
    requireOracleMatch: true,
    requireArtifactIntegrity: true,
  });
}

export function assertGeneratedWorldAtlasInput(
  evidence: unknown,
  context: AtlasWorldGenerationGateContext,
): asserts evidence is Record<string, unknown> {
  const admission = evaluateGeneratedWorldAtlasInput(evidence, context);
  if (admission.verdict !== "ADMIT") {
    throw new Error("ATLAS_WORLD_GENERATION_EVIDENCE_GATE_" + admission.reason);
  }
}
