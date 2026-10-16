import { validEpochMilliseconds } from "../shared/operationalClock";

/**
 * Strict, side-effect-free boundary for Aurion issue #833.
 *
 * This is NOT an authenticator or a credential exchange. Callers MUST independently
 * verify the GitHub OIDC JWT (including issuer, audience and subject/repository),
 * resolve the owner against Aurion's real admin role, and atomically consume an
 * approval in durable storage BEFORE granting any probe access. A matching record
 * alone grants no authority. In particular it never authorizes a schema mutation.
 */
export const AURION_PROBE_REPOSITORY = "OuroborosCollective/Echoes_of_Aurion";
export const AURION_PROBE_WORKFLOW = ".github/workflows/deploy-aurion-zone-runtime.yml";
export const AURION_PROBE_REF = "refs/heads/main";
export const AURION_PROBE_ENVIRONMENT = "production";
export const AURION_PROBE_OIDC_AUDIENCE = "aurion-production-probe";
export const AURION_PROBE_MAX_APPROVAL_MS = 5 * 60 * 1000;

export const AURION_PROBE_ADMIN_READBACK_SCOPE = "aurion.probe.admin-readback";
export const AURION_PROBE_GAMEPLAY_READBACK_SCOPE = "aurion.probe.gameplay-readback";
/**
 * This scope deliberately permits a short, canonical join/leave session. It is
 * separate from every read-only probe and can never be inferred from another
 * approval.
 */
export const AURION_PROBE_GAMEPLAY_SESSION_READBACK_SCOPE = "aurion.probe.gameplay-session-readback";

export const AURION_PROBE_SCOPES = [
  AURION_PROBE_ADMIN_READBACK_SCOPE,
  AURION_PROBE_GAMEPLAY_READBACK_SCOPE,
  AURION_PROBE_GAMEPLAY_SESSION_READBACK_SCOPE,
] as const;

export type AurionProbeScope = (typeof AURION_PROBE_SCOPES)[number];
export type AurionProbeMutationAuthority = "none" | "ephemeral-probe-session";

/** The client and server must agree on the one effectful scope. */
export function aurionProbeMutationAuthority(scope: AurionProbeScope): AurionProbeMutationAuthority {
  return scope === AURION_PROBE_GAMEPLAY_SESSION_READBACK_SCOPE ? "ephemeral-probe-session" : "none";
}

export type AurionProbeRunIdentity = Readonly<{
  repository: string;
  workflow: string;
  ref: string;
  revision: string;
  runId: string;
  runAttempt: number;
  environment: string;
  audience: string;
}>;

export type AurionProbeApprovalRecord = Readonly<{
  approvalId: string;
  approvedByUserId: number;
  approvedByRole: "admin";
  decision: "approved";
  approvedAtMs: number;
  expiresAtMs: number;
  consumedAtMs: null;
  scopes: readonly AurionProbeScope[];
  run: AurionProbeRunIdentity;
}>;

function record(value: unknown, code: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error(code);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[], code: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new Error(code);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/** Structural validation only. The runner identity must already come from VERIFIED OIDC. */
export function parseAurionProbeRunIdentity(value: unknown): AurionProbeRunIdentity {
  const run = record(value, "PROBE_RUN_IDENTITY_INVALID");
  exactKeys(run, ["repository", "workflow", "ref", "revision", "runId", "runAttempt", "environment", "audience"], "PROBE_RUN_IDENTITY_INVALID");
  if (
    run.repository !== AURION_PROBE_REPOSITORY ||
    run.workflow !== AURION_PROBE_WORKFLOW ||
    run.ref !== AURION_PROBE_REF ||
    run.environment !== AURION_PROBE_ENVIRONMENT ||
    run.audience !== AURION_PROBE_OIDC_AUDIENCE ||
    typeof run.revision !== "string" || !/^[a-f0-9]{40}$/.test(run.revision) ||
    typeof run.runId !== "string" || !/^[1-9][0-9]{0,19}$/.test(run.runId) ||
    !positiveInteger(run.runAttempt)
  ) throw new Error("PROBE_RUN_IDENTITY_INVALID");
  return Object.freeze({
    repository: run.repository, workflow: run.workflow, ref: run.ref,
    revision: run.revision, runId: run.runId, runAttempt: run.runAttempt,
    environment: run.environment, audience: run.audience,
  }) as AurionProbeRunIdentity;
}

/**
 * Validate that a trusted approval record is narrowly bound to one exact run.
 * This does NOT consume the approval. Consumption and replay/concurrency control
 * must be implemented as one transactional compare-and-swap in Aurion's database.
 */
export function requireMatchingAurionProbeApproval(
  storedApproval: unknown,
  verifiedRunnerIdentity: unknown,
  requiredScope: AurionProbeScope,
  observedAtMs: number,
): Readonly<{ approvalId: string; revision: string; runId: string; runAttempt: number; scope: AurionProbeScope }> {
  const observed = validEpochMilliseconds(observedAtMs);
  const run = parseAurionProbeRunIdentity(verifiedRunnerIdentity);
  if (!AURION_PROBE_SCOPES.includes(requiredScope)) throw new Error("PROBE_SCOPE_INVALID");

  const approval = record(storedApproval, "PROBE_APPROVAL_INVALID");
  exactKeys(approval, [
    "approvalId", "approvedByUserId", "approvedByRole", "decision",
    "approvedAtMs", "expiresAtMs", "consumedAtMs", "scopes", "run",
  ], "PROBE_APPROVAL_INVALID");
  if (
    typeof approval.approvalId !== "string" || !/^[a-f0-9]{32}$/.test(approval.approvalId) ||
    !positiveInteger(approval.approvedByUserId) ||
    approval.approvedByRole !== "admin" ||
    approval.decision !== "approved"
  ) throw new Error("PROBE_APPROVAL_INVALID");
  if (approval.consumedAtMs !== null) throw new Error("PROBE_APPROVAL_ALREADY_CONSUMED");

  if (typeof approval.approvedAtMs !== "number" || typeof approval.expiresAtMs !== "number") {
    throw new Error("PROBE_APPROVAL_EXPIRED_OR_INVALID");
  }
  const approvedAtMs = validEpochMilliseconds(approval.approvedAtMs);
  const expiresAtMs = validEpochMilliseconds(approval.expiresAtMs);
  if (
    expiresAtMs <= approvedAtMs ||
    expiresAtMs - approvedAtMs > AURION_PROBE_MAX_APPROVAL_MS ||
    observed < approvedAtMs || observed >= expiresAtMs
  ) throw new Error("PROBE_APPROVAL_EXPIRED_OR_INVALID");

  if (!Array.isArray(approval.scopes) || approval.scopes.length < 1 || approval.scopes.length > AURION_PROBE_SCOPES.length) {
    throw new Error("PROBE_SCOPE_INVALID");
  }
  const scopes = approval.scopes as unknown[];
  if (
    scopes.some(scope => !AURION_PROBE_SCOPES.some(allowed => allowed === scope)) ||
    new Set(scopes).size !== scopes.length ||
    !scopes.includes(requiredScope)
  ) throw new Error("PROBE_SCOPE_INVALID");

  const approvedRun = parseAurionProbeRunIdentity(approval.run);
  for (const key of ["repository", "workflow", "ref", "revision", "runId", "runAttempt", "environment", "audience"] as const) {
    if (approvedRun[key] !== run[key]) throw new Error("PROBE_RUN_BINDING_MISMATCH");
  }
  return Object.freeze({
    approvalId: approval.approvalId,
    revision: run.revision,
    runId: run.runId,
    runAttempt: run.runAttempt,
    scope: requiredScope,
  });
}
