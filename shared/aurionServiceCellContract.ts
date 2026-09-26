import { canonicalSha256 } from "./aurionCanonicalHash";

/**
 * Aurion Service Cell Standard — Manifest Contract (Issue #140).
 *
 * Defines the verbindliche Ownership-Grenze: Aurion Service Cells are part of
 * the Aurion-Authority. Gameplay-/World-/Progressions functions may only become
 * available through explicitly defined Aurion Contracts, Rules, Effects and
 * Transactions.
 *
 * `mayWriteGameplayTruth`, `mayWriteWorldTruth` and `mayDefineGameplayRules`
 * may NOT be globally enabled. Only explicitly registered Aurion-Domain-Contracts
 * with statically verifiable scope binding, AuthN/AuthZ, deterministic transaction,
 * receipt and readback are permitted.
 */

export const AURION_SERVICE_CELL_SCHEMA_VERSION = "aurion.service-cell.v2" as const;

export type AurionServiceCellScope =
  | "account"
  | "community"
  | "asset"
  | "ops"
  | "persistence"
  | "readmodel"
  | "evidence";

export const SERVICE_CELL_SCOPES: readonly AurionServiceCellScope[] = [
  "account",
  "community",
  "asset",
  "ops",
  "persistence",
  "readmodel",
  "evidence",
];

/** Write authority is never globally `true` — only `false` or contract-bound. */
export type WriteAuthority = false | "contract-bound-only";

/** Rule authority is never globally `true` — only explicit domain contracts. */
export type RuleAuthority = "explicit-domain-contracts-only";

export interface AurionServiceCellManifest {
  readonly schemaVersion: typeof AURION_SERVICE_CELL_SCHEMA_VERSION;
  readonly cellId: string;
  readonly scope: AurionServiceCellScope;
  /** Technically immutable: always `false` in the Aurion template. */
  readonly ownsEffects: false;
  /** May not be globally freischaltbar. Only `false` or `"contract-bound-only"`. */
  readonly mayWriteGameplayTruth: WriteAuthority;
  /** May not be globally freischaltbar. Only `false` or `"contract-bound-only"`. */
  readonly mayWriteWorldTruth: WriteAuthority;
  /** May not be globally freischaltbar. Only `"explicit-domain-contracts-only"`. */
  readonly mayDefineGameplayRules: RuleAuthority;
  readonly requiresTargetReadback: true;
  readonly requiresIdempotencyForEffects: true;
  /** Explicitly registered Aurion-Domain-Contracts with statically verifiable scope binding. */
  readonly registeredContracts: readonly string[];
  readonly manifestHash: string;
}

const CELL_ID = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;
const CONTRACT_ID = /^[a-z][a-z0-9-]{1,62}[a-z0-9]$/;

export interface ManifestValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a manifest against the Aurion Service Cell Standard.
 * Enforces that gameplay/world write authority is never globally enabled.
 */
