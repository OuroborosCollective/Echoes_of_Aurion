import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  validateServiceCellManifest,
  type AurionServiceCellManifest,
} from "../shared/aurionServiceCellContract";

/**
 * Aurion Service Cell Boundary Verifier (Issue #140).
 *
 * Statically verifies that no Aurion Service Cell can obtain Gameplay-/World-Write-Authority
 * outside of explicitly registered Aurion-Domain-Contracts. Also detects legacy gameplay
 * owners (WASD/AX1) referenced in new production paths as drift.
 */

/** Legacy gameplay owners that must not appear as active dependencies in production paths. */
export const LEGACY_GAMEPLAY_OWNERS = ["wasd", "ax1"] as const;
export type LegacyGameplayOwner = (typeof LEGACY_GAMEPLAY_OWNERS)[number];

export interface BoundaryViolation {
  readonly rule: string;
  readonly cellId: string;
  readonly message: string;
  readonly severity: "error" | "drift";
}

/** Registry of explicitly registered Aurion-Domain-Contracts. */
export interface ContractRegistry {
  readonly contracts: ReadonlyMap<string, { contractId: string; scope: string; deterministic: true; requiresReceipt: true; requiresReadback: true }>;
}

export function createContractRegistry(contracts: readonly {
  contractId: string;
  scope: string;
  deterministic: true;
  requiresReceipt: true;
  requiresReadback: true;
}[]): ContractRegistry {
  const map = new Map<string, { contractId: string; scope: string; deterministic: true; requiresReceipt: true; requiresReadback: true }>();
  for (const contract of contracts) {
    if (map.has(contract.contractId)) {
      throw new Error(`DUPLICATE_CONTRACT_REGISTRATION:${contract.contractId}`);
    }
    if (!contract.deterministic || !contract.requiresReceipt || !contract.requiresReadback) {
      throw new Error(`CONTRACT_DOES_NOT_MEET_AURION_STANDARD:${contract.contractId}`);
    }
    map.set(contract.contractId, contract);
  }
  return Object.freeze({ contracts: map });
}

/**
 * Verify all service cell manifests against the boundary rules.
 * Returns a list of violations — empty means all boundaries hold.
 */
