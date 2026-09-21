import { writeFile } from "node:fs/promises";
import {
  openSource3dFallbackSource,
  planOpenSource3dFallback,
  searchOpenSource3dFallback,
} from "../server/openSource3dFallback";

const source = openSource3dFallbackSource();
const environmentPlan = await planOpenSource3dFallback({
  sourceAssetId: "ca-world-053",
  purpose: "world-environment",
  tier: "phone",
});

if (environmentPlan.registryRevision !== source.registryRevision) throw new Error("OS3A_PROBE_REGISTRY_REVISION_MISMATCH");
if (environmentPlan.modelRevision !== source.modelRevision) throw new Error("OS3A_PROBE_MODEL_REVISION_MISMATCH");
if (environmentPlan.license !== "CC0-1.0") throw new Error("OS3A_PROBE_LICENSE_MISMATCH");
if (!environmentPlan.validationPassed) throw new Error("OS3A_PROBE_GDS_VALIDATION_FAILED");
if (environmentPlan.sourceBytes !== 7956) throw new Error("OS3A_PROBE_SOURCE_SIZE_MISMATCH");
if (environmentPlan.classification.assetType !== "arena" || environmentPlan.classification.worldFamily !== "environment") {
  throw new Error("OS3A_PROBE_ENVIRONMENT_CLASSIFICATION_MISMATCH");
}
if (environmentPlan.budget.tier !== "phone" || environmentPlan.budget.conservativeWorkingSetBytes > environmentPlan.budget.limits.assetWorkingSetBytes) {
  throw new Error("OS3A_PROBE_BUDGET_MISMATCH");
}

const rankedEnemyCandidates = searchOpenSource3dFallback({
  query: "spider creature monster",
  tier: "phone",
  limit: 24,
}).matches
  .filter(match => match.transferBudgetFit
    && match.discoveryOnly
    && match.discoveryNote === "RIGGED_CREATURE_REQUIRES_DEDICATED_ENEMY_FALLBACK_LANE")
  .slice(0, 6);

const enemyAttempts: Array<Record<string, unknown>> = [];
let compatibleEnemyPlan: Awaited<ReturnType<typeof planOpenSource3dFallback>> | null = null;
for (const candidate of rankedEnemyCandidates) {
  try {
    const plan = await planOpenSource3dFallback({
      sourceAssetId: candidate.sourceAssetId,
      purpose: "enemy-fallback",
      tier: "phone",
    });
    if (plan.classification.assetType === "enemy" && plan.classification.subcategory === "spider") {
      compatibleEnemyPlan = plan;
      enemyAttempts.push({ sourceAssetId: candidate.sourceAssetId, status: "VERIFIED", classification: plan.classification });
      break;
    }
    enemyAttempts.push({ sourceAssetId: candidate.sourceAssetId, status: "REJECTED_CLASSIFICATION", classification: plan.classification });
  } catch (error) {
    enemyAttempts.push({
      sourceAssetId: candidate.sourceAssetId,
      status: "REJECTED",
      reason: error instanceof Error ? error.message : "UNKNOWN",
    });
  }
}

function publicPlanReceipt(plan: typeof environmentPlan) {
  return Object.freeze({
    sourceAssetId: plan.sourceAssetId,
    sourceSha256: plan.sourceSha256,
    sourceBytes: plan.sourceBytes,
    sourceMetadataSha256: plan.sourceMetadataSha256,
    fallbackPlanSha256: plan.planSha256,
    aurionImportPlanSha256: plan.aurionImportPlanSha256,
    gameDevPlanSha256: plan.gameDevPlanSha256,
    gameDevInspectSha256: plan.gameDevInspectSha256,
    gameDevValidateSha256: plan.gameDevValidateSha256,
    classification: plan.classification,
    budget: plan.budget,
    validationPassed: plan.validationPassed,
  });
}

const enemyProbe = compatibleEnemyPlan
  ? Object.freeze({
      status: "VERIFIED" as const,
      selected: publicPlanReceipt(compatibleEnemyPlan),
      attempts: Object.freeze(enemyAttempts),
    })
  : Object.freeze({
      status: "BLOCKED_NO_COMPATIBLE_ENEMY" as const,
      selected: null,
      attempts: Object.freeze(enemyAttempts),
    });

if (rankedEnemyCandidates.length < 1 || enemyAttempts.length < 1) throw new Error("OS3A_PROBE_ENEMY_DISCOVERY_EMPTY");
if (compatibleEnemyPlan && (compatibleEnemyPlan.gameplayAuthority !== "none" || compatibleEnemyPlan.worldPlacementAuthority !== "none")) {
  throw new Error("OS3A_PROBE_AUTHORITY_ESCALATION");
}

const receipt = Object.freeze({
  schemaVersion: "aurion.os3a-live-probe.v2",
  sourceRevision: process.env.AURION_RELEASE_SHA ?? null,
  registryRepository: source.registryRepository,
  registryRevision: source.registryRevision,
  modelRepository: source.modelRepository,
  modelRevision: source.modelRevision,
  license: source.license,
  environmentProbe: publicPlanReceipt(environmentPlan),
  enemyProbe,
  mutation: "none",
});
const output = JSON.stringify(receipt, null, 2) + "\n";
if (process.env.OS3A_EVIDENCE_PATH) await writeFile(process.env.OS3A_EVIDENCE_PATH, output, "utf8");
process.stdout.write(output);
