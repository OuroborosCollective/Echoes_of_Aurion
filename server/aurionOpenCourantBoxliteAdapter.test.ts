import { describe, expect, it } from "vitest";
import {
  BASELINE_IMPACT_MATERIALS,
  BOXLITE_VERSION,
  IMPACT_BAKE_SCENARIOS,
  buildImpactBakeJob,
  buildImpactBakeReceipt,
} from "../shared/aurionImpactBakeProtocol";
import { buildBoxliteImpactInvocation } from "./aurionOpenCourantBoxliteAdapter";

const REV = "479e9b4f8ab2a38bb6105083e4fc9c63d83d9c3e";
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

  it("builds a pinned BoxLite invocation without making the solver gameplay authority", () => {
    const job = buildImpactBakeJob(baseJob());
    const invocation = buildBoxliteImpactInvocation(job);
    expect(invocation.executable).toBe("python3");
    expect(invocation.environment.OPENCOURANT_COMMIT).toBe("33e685176cccf0c539a3ce07aa2096985a284e2a");
    expect(invocation.environment.BOXLITE_VERSION).toBe(BOXLITE_VERSION);
    expect(invocation.args).toContain("--starter-deck");
    expect(invocation.args).toContain("--engine-deck");
    expect(invocation.args).not.toContain("--network");
    expect(invocation.invocationHash).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("rejects arbitrary mutable solver images", () => {
    expect(() => buildImpactBakeJob({
      ...baseJob(),
      solverImage: "ghcr.io/opencourant/opencourant:latest",
    })).toThrow("IMPACT_BAKE_SOLVER_IMAGE_UNPINNED");
  });

  it("accepts an immutable GHCR digest for production evidence", () => {
    const job = buildImpactBakeJob({
      ...baseJob(),
      solverImage: "ghcr.io/opencourant/opencourant@sha256:" + "c".repeat(64),
    });
    expect(job.solverImage).toMatch(/@sha256:/);
  });

  it("hashes reduced runtime deformation evidence canonically", () => {
    const base = {
      workId: "impact.bridge.001",
      scenario: "STRUCTURE_DESTRUCTION" as const,
      sourceRevision: REV,
      logicalTick: 9,
      starterDeckHash: HASH_A,
      engineDeckHash: HASH_B,
      solverImage: "ghcr.io/opencourant/opencourant:latest-20261006",
      solverCommit: "33e685176cccf0c539a3ce07aa2096985a284e2a" as const,
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