export function verifyServiceCellBoundaries(
  manifests: readonly AurionServiceCellManifest[],
  registry: ContractRegistry,
): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];

  for (const manifest of manifests) {
    // Rule: manifest must be valid (ownsEffects=false, no global write authority, etc.)
    const validation = validateServiceCellManifest(manifest);
    if (!validation.valid) {
      for (const error of validation.errors) {
        violations.push({
          rule: "MANIFEST_VALIDATION",
          cellId: manifest.cellId,
          message: error,
          severity: "error",
        });
      }
      continue;
    }

    // Rule: mayWriteGameplayTruth must not be globally true (already enforced by validation,
    // but we double-check for defense in depth — cast through unknown to avoid TS narrowing).
    const gameplayWrite = manifest.mayWriteGameplayTruth as unknown;
    if (gameplayWrite === true) {
      violations.push({
        rule: "NO_GLOBAL_GAMEPLAY_WRITE",
        cellId: manifest.cellId,
        message: "mayWriteGameplayTruth is globally enabled",
        severity: "error",
      });
    }

    const worldWrite = manifest.mayWriteWorldTruth as unknown;
    if (worldWrite === true) {
      violations.push({
        rule: "NO_GLOBAL_WORLD_WRITE",
        cellId: manifest.cellId,
        message: "mayWriteWorldTruth is globally enabled",
        severity: "error",
      });
    }

    const gameplayRules = manifest.mayDefineGameplayRules as unknown;
    if (gameplayRules === true) {
      violations.push({
        rule: "NO_GLOBAL_GAMEPLAY_RULES",
        cellId: manifest.cellId,
        message: "mayDefineGameplayRules is globally enabled",
        severity: "error",
      });
    }

    // Rule: contract-bound cells must have all registered contracts in the registry.
    if (
      manifest.mayWriteGameplayTruth === "contract-bound-only" ||
      manifest.mayWriteWorldTruth === "contract-bound-only"
    ) {
      for (const contractId of manifest.registeredContracts) {
        if (!registry.contracts.has(contractId)) {
          violations.push({
            rule: "CONTRACT_NOT_REGISTERED",
            cellId: manifest.cellId,
            message: `contract-bound cell references unregistered contract: ${contractId}`,
            severity: "error",
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Detect legacy gameplay owners (WASD/AX1) referenced in new production paths.
 * Returns drift warnings — these are not hard errors but must be flagged.
 */
export function detectLegacyDrift(sourceFiles: readonly { path: string; content: string }[]): BoundaryViolation[] {
  const drifts: BoundaryViolation[] = [];

  for (const file of sourceFiles) {
    // Skip provenance/migration documentation — legacy references there are expected.
    if (
      file.path.includes("docs/migrations/") ||
      file.path.includes("provenance") ||
      file.path.endsWith("ARCHITECTURE_OWNERSHIP.md") ||
      file.path.endsWith("AGENTS.md")
    ) {
      continue;
    }

    // Look for active dependency patterns on legacy owners in production code.
    // Pattern: import from wasd/ax1 as active runtime dependency (not provenance).
    const activeDependencyPatterns = [
      /import\s+.*\s+from\s+["'].*\/wasd-?(?:runtime|gameplay|combat|world|loot|quest|npc|economy)/i,
      /import\s+.*\s+from\s+["'].*\/ax1-?(?:runtime|gameplay|combat|world|loot|quest|npc|economy)/i,
      /require\s*\(\s*["'].*\/wasd-?(?:runtime|gameplay|combat|world|loot|quest|npc|economy)/i,
      /require\s*\(\s*["'].*\/ax1-?(?:runtime|gameplay|combat|world|loot|quest|npc|economy)/i,
    ];

    for (const pattern of activeDependencyPatterns) {
      if (pattern.test(file.content)) {
        drifts.push({
          rule: "LEGACY_GAMEPLAY_OWNER_IN_PRODUCTION_PATH",
          cellId: "unknown",
          message: `file ${file.path} references legacy gameplay owner as active dependency`,
          severity: "drift",
        });
      }
    }
  }

  return drifts;
}

/**
 * Verify that observability side-channel functions are non-mutating.
 * This is enforced by the pipeline contract: the ObservabilitySink returns void
 * and must not modify any state. This function statically checks that the
 * sink function does not call mutation methods.
 */
export function verifyObservabilityNonMutating(sinkSource: string): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  const mutationPatterns = [
    /\.set\s*\(/,
    /\.delete\s*\(/,
    /\.push\s*\(/,
    /\.splice\s*\(/,
    /\.write\s*\(/,
    /\.update\s*\(/,
    /\.insert\s*\(/,
    /\.upsert\s*\(/,
    /\.mutate\s*\(/,
  ];

  for (const pattern of mutationPatterns) {
    if (pattern.test(sinkSource)) {
      violations.push({
        rule: "OBSERVABILITY_MUTATES_STATE",
        cellId: "unknown",
        message: `observability sink contains mutation call: ${pattern.source}`,
        severity: "error",
      });
    }
  }

  return violations;
}

/**
 * Verify that pure validation functions do not use non-deterministic sources:
 * Date.now, Math.random, network, or direct DB access.
 */
export function verifyPureValidationDeterministic(validationSource: string): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  const nonDeterministicPatterns = [
    { pattern: /Date\.now\s*\(/, rule: "PURE_VALIDATION_USES_DATE_NOW" },
    { pattern: /Math\.random\s*\(/, rule: "PURE_VALIDATION_USES_MATH_RANDOM" },
    { pattern: /new\s+Date\s*\(/, rule: "PURE_VALIDATION_USES_NEW_DATE" },
    { pattern: /fetch\s*\(/, rule: "PURE_VALIDATION_USES_NETWORK" },
    { pattern: /await\s+.*(?:query|execute|raw)\s*\(/i, rule: "PURE_VALIDATION_USES_DB" },
  ];

  for (const { pattern, rule } of nonDeterministicPatterns) {
    if (pattern.test(validationSource)) {
      violations.push({
        rule,
        cellId: "unknown",
        message: `pure validation function uses non-deterministic source: ${pattern.source}`,
        severity: "error",
      });
    }
  }

  return violations;
}

/**
 * Full boundary verification: manifests + registry + legacy drift + observability + pure validation.
 */
export function runFullBoundaryVerification(input: {
  manifests: readonly AurionServiceCellManifest[];
  registry: ContractRegistry;
  sourceFiles?: readonly { path: string; content: string }[];
  observabilitySinkSource?: string;
  validationSource?: string;
}): {
  violations: BoundaryViolation[];
  passed: boolean;
  evidenceHash: string;
} {
  const violations: BoundaryViolation[] = [];

  violations.push(...verifyServiceCellBoundaries(input.manifests, input.registry));

  if (input.sourceFiles) {
    violations.push(...detectLegacyDrift(input.sourceFiles));
  }

  if (input.observabilitySinkSource) {
    violations.push(...verifyObservabilityNonMutating(input.observabilitySinkSource));
  }

  if (input.validationSource) {
    violations.push(...verifyPureValidationDeterministic(input.validationSource));
  }

  const errors = violations.filter(v => v.severity === "error");
  const evidenceHash = canonicalSha256({
    manifestCount: input.manifests.length,
    contractCount: input.registry.contracts.size,
    violationCount: violations.length,
    errorCount: errors.length,
    rules: violations.map(v => v.rule).sort(),
  });

  return {
    violations,
    passed: errors.length === 0,
    evidenceHash,
  };
}