export function validateServiceCellManifest(manifest: unknown): ManifestValidationResult {
  const errors: string[] = [];

  if (typeof manifest !== "object" || manifest === null) {
    return { valid: false, errors: ["MANIFEST_NOT_OBJECT"] };
  }

  const m = manifest as Record<string, unknown>;

  if (m.schemaVersion !== AURION_SERVICE_CELL_SCHEMA_VERSION) {
    errors.push("MANIFEST_SCHEMA_VERSION_INVALID");
  }

  if (typeof m.cellId !== "string" || !CELL_ID.test(m.cellId)) {
    errors.push("MANIFEST_CELL_ID_INVALID");
  }

  if (typeof m.scope !== "string" || !SERVICE_CELL_SCOPES.includes(m.scope as AurionServiceCellScope)) {
    errors.push("MANIFEST_SCOPE_INVALID");
  }

  // ownsEffects must be false — technically immutable.
  if (m.ownsEffects !== false) {
    errors.push("MANIFEST_OWNS_EFFECTS_MUST_BE_FALSE");
  }

  // mayWriteGameplayTruth: must be false or "contract-bound-only" — never true.
  if (m.mayWriteGameplayTruth === true) {
    errors.push("MANIFEST_GAMEPLAY_WRITE_GLOBALLY_ENABLED");
  } else if (m.mayWriteGameplayTruth !== false && m.mayWriteGameplayTruth !== "contract-bound-only") {
    errors.push("MANIFEST_GAMEPLAY_WRITE_INVALID");
  }

  // mayWriteWorldTruth: must be false or "contract-bound-only" — never true.
  if (m.mayWriteWorldTruth === true) {
    errors.push("MANIFEST_WORLD_WRITE_GLOBALLY_ENABLED");
  } else if (m.mayWriteWorldTruth !== false && m.mayWriteWorldTruth !== "contract-bound-only") {
    errors.push("MANIFEST_WORLD_WRITE_INVALID");
  }

  // mayDefineGameplayRules: must be "explicit-domain-contracts-only" — never true.
  if (m.mayDefineGameplayRules === true) {
    errors.push("MANIFEST_GAMEPLAY_RULES_GLOBALLY_ENABLED");
  } else if (m.mayDefineGameplayRules !== "explicit-domain-contracts-only") {
    errors.push("MANIFEST_GAMEPLAY_RULES_INVALID");
  }

  if (m.requiresTargetReadback !== true) {
    errors.push("MANIFEST_REQUIRES_READBACK_MUST_BE_TRUE");
  }

  if (m.requiresIdempotencyForEffects !== true) {
    errors.push("MANIFEST_REQUIRES_IDEMPOTENCY_MUST_BE_TRUE");
  }

  // registeredContracts: if write authority is contract-bound, contracts must be registered.
  if (!Array.isArray(m.registeredContracts)) {
    errors.push("MANIFEST_REGISTERED_CONTRACTS_NOT_ARRAY");
  } else {
    for (const contract of m.registeredContracts) {
      if (typeof contract !== "string" || !CONTRACT_ID.test(contract)) {
        errors.push(`MANIFEST_REGISTERED_CONTRACT_INVALID:${String(contract)}`);
      }
    }
    if (
      (m.mayWriteGameplayTruth === "contract-bound-only" || m.mayWriteWorldTruth === "contract-bound-only") &&
      m.registeredContracts.length === 0
    ) {
      errors.push("MANIFEST_CONTRACT_BOUND_WITHOUT_REGISTERED_CONTRACTS");
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a frozen, validated Aurion Service Cell manifest.
 * `ownsEffects` is hardcoded to `false` and cannot be overridden.
 * Gameplay/world write authority is never globally `true`.
 */
export function createServiceCellManifest(input: {
  cellId: string;
  scope: AurionServiceCellScope;
  mayWriteGameplayTruth?: WriteAuthority;
  mayWriteWorldTruth?: WriteAuthority;
  registeredContracts?: readonly string[];
}): AurionServiceCellManifest {
  const manifest: Omit<AurionServiceCellManifest, "manifestHash"> = {
    schemaVersion: AURION_SERVICE_CELL_SCHEMA_VERSION,
    cellId: input.cellId,
    scope: input.scope,
    ownsEffects: false, // technically immutable
    mayWriteGameplayTruth: input.mayWriteGameplayTruth ?? false,
    mayWriteWorldTruth: input.mayWriteWorldTruth ?? false,
    mayDefineGameplayRules: "explicit-domain-contracts-only",
    requiresTargetReadback: true,
    requiresIdempotencyForEffects: true,
    registeredContracts: input.registeredContracts ?? [],
  };

  const validation = validateServiceCellManifest(manifest);
  if (!validation.valid) {
    throw new Error(`SERVICE_CELL_MANIFEST_INVALID:${validation.errors.join(",")}`);
  }

  const manifestHash = canonicalSha256({
    schemaVersion: manifest.schemaVersion,
    cellId: manifest.cellId,
    scope: manifest.scope,
    ownsEffects: manifest.ownsEffects,
    mayWriteGameplayTruth: manifest.mayWriteGameplayTruth,
    mayWriteWorldTruth: manifest.mayWriteWorldTruth,
    mayDefineGameplayRules: manifest.mayDefineGameplayRules,
    requiresTargetReadback: manifest.requiresTargetReadback,
    requiresIdempotencyForEffects: manifest.requiresIdempotencyForEffects,
    registeredContracts: manifest.registeredContracts,
  });

  return Object.freeze({ ...manifest, manifestHash });
}

/** Verify that a manifest's hash matches its content and the manifest is valid. */
export function verifyServiceCellManifest(manifest: AurionServiceCellManifest): boolean {
  const validation = validateServiceCellManifest(manifest);
  if (!validation.valid) return false;
  const recomputed = canonicalSha256({
    schemaVersion: manifest.schemaVersion,
    cellId: manifest.cellId,
    scope: manifest.scope,
    ownsEffects: manifest.ownsEffects,
    mayWriteGameplayTruth: manifest.mayWriteGameplayTruth,
    mayWriteWorldTruth: manifest.mayWriteWorldTruth,
    mayDefineGameplayRules: manifest.mayDefineGameplayRules,
    requiresTargetReadback: manifest.requiresTargetReadback,
    requiresIdempotencyForEffects: manifest.requiresIdempotencyForEffects,
    registeredContracts: manifest.registeredContracts,
  });
  return manifest.manifestHash === recomputed;
}
