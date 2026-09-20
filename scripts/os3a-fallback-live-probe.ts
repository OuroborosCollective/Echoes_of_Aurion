import { writeFile } from "node:fs/promises";
import { openSource3dFallbackSource, planOpenSource3dFallback } from "../server/openSource3dFallback";

const source = openSource3dFallbackSource();
const plan = await planOpenSource3dFallback({
  sourceAssetId: "ca-world-053",
  purpose: "world-environment",
  tier: "phone",
});

if (plan.registryRevision !== source.registryRevision) throw new Error("OS3A_PROBE_REGISTRY_REVISION_MISMATCH");
if (plan.modelRevision !== source.modelRevision) throw new Error("OS3A_PROBE_MODEL_REVISION_MISMATCH");
if (plan.license !== "CC0-1.0") throw new Error("OS3A_PROBE_LICENSE_MISMATCH");
if (!plan.validationPassed) throw new Error("OS3A_PROBE_GDS_VALIDATION_FAILED");
if (plan.sourceBytes !== 7956) throw new Error("OS3A_PROBE_SOURCE_SIZE_MISMATCH");
if (plan.budget.tier !== "phone" || plan.budget.conservativeWorkingSetBytes > plan.budget.limits.assetWorkingSetBytes) {
  throw new Error("OS3A_PROBE_BUDGET_MISMATCH");
}
if (plan.gameplayAuthority !== "none" || plan.worldPlacementAuthority !== "none") throw new Error("OS3A_PROBE_AUTHORITY_ESCALATION");

const receipt = Object.freeze({
  schemaVersion: "aurion.os3a-live-probe.v1",
  sourceRevision: process.env.AURION_RELEASE_SHA ?? null,
  registryRepository: source.registryRepository,
  registryRevision: source.registryRevision,
  modelRepository: source.modelRepository,
  modelRevision: source.modelRevision,
  license: source.license,
  sourceAssetId: plan.sourceAssetId,
  sourceSha256: plan.sourceSha256,
  sourceBytes: plan.sourceBytes,
  sourceMetadataSha256: plan.sourceMetadataSha256,
  fallbackPlanSha256: plan.planSha256,
  aurionImportPlanSha256: plan.aurionImportPlanSha256,
  gameDevPlanSha256: plan.gameDevPlanSha256,
  gameDevInspectSha256: plan.gameDevInspectSha256,
  gameDevValidateSha256: plan.gameDevValidateSha256,
  budget: plan.budget,
  validationPassed: plan.validationPassed,
  mutation: "none",
});
const output = JSON.stringify(receipt, null, 2) + "\n";
if (process.env.OS3A_EVIDENCE_PATH) await writeFile(process.env.OS3A_EVIDENCE_PATH, output, "utf8");
process.stdout.write(output);
