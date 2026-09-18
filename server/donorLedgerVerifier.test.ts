import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  donorDerivedSurfaceFiles,
  externalRuntimeDependencyFindings,
  provenanceModuleReferenceFindings,
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
    expect(scanExternalRuntimeDependencies(process.cwd())).toEqual([
      { kind: "donor-github-source-url", path: "client/src/lib/wasdGlbCatalog.ts" },
    ]);
    expect(ledger.capabilities).toEqual(expect.arrayContaining([
      expect.objectContaining({ capabilityId: "combat.delta-resolution", status: "AURION_OWNED", donorRuntimeRequired: false }),
      expect.objectContaining({ capabilityId: "determinism.addressable-rng", status: "AURION_OWNED", donorRuntimeRequired: false }),
      expect.objectContaining({ capabilityId: "client.visible-runtime", status: "AURION_OWNED", donorRuntimeRequired: false }),
      expect.objectContaining({ capabilityId: "assets.donor-glb-provenance", status: "DONOR_RETIRED", donorRuntimeRequired: false }),
    ]));
  });

  it("binds every donor-derived production file to exactly one capability owner", () => {
    const ledger = readLedger();
    const discovered = donorDerivedSurfaceFiles(process.cwd());
    expect(discovered.length).toBeGreaterThan(150);
    expect(ledger.surfaceInventory.map((surface: { path: string }) => surface.path).sort()).toEqual(discovered);
    expect(new Set(ledger.surfaceInventory.map((surface: { path: string }) => surface.path)).size).toBe(discovered.length);
  });

  it("rejects uninventoried, duplicate and cross-donor surface ownership", () => {
    const missing = readLedger();
    missing.surfaceInventory = missing.surfaceInventory.slice(1);
    expect(codes(missing)).toContain("DONOR_SURFACE_UNINVENTORIED");

    const duplicate = readLedger();
    duplicate.surfaceInventory.push(clone(duplicate.surfaceInventory[0]));
    expect(codes(duplicate)).toContain("DONOR_SURFACE_DUPLICATE");

    const mismatch = readLedger();
    mismatch.surfaceInventory[0].donor = mismatch.surfaceInventory[0].donor === "WASD" ? "AX1" : "WASD";
    expect(codes(mismatch)).toContain("DONOR_SURFACE_DONOR_MISMATCH");
  });

  it("keeps donor GLB URLs provenance-only and unreachable from live asset/load surfaces", () => {
    const ledger = readLedger();
    expect(ledger.provenanceOnlyPaths).toEqual([
      "client/src/lib/wasdGlbCatalog.ts",
      "client/src/game/glbUsagePlan.ts",
      "client/src/lib/wasdAurionSceneAssets.ts",
    ]);

    const liveAssets = readFileSync("client/src/lib/aurionAssets.ts", "utf8");
    expect(liveAssets).not.toContain("wasdGlbCatalog");
    expect(liveAssets).not.toContain("wasdGlb:");

    const loader = readFileSync("client/src/xaurion/core/GLBModelManager.ts", "utf8");
    expect(loader).toContain("/api/assets/glb/");
    expect(loader).toContain("GLB_SOURCE_HASH_REQUIRED");
    expect(loader).not.toContain("raw.githubusercontent.com");

    expect(provenanceModuleReferenceFindings(
      [{ path: "client/src/live.ts", content: 'import { wasdGlbCatalog } from "./lib/wasdGlbCatalog";' }],
      ledger.provenanceOnlyPaths,
    )).toEqual([{ marker: "wasdGlbCatalog", path: "client/src/live.ts" }]);
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
      { path: "client/src/fake.ts", content: "https://raw.githubusercontent.com/OuroborosCollective/Wasd/deadbeef/model.glb" },
    ]);
    expect(findings.map((finding: { kind: string }) => finding.kind)).toEqual(expect.arrayContaining([
      "external-wasd-package",
      "wasd-runtime-url",
      "ax1-runtime-url",
      "ax1-service-env",
      "donor-github-source-url",
    ]));
  });
});
