import { describe, expect, it } from "vitest";
import {
  BASELINE_IMPACT_MATERIALS,
  BOXLITE_BASE_IMAGE,
  BOXLITE_VERSION,
  IMPACT_BAKE_SCENARIOS,
  OPENCOURANT_PACKAGE_HASH,
  buildImpactBakeJob,
  buildImpactBakeReceipt,
} from "../shared/aurionImpactBakeProtocol";
import { buildBoxliteImpactInvocation } from "./aurionOpenCourantBoxliteAdapter";

const REV = "e2f542f8495c8d9f2e7d03de2dda22794360b4de";
const HASH_A = "sha256:" + "a".repeat(64);
const HASH_B = "sha256:" + "b".repeat(64);

function baseJob() {
  return {
    workId: "impact.vehicle.001",
    scenario: "VEHICLE_CRASH" as const,
    entityId: "cart.7",
    sourceRevision: REV,
    logicalTick: 420,
    starterDeckPath: "fixtures/cart_0000.rad",
    starterDeckHash: HASH_A,
    engineDeckPath: "fixtures/cart_0001.rad",
    engineDeckHash: HASH_B,
    solverPackagePath: ".cache/OpenCourant_linux64.zip",
    material: BASELINE_IMPACT_MATERIALS.IRON,
    cpus: 4,
    memoryMiB: 8192,
  };
}

describe("OpenCourant BoxLite WORLD_IMPACT lane", () => {
  it("covers all requested offline impact/deformation scenario families", () => {
    expect(IMPACT_BAKE_SCENARIOS).toEqual([
      "VEHICLE_CRASH", "STRUCTURE_DESTRUCTION", "MATERIAL_CALIBRATION", "PROJECTILE_IMPACT",
      "EXPLOSIVE_IMPACT", "DAMAGE_DEFORMATION_BAKE", "REDUCED_RUNTIME_DEFORMATION",
    ]);
  });

  it.each(["IRON", "WOOD", "STONE"] as const)("provides a deterministic baseline %s material profile", family => {
    expect(BASELINE_IMPACT_MATERIALS[family].family).toBe(family);
    expect(BASELINE_IMPACT_MATERIALS[family].profileVersion).toBe("aurion.baseline.1");
  });

  it("requires a matched Radioss Starter/Engine deck pair", () => {
    expect(() => buildImpactBakeJob({ ...baseJob(), engineDeckPath: "fixtures/other_0001.rad" }))
      .toThrow("IMPACT_BAKE_DECK_PAIR_MISMATCH");
  });

  it("binds the official solver package and BoxLite runtime", () => {
    const job = buildImpactBakeJob(baseJob());
    const invocation = buildBoxliteImpactInvocation(job);
    expect(job.solverPackageHash).toBe(OPENCOURANT_PACKAGE_HASH);
    expect(job.boxliteImage).toBe(BOXLITE_BASE_IMAGE);
    expect(invocation.environment.OPENCOURANT_COMMIT).toBe("33e685176cccf0c539a3ce07aa2096985a284e2a");
    expect(invocation.environment.BOXLITE_VERSION).toBe(BOXLITE_VERSION);
    expect(invocation.args).toContain("--solver-package");
    expect(invocation.invocationHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects arbitrary mutable BoxLite base images", () => {
    expect(() => buildImpactBakeJob({
      ...baseJob(),
      boxliteImage: "ubuntu:latest",
    })).toThrow("IMPACT_BAKE_BOXLITE_IMAGE_UNPINNED");
  });

  it("accepts an immutable BoxLite base digest for production evidence", () => {
    const job = buildImpactBakeJob({
      ...baseJob(),
      boxliteImage: "ghcr.io/boxlite-ai/boxlite-agent-base@sha256:" + "c".repeat(64),
    });
    expect(job.boxliteImage).toMatch(/@sha256:/);
  });

  it("hashes reduced runtime deformation evidence canonically", () => {
    const base = {
      workId: "impact.bridge.001",
      scenario: "STRUCTURE_DESTRUCTION" as const,
      sourceRevision: REV,
      logicalTick: 9,
      starterDeckHash: HASH_A,
      engineDeckHash: HASH_B,
      solverPackageHash: OPENCOURANT_PACKAGE_HASH,
      solverCommit: "33e685176cccf0c539a3ce07aa2096985a284e2a" as const,
      boxliteImage: "ghcr.io/boxlite-ai/boxlite-agent-base@sha256:" + "c".repeat(64),
      boxliteVersion: BOXLITE_VERSION,
      resultArchiveHash: "sha256:" + "d".repeat(64),
      vtkHash: "sha256:" + "e".repeat(64),
      csvHash: null,
    };
    const a = buildImpactBakeReceipt({ ...base, reducedSamples: [
      { ordinal: 1, impulseMilliNewtonSeconds: 2000, deformationMillimeters: 12, damagePermille: 180 },
      { ordinal: 0, impulseMilliNewtonSeconds: 1000, deformationMillimeters: 4, damagePermille: 60 },
    ]});
    const b = buildImpactBakeReceipt({ ...base, reducedSamples: [...a.reducedSamples] });
    expect(a.receiptHash).toBe(b.receiptHash);
    expect(a.reducedSamples.map(x => x.ordinal)).toEqual([0, 1]);
  });
});
