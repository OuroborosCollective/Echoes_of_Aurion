import { describe, expect, it } from "vitest";
import {
  AURION_EVIDENCE_GATE_ENGINE_SCHEMA,
  assertEvidenceGateEngineAdmitted,
  evaluateEvidenceGateEngine,
} from "./evidenceGateEngine";

describe("AIM-175 evidence gate engine", () => {
  it("deterministically admits an all-pass check set", () => {
    const input = {
      consumer: "ATLAS_BUILD",
      checks: [
        { id: "schema", pass: true, reason: null },
        { id: "parity", pass: true, reason: null },
      ],
    } as const;
    const first = evaluateEvidenceGateEngine(input);
    const replay = evaluateEvidenceGateEngine(input);

    expect(first.schema).toBe(AURION_EVIDENCE_GATE_ENGINE_SCHEMA);
    expect(first.verdict).toBe("ADMIT");
    expect(first.firstFailure).toBeNull();
    expect(first).toEqual(replay);
    expect(() => assertEvidenceGateEngineAdmitted(first)).not.toThrow();
  });

  it("fails closed on the first failing check while preserving later evidence", () => {
    const result = evaluateEvidenceGateEngine({
      consumer: "WORLD_PROJECTION",
      checks: [
        { id: "schema", pass: true, reason: null },
        { id: "oracle", pass: false, reason: "ORACLE_NOT_MATCH" },
        { id: "identity", pass: false, reason: "RUNTIME_REVISION_MISMATCH" },
      ],
    });

    expect(result.verdict).toBe("HOLD");
    expect(result.firstFailure).toBe("ORACLE_NOT_MATCH");
    expect(result.checks).toHaveLength(3);
    expect(() => assertEvidenceGateEngineAdmitted(result))
      .toThrow("EVIDENCE_GATE_ENGINE_ORACLE_NOT_MATCH");
  });

  it("treats an empty check set as HOLD-safe only when a failing reason exists", () => {
    const result = evaluateEvidenceGateEngine({
      consumer: "RUNTIME_PREP",
      checks: [{ id: "schema", pass: false, reason: "SCHEMA_INVALID" }],
    });
    expect(result.verdict).toBe("HOLD");
    expect(result.firstFailure).toBe("SCHEMA_INVALID");
  });
});
