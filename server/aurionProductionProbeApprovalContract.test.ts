import { describe, expect, it } from "vitest";
import {
  AURION_PROBE_MAX_APPROVAL_MS,
  AURION_PROBE_SCOPES,
  parseAurionProbeRunIdentity,
  requireMatchingAurionProbeApproval,
} from "./aurionProductionProbeApprovalContract";

const NOW = 1_800_000_000_000;
const REVISION = "a".repeat(40);
const RUN = Object.freeze({
  repository: "OuroborosCollective/Echoes_of_Aurion",
  workflow: ".github/workflows/deploy-aurion-zone-runtime.yml",
  ref: "refs/heads/main",
  revision: REVISION,
  runId: "37914782293",
  runAttempt: 1,
  environment: "production",
  audience: "aurion-production-probe",
});
const READBACK_SCOPE = AURION_PROBE_SCOPES[1];

function approval(overrides: Record<string, unknown> = {}) {
  return {
    approvalId: "b".repeat(32),
    approvedByUserId: 1,
    approvedByRole: "admin",
    decision: "approved",
    approvedAtMs: NOW - 1_000,
    expiresAtMs: NOW + 30_000,
    consumedAtMs: null,
    scopes: [...AURION_PROBE_SCOPES],
    run: { ...RUN },
    ...overrides,
  };
}

describe("Aurion production-probe approval boundary (#833)", () => {
  it("accepts an exact read-only run binding without returning a credential", () => {
    const bound = requireMatchingAurionProbeApproval(approval(), RUN, READBACK_SCOPE, NOW);
    expect(bound).toEqual({
      approvalId: "b".repeat(32),
      revision: REVISION,
      runId: RUN.runId,
      runAttempt: 1,
      scope: READBACK_SCOPE,
    });
    expect(JSON.stringify(bound)).not.toMatch(/app_session_id|session|token|cookie|schema|mutation/i);
    expect(Object.isFrozen(bound)).toBe(true);
  });

  it("rejects invalid identity fields and unexpected properties", () => {
    for (const invalid of [
      { ...RUN, revision: "B".repeat(40) },
      { ...RUN, runAttempt: 0 },
      { ...RUN, runId: "0" },
      { ...RUN, additional: "unexpected" },
    ]) expect(() => parseAurionProbeRunIdentity(invalid)).toThrow("PROBE_RUN_IDENTITY_INVALID");
    expect(() => requireMatchingAurionProbeApproval({ ...approval(), unexpected: true }, RUN, READBACK_SCOPE, NOW)).toThrow("PROBE_APPROVAL_INVALID");
  });

  it.each([
    ["repository", "Attacker/other-repo"],
    ["workflow", ".github/workflows/other.yml"],
    ["ref", "refs/heads/unreviewed"],
    ["revision", "c".repeat(40)],
    ["runId", "37914782294"],
    ["runAttempt", 2],
    ["environment", "staging"],
    ["audience", "other-service"],
  ])("blocks a different %s", (field, value) => {
    const other = { ...RUN, [field]: value };
    expect(() => requireMatchingAurionProbeApproval(approval(), other, READBACK_SCOPE, NOW)).toThrow(/PROBE_RUN_/);
  });

  it("rejects wrong, duplicate and write scopes", () => {
    for (const scopes of [
      [AURION_PROBE_SCOPES[0]],
      [READBACK_SCOPE, READBACK_SCOPE],
      [READBACK_SCOPE, "aurion.production.schema.apply"],
    ]) expect(() => requireMatchingAurionProbeApproval(approval({ scopes }), RUN, READBACK_SCOPE, NOW)).toThrow("PROBE_SCOPE_INVALID");
    expect(() => requireMatchingAurionProbeApproval(approval(), RUN, "schema.write" as never, NOW)).toThrow("PROBE_SCOPE_INVALID");
  });

  it("rejects non-admin, revoked, consumed or malformed approval", () => {
    for (const overrides of [
      { decision: "revoked" },
      { approvedByRole: "user" },
      { approvedByUserId: 0 },
      { approvalId: "weak" },
    ]) expect(() => requireMatchingAurionProbeApproval(approval(overrides), RUN, READBACK_SCOPE, NOW)).toThrow("PROBE_APPROVAL_INVALID");
    expect(() => requireMatchingAurionProbeApproval(approval({ consumedAtMs: NOW - 1 }), RUN, READBACK_SCOPE, NOW)).toThrow("PROBE_APPROVAL_ALREADY_CONSUMED");
  });

  it("rejects expired, oversized, future and invalid-clock approvals", () => {
    const exact = approval({ approvedAtMs: NOW, expiresAtMs: NOW + AURION_PROBE_MAX_APPROVAL_MS });
    expect(() => requireMatchingAurionProbeApproval(exact, RUN, READBACK_SCOPE, NOW)).not.toThrow();
    expect(() => requireMatchingAurionProbeApproval(exact, RUN, READBACK_SCOPE, NOW + AURION_PROBE_MAX_APPROVAL_MS)).toThrow("PROBE_APPROVAL_EXPIRED_OR_INVALID");
    expect(() => requireMatchingAurionProbeApproval(approval({ expiresAtMs: NOW + AURION_PROBE_MAX_APPROVAL_MS + 1 }), RUN, READBACK_SCOPE, NOW)).toThrow("PROBE_APPROVAL_EXPIRED_OR_INVALID");
    expect(() => requireMatchingAurionProbeApproval(approval({ approvedAtMs: NOW + 1 }), RUN, READBACK_SCOPE, NOW)).toThrow("PROBE_APPROVAL_EXPIRED_OR_INVALID");
    expect(() => requireMatchingAurionProbeApproval(approval(), RUN, READBACK_SCOPE, Number.NaN)).toThrow("OPERATIONAL_TIME_INVALID");
  });

  it("cannot transfer an approval to another run with the same source revision", () => {
    expect(() => requireMatchingAurionProbeApproval(approval({ run: { ...RUN, runId: "37914782292" } }), RUN, READBACK_SCOPE, NOW)).toThrow("PROBE_RUN_BINDING_MISMATCH");
  });
});
