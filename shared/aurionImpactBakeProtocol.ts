import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_IMPACT_BAKE_PROTOCOL = "aurion.world-impact-bake.v1" as const;
export const OPENCOURANT_RELEASE_COMMIT = "33e685176cccf0c539a3ce07aa2096985a284e2a" as const;
export const OPENCOURANT_RELEASE_TAG = "latest-20261006" as const;
export const OPENCOURANT_IMAGE = "ghcr.io/opencourant/opencourant:latest-20261006" as const;
export const BOXLITE_VERSION = "0.10.5" as const;

export const IMPACT_BAKE_SCENARIOS = [
  "VEHICLE_CRASH",
  "STRUCTURE_DESTRUCTION",
  "MATERIAL_CALIBRATION",
  "PROJECTILE_IMPACT",
  "EXPLOSIVE_IMPACT",
  "DAMAGE_DEFORMATION_BAKE",
  "REDUCED_RUNTIME_DEFORMATION",
] as const;
export type ImpactBakeScenario = (typeof IMPACT_BAKE_SCENARIOS)[number];

export const IMPACT_MATERIAL_FAMILIES = ["IRON", "WOOD", "STONE"] as const;
export type ImpactMaterialFamily = (typeof IMPACT_MATERIAL_FAMILIES)[number];

const HASH = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export type ImpactMaterialProfile = Readonly<{
  family: ImpactMaterialFamily;
  profileVersion: string;
  densityKgM3: number;
  youngModulusMPa: number;
  poissonPermille: number;
  yieldStrengthMPa: number;
  failureStrainPermille: number;
}>;

export const BASELINE_IMPACT_MATERIALS: Readonly<Record<ImpactMaterialFamily, ImpactMaterialProfile>> = Object.freeze({
  IRON: Object.freeze({ family: "IRON", profileVersion: "aurion.baseline.1", densityKgM3: 7870, youngModulusMPa: 200000, poissonPermille: 290, yieldStrengthMPa: 250, failureStrainPermille: 150 }),
  WOOD: Object.freeze({ family: "WOOD", profileVersion: "aurion.baseline.1", densityKgM3: 650, youngModulusMPa: 11000, poissonPermille: 350, yieldStrengthMPa: 45, failureStrainPermille: 20 }),
  STONE: Object.freeze({ family: "STONE", profileVersion: "aurion.baseline.1", densityKgM3: 2600, youngModulusMPa: 50000, poissonPermille: 220, yieldStrengthMPa: 35, failureStrainPermille: 2 }),
});

export type ImpactBakeJob = Readonly<{
  protocol: typeof AURION_IMPACT_BAKE_PROTOCOL;
  workId: string;
  scenario: ImpactBakeScenario;
  entityId: string;
  sourceRevision: string;
  logicalTick: number;
  starterDeckPath: string;
  starterDeckHash: string;
  engineDeckPath: string;
  engineDeckHash: string;
  material: ImpactMaterialProfile;
  solverImage: string;
  solverCommit: typeof OPENCOURANT_RELEASE_COMMIT;
  boxliteVersion: typeof BOXLITE_VERSION;
  cpus: number;
  memoryMiB: number;
}>;

export type ReducedDeformationSample = Readonly<{
  ordinal: number;
  impulseMilliNewtonSeconds: number;
  deformationMillimeters: number;
  damagePermille: number;
}>;

export type ImpactBakeReceipt = Readonly<{
  protocol: typeof AURION_IMPACT_BAKE_PROTOCOL;
  workId: string;
  scenario: ImpactBakeScenario;
  sourceRevision: string;
  logicalTick: number;
  starterDeckHash: string;
  engineDeckHash: string;
  solverImage: string;
  solverCommit: typeof OPENCOURANT_RELEASE_COMMIT;
  boxliteVersion: typeof BOXLITE_VERSION;
  resultArchiveHash: string;
  vtkHash: string | null;
  csvHash: string | null;
  reducedSamples: readonly ReducedDeformationSample[];
  receiptHash: string;
}>;

function assertPositiveInt(value: number, code: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(code);
}
function assertHash(value: string, code: string): void {
  if (!HASH.test(value)) throw new Error(code);
}
function assertId(value: string, code: string): void {
  if (!ID.test(value)) throw new Error(code);
}
function assertDeckPair(starterDeckPath: string, engineDeckPath: string): void {
  if (!starterDeckPath.endsWith("_0000.rad")) throw new Error("IMPACT_BAKE_STARTER_DECK_INVALID");
  if (!engineDeckPath.endsWith("_0001.rad")) throw new Error("IMPACT_BAKE_ENGINE_DECK_INVALID");
  const starterRoot = starterDeckPath.slice(0, -"_0000.rad".length);
  const engineRoot = engineDeckPath.slice(0, -"_0001.rad".length);
  if (starterRoot !== engineRoot) throw new Error("IMPACT_BAKE_DECK_PAIR_MISMATCH");
}

