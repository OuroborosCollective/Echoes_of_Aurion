import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  externalRuntimeDependencyFindings,
  scanExternalRuntimeDependencies,
  validateDonorLedgerObject,
} from "../scripts/build-aurion-donor-ledger.mjs";

const readLedger = () => JSON.parse(readFileSync("architecture/donor-ledger.json", "utf8"));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const codes = (value: unknown) => validateDonorLedgerObject(value, { root: process.cwd(), includeRuntimeScan: false }).map((finding: { code: string }) => finding.code);

describe("Aurion donor/runtime ownership ledger", () => {
  it("verifies the real ledger and finds no external WASD/AX1 runtime dependency", () => {
    const ledger = readLedger();
    expect(validateDonorLedgerObject(ledger, { root: process.cwd(), includeRuntimeScan: true })).toEqual([]);
    expect(scanExternalRuntimeDependencies(process.cwd())).toEqual([]);
    expect(ledger.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ capabilityId: "combat.delta-resolution", status: "AURION_OWNED", donorRuntimeRequired: false }),
      expect.objectContaining({ capabilityId: "determinism.addressable-rng", status: "AURION_OWNED", donorRuntimeRequired: false }),
      expect.objectContaining({ capabilityId: "client.visible-runtime", status: "AURION_OWNED", donorRuntimeRequired: false }),
    ]));
  });

  it("rejects duplicate capability IDs", () => {
    const ledger = readLedger();
    ledger.capabilities.push(clone(ledger.capabilities[0]));
    expect(codes(ledger)).toContain("CAPABILITY_ID_DUPLICATE");
  });

  it("rejects a productive capability that still requires donor runtime", () => {
    const ledger = readLedger();
    ledger.capabilities[0].donorRuntimeRequired = true;
    expect(codes(ledger)).toContain("PRODUCTIVE_CAPABILITY_REQUIRES_DONOR_RUNTIME");
  });

  it("rejects status summary drift", () => {
    const ledger = readLedger();
    ledger.donors.WASD.statusSummary.AURION_OWNED += 1;
    expect(codes(ledger)).toContain("DONOR_STATUS_SUMMARY_MISMATCH");
  });

  it("rejects missing parity/runtime evidence and missing source revision", () => {
    const ledger = readLedger();
    ledger.capabilities[0].parityEvidence = ["server/does-not-exist.test.ts"];
    ledger.capabilities[1].runtimeEvidence = [];
    ledger.capabilities[2].sourceIdentity.revision = "short";
    const result = codes(ledger);
    expect(result).toContain("CAPABILITY_PATH_MISSING");
    expect(result).toContain("CAPABILITY_PATH_SET_EMPTY");
    expect(result).toContain("CAPABILITY_SOURCE_REVISION_INVALID");
  });

  it("detects external donor package, service URL and runtime env contradictions", () => {
    const findings = externalRuntimeDependencyFindings([
      { path: "server/fake.ts", content: 'import x from "@wasd/runtime"; fetch("https://wasd.internal/api")' },
      { path: "deploy/fake.yml", content: "AX1_SERVICE_URL: https://ax1.internal" },
    ]);
    expect(findings.map((finding: { kind: string }) => finding.kind)).toEqual(expect.arrayContaining([
      "external-wasd-package",
      "wasd-runtime-url",
      "ax1-runtime-url",
      "ax1-service-env",
    ]));
  });
});