export function buildImpactBakeJob(input: Omit<ImpactBakeJob, "protocol" | "solverImage" | "solverCommit" | "boxliteVersion"> & { solverImage?: string }): ImpactBakeJob {
  assertId(input.workId, "IMPACT_BAKE_WORK_ID_INVALID");
  assertId(input.entityId, "IMPACT_BAKE_ENTITY_ID_INVALID");
  if (!REVISION.test(input.sourceRevision)) throw new Error("IMPACT_BAKE_REVISION_INVALID");
  if (!Number.isSafeInteger(input.logicalTick) || input.logicalTick < 0) throw new Error("IMPACT_BAKE_TICK_INVALID");
  assertDeckPair(input.starterDeckPath, input.engineDeckPath);
  assertHash(input.starterDeckHash, "IMPACT_BAKE_STARTER_HASH_INVALID");
  assertHash(input.engineDeckHash, "IMPACT_BAKE_ENGINE_HASH_INVALID");
  assertPositiveInt(input.cpus, "IMPACT_BAKE_CPUS_INVALID");
  assertPositiveInt(input.memoryMiB, "IMPACT_BAKE_MEMORY_INVALID");
  if (!IMPACT_BAKE_SCENARIOS.includes(input.scenario)) throw new Error("IMPACT_BAKE_SCENARIO_INVALID");
  validateMaterial(input.material);
  const solverImage = input.solverImage ?? OPENCOURANT_IMAGE;
  if (solverImage !== OPENCOURANT_IMAGE && !/^ghcr\.io\/opencourant\/opencourant@sha256:[a-f0-9]{64}$/.test(solverImage)) {
    throw new Error("IMPACT_BAKE_SOLVER_IMAGE_UNPINNED");
  }
  return Object.freeze({
    ...input,
    protocol: AURION_IMPACT_BAKE_PROTOCOL,
    solverImage,
    solverCommit: OPENCOURANT_RELEASE_COMMIT,
    boxliteVersion: BOXLITE_VERSION,
  });
}

export function validateMaterial(material: ImpactMaterialProfile): void {
  if (!IMPACT_MATERIAL_FAMILIES.includes(material.family)) throw new Error("IMPACT_BAKE_MATERIAL_INVALID");
  assertId(material.profileVersion, "IMPACT_BAKE_MATERIAL_VERSION_INVALID");
  for (const [key, value] of Object.entries(material)) {
    if (key === "family" || key === "profileVersion") continue;
    assertPositiveInt(value as number, "IMPACT_BAKE_MATERIAL_VALUE_INVALID");
  }
  if (material.poissonPermille >= 500) throw new Error("IMPACT_BAKE_POISSON_INVALID");
}

export function buildImpactBakeReceipt(input: Omit<ImpactBakeReceipt, "protocol" | "receiptHash">): ImpactBakeReceipt {
  assertId(input.workId, "IMPACT_BAKE_WORK_ID_INVALID");
  if (!REVISION.test(input.sourceRevision)) throw new Error("IMPACT_BAKE_REVISION_INVALID");
  assertHash(input.starterDeckHash, "IMPACT_BAKE_STARTER_HASH_INVALID");
  assertHash(input.engineDeckHash, "IMPACT_BAKE_ENGINE_HASH_INVALID");
  assertHash(input.resultArchiveHash, "IMPACT_BAKE_RESULT_HASH_INVALID");
  if (input.vtkHash !== null) assertHash(input.vtkHash, "IMPACT_BAKE_VTK_HASH_INVALID");
  if (input.csvHash !== null) assertHash(input.csvHash, "IMPACT_BAKE_CSV_HASH_INVALID");
  const reducedSamples = Object.freeze([...input.reducedSamples].sort((a,b) => a.ordinal - b.ordinal).map(sample => {
    if (![sample.ordinal, sample.impulseMilliNewtonSeconds, sample.deformationMillimeters, sample.damagePermille].every(Number.isSafeInteger)) {
      throw new Error("IMPACT_BAKE_REDUCED_SAMPLE_INVALID");
    }
    if (sample.ordinal < 0 || sample.impulseMilliNewtonSeconds < 0 || sample.deformationMillimeters < 0 || sample.damagePermille < 0 || sample.damagePermille > 1000) {
      throw new Error("IMPACT_BAKE_REDUCED_SAMPLE_RANGE_INVALID");
    }
    return Object.freeze({ ...sample });
  }));
  const body = { ...input, reducedSamples };
  return Object.freeze({
    protocol: AURION_IMPACT_BAKE_PROTOCOL,
    ...body,
    receiptHash: canonicalSha256({ domain: AURION_IMPACT_BAKE_PROTOCOL, ...body }),
  });
}
