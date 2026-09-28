import {
  createEffectIntent,
  type AurionEffectIntent,
} from "./aurionEffectIntentContract";
import { canonicalSha256 } from "./aurionCanonicalHash";
import {
  createPopulationState,
  type PopulationState,
} from "./aurionPopulationDynamics";

export const AURION_SETTLEMENT_EMERGENCE_PROTOCOL =
  "aurion.settlement-emergence.v1" as const;
export const SETTLEMENT_BPS_MAX = 10_000;
export const SETTLEMENT_TIERS = [
  "temporary_camp",
  "homestead",
  "hamlet",
  "village",
  "town",
  "city",
] as const;
export const SETTLEMENT_METRIC_KINDS = [
  "food_access",
  "water_access",
  "local_production",
  "safety",
  "connectivity",
  "cohesion",
] as const;
export const SETTLEMENT_CAPACITY_KINDS = ["shelter", "storage"] as const;

export type SettlementTier = (typeof SETTLEMENT_TIERS)[number];
export type SettlementMetricKind = (typeof SETTLEMENT_METRIC_KINDS)[number];
export type SettlementCapacityKind = (typeof SETTLEMENT_CAPACITY_KINDS)[number];

export type SettlementMetricEvidence = Readonly<{
  kind: SettlementMetricKind;
  valueBps: number;
  sourceReceiptId: string;
  sourceReceiptHash: string;
  sourceRevision: string;
  resolutionIndex: number;
}>;

export type SettlementCapacityEvidence = Readonly<{
  kind: SettlementCapacityKind;
  capacity: number;
  sourceReceiptId: string;
  sourceReceiptHash: string;
  sourceRevision: string;
  resolutionIndex: number;
}>;

export type SettlementResidencyEvidence = Readonly<{
  residentIds: readonly string[];
  stableSinceResolutionIndex: number;
  sourceReceiptId: string;
  sourceReceiptHash: string;
  sourceRevision: string;
  resolutionIndex: number;
}>;

export type ExistingSettlementEvidence = Readonly<{
  tier: SettlementTier;
  sourceReceiptId: string;
  sourceReceiptHash: string;
  sourceRevision: string;
}>;

export type SettlementTierThreshold = Readonly<{
  tier: SettlementTier;
  minPopulation: number;
  minStableResidents: number;
  minStableResidencyResolutions: number;
  minFoodAccessBps: number;
  minWaterAccessBps: number;
  minShelterCapacity: number;
  minStorageCapacity: number;
  minLocalProductionBps: number;
  minSafetyBps: number;
  minConnectivityBps: number;
  minCohesionBps: number;
}>;

export type SettlementThresholdManifest = Readonly<{
  revision: string;
  tiers: readonly SettlementTierThreshold[];
}>;

export type SettlementBlockerCode =
  | "POPULATION_INSUFFICIENT"
  | "STABLE_RESIDENTS_INSUFFICIENT"
  | "STABLE_RESIDENCY_INSUFFICIENT"
  | "FOOD_ACCESS_INSUFFICIENT"
  | "WATER_ACCESS_INSUFFICIENT"
  | "SHELTER_CAPACITY_INSUFFICIENT"
  | "STORAGE_CAPACITY_INSUFFICIENT"
  | "LOCAL_PRODUCTION_INSUFFICIENT"
  | "SAFETY_INSUFFICIENT"
  | "CONNECTIVITY_INSUFFICIENT"
  | "COHESION_INSUFFICIENT";

export type SettlementBlocker = Readonly<{
  code: SettlementBlockerCode;
  actual: number;
  required: number;
}>;

export type SettlementEmergenceInput = Readonly<{
  populationState: PopulationState;
  sourceRevision: string;
  resolutionIndex: number;
  thresholdManifest: SettlementThresholdManifest;
  metricEvidence: readonly SettlementMetricEvidence[];
  capacityEvidence: readonly SettlementCapacityEvidence[];
  residencyEvidence: SettlementResidencyEvidence;
  existingSettlement: ExistingSettlementEvidence | null;
}>;

export type SettlementEmergenceResolution = Readonly<{
  protocol: typeof AURION_SETTLEMENT_EMERGENCE_PROTOCOL;
  worldId: string;
  regionId: string;
  settlementId: string;
  sourceRevision: string;
  resolutionIndex: number;
  populationStateHash: string;
  thresholdManifestHash: string;
  evidenceHash: string;
  authorityReceiptHash: string;
  existingTier: SettlementTier | null;
  highestEligibleTier: SettlementTier | null;
  currentTierSatisfied: boolean;
  proposedTier: SettlementTier | null;
  growthEligible: boolean;
  currentTierBlockers: readonly SettlementBlocker[];
  nextTierBlockers: readonly SettlementBlocker[];
  effectIntent: AurionEffectIntent | null;
  resolutionHash: string;
}>;

type SettlementObservation = Readonly<{
  population: number;
  stableResidents: number;
  stableResidencyResolutions: number;
  foodAccessBps: number;
  waterAccessBps: number;
  shelterCapacity: number;
  storageCapacity: number;
  localProductionBps: number;
  safetyBps: number;
  connectivityBps: number;
  cohesionBps: number;
}>;

const TIER_INDEX = new Map<SettlementTier, number>(
  SETTLEMENT_TIERS.map((tier, index) => [tier, index] as const)
);

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertIdentifier(value: string, code: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,191}$/.test(value)) throw new Error(code);
  return value;
}

function assertRevision(value: string, code: string): string {
  if (!/^[a-f0-9]{40}$/.test(value)) throw new Error(code);
  return value;
}

function assertHash(value: string, code: string): string {
  if (!/^sha256:[a-f0-9]{64}$/.test(value)) throw new Error(code);
  return value;
}

function assertIndex(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000)
    throw new Error(code);
  return value;
}

function assertBps(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > SETTLEMENT_BPS_MAX)
    throw new Error(code);
  return value;
}

function assertEvidenceBinding(
  sourceReceiptId: string,
  sourceReceiptHash: string,
  sourceRevision: string,
  resolutionIndex: number,
  expectedRevision: string,
  expectedResolutionIndex: number
): void {
  assertIdentifier(sourceReceiptId, "SETTLEMENT_EVIDENCE_RECEIPT_ID_INVALID");
  assertHash(sourceReceiptHash, "SETTLEMENT_EVIDENCE_RECEIPT_HASH_INVALID");
  assertRevision(sourceRevision, "SETTLEMENT_EVIDENCE_REVISION_INVALID");
  assertIndex(resolutionIndex, "SETTLEMENT_EVIDENCE_RESOLUTION_INDEX_INVALID");
  if (sourceRevision !== expectedRevision)
    throw new Error("SETTLEMENT_EVIDENCE_REVISION_MISMATCH");
  if (resolutionIndex !== expectedResolutionIndex)
    throw new Error("SETTLEMENT_EVIDENCE_RESOLUTION_INDEX_MISMATCH");
}

function normalizeThresholdManifest(
  manifest: SettlementThresholdManifest
): readonly SettlementTierThreshold[] {
  assertRevision(
    manifest.revision,
    "SETTLEMENT_THRESHOLD_MANIFEST_REVISION_INVALID"
  );
  if (manifest.tiers.length !== SETTLEMENT_TIERS.length)
    throw new Error("SETTLEMENT_THRESHOLD_TIER_COUNT_INVALID");
  const byTier = new Map<SettlementTier, SettlementTierThreshold>();
  for (const threshold of manifest.tiers) {
    if (!TIER_INDEX.has(threshold.tier))
      throw new Error("SETTLEMENT_THRESHOLD_TIER_INVALID");
    if (byTier.has(threshold.tier))
      throw new Error("SETTLEMENT_THRESHOLD_TIER_DUPLICATE");
    const normalized: SettlementTierThreshold = {
      tier: threshold.tier,
      minPopulation: assertIndex(
        threshold.minPopulation,
        "SETTLEMENT_THRESHOLD_POPULATION_INVALID"
      ),
      minStableResidents: assertIndex(
        threshold.minStableResidents,
        "SETTLEMENT_THRESHOLD_STABLE_RESIDENTS_INVALID"
      ),
      minStableResidencyResolutions: assertIndex(
        threshold.minStableResidencyResolutions,
        "SETTLEMENT_THRESHOLD_STABLE_RESIDENCY_INVALID"
      ),
      minFoodAccessBps: assertBps(
        threshold.minFoodAccessBps,
        "SETTLEMENT_THRESHOLD_FOOD_ACCESS_INVALID"
      ),
      minWaterAccessBps: assertBps(
        threshold.minWaterAccessBps,
        "SETTLEMENT_THRESHOLD_WATER_ACCESS_INVALID"
      ),
      minShelterCapacity: assertIndex(
        threshold.minShelterCapacity,
        "SETTLEMENT_THRESHOLD_SHELTER_CAPACITY_INVALID"
      ),
      minStorageCapacity: assertIndex(
        threshold.minStorageCapacity,
        "SETTLEMENT_THRESHOLD_STORAGE_CAPACITY_INVALID"
      ),
      minLocalProductionBps: assertBps(
        threshold.minLocalProductionBps,
        "SETTLEMENT_THRESHOLD_LOCAL_PRODUCTION_INVALID"
      ),
      minSafetyBps: assertBps(
        threshold.minSafetyBps,
        "SETTLEMENT_THRESHOLD_SAFETY_INVALID"
      ),
      minConnectivityBps: assertBps(
        threshold.minConnectivityBps,
        "SETTLEMENT_THRESHOLD_CONNECTIVITY_INVALID"
      ),
      minCohesionBps: assertBps(
        threshold.minCohesionBps,
        "SETTLEMENT_THRESHOLD_COHESION_INVALID"
      ),
    };
    if (
      normalized.minStableResidents > normalized.minPopulation ||
      normalized.minShelterCapacity < normalized.minPopulation
    )
      throw new Error("SETTLEMENT_THRESHOLD_CAPACITY_CONTRADICTORY");
    byTier.set(normalized.tier, normalized);
  }
  const ordered = SETTLEMENT_TIERS.map(tier => byTier.get(tier)!);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const next = ordered[index]!;
    if (next.minPopulation <= previous.minPopulation)
      throw new Error("SETTLEMENT_THRESHOLD_POPULATION_NOT_STRICT");
    const monotonePairs: readonly [number, number][] = [
      [next.minStableResidents, previous.minStableResidents],
      [
        next.minStableResidencyResolutions,
        previous.minStableResidencyResolutions,
      ],
      [next.minFoodAccessBps, previous.minFoodAccessBps],
      [next.minWaterAccessBps, previous.minWaterAccessBps],
      [next.minShelterCapacity, previous.minShelterCapacity],
      [next.minStorageCapacity, previous.minStorageCapacity],
      [next.minLocalProductionBps, previous.minLocalProductionBps],
      [next.minSafetyBps, previous.minSafetyBps],
      [next.minConnectivityBps, previous.minConnectivityBps],
      [next.minCohesionBps, previous.minCohesionBps],
    ];
    if (monotonePairs.some(([value, prior]) => value < prior))
      throw new Error("SETTLEMENT_THRESHOLD_NOT_MONOTONE");
  }
  return Object.freeze(ordered.map(value => Object.freeze({ ...value })));
}

function normalizeMetricEvidence(
  values: readonly SettlementMetricEvidence[],
  sourceRevision: string,
  resolutionIndex: number
): readonly SettlementMetricEvidence[] {
  if (values.length !== SETTLEMENT_METRIC_KINDS.length)
    throw new Error("SETTLEMENT_METRIC_COUNT_INVALID");
  const byKind = new Map<SettlementMetricKind, SettlementMetricEvidence>();
  for (const value of values) {
    if (!SETTLEMENT_METRIC_KINDS.includes(value.kind))
      throw new Error("SETTLEMENT_METRIC_KIND_INVALID");
    if (byKind.has(value.kind)) throw new Error("SETTLEMENT_METRIC_DUPLICATE");
    assertEvidenceBinding(
      value.sourceReceiptId,
      value.sourceReceiptHash,
      value.sourceRevision,
      value.resolutionIndex,
      sourceRevision,
      resolutionIndex
    );
    byKind.set(
      value.kind,
      Object.freeze({
        ...value,
        valueBps: assertBps(value.valueBps, "SETTLEMENT_METRIC_BPS_INVALID"),
      })
    );
  }
  return Object.freeze(
    SETTLEMENT_METRIC_KINDS.map(kind => {
      const value = byKind.get(kind);
      if (!value) throw new Error("SETTLEMENT_METRIC_MISSING");
      return value;
    })
  );
}

function normalizeCapacityEvidence(
  values: readonly SettlementCapacityEvidence[],
  sourceRevision: string,
  resolutionIndex: number
): readonly SettlementCapacityEvidence[] {
  if (values.length !== SETTLEMENT_CAPACITY_KINDS.length)
    throw new Error("SETTLEMENT_CAPACITY_COUNT_INVALID");
  const byKind = new Map<SettlementCapacityKind, SettlementCapacityEvidence>();
  for (const value of values) {
    if (!SETTLEMENT_CAPACITY_KINDS.includes(value.kind))
      throw new Error("SETTLEMENT_CAPACITY_KIND_INVALID");
    if (byKind.has(value.kind))
      throw new Error("SETTLEMENT_CAPACITY_DUPLICATE");
    assertEvidenceBinding(
      value.sourceReceiptId,
      value.sourceReceiptHash,
      value.sourceRevision,
      value.resolutionIndex,
      sourceRevision,
      resolutionIndex
    );
    byKind.set(
      value.kind,
      Object.freeze({
        ...value,
        capacity: assertIndex(value.capacity, "SETTLEMENT_CAPACITY_INVALID"),
      })
    );
  }
  return Object.freeze(
    SETTLEMENT_CAPACITY_KINDS.map(kind => {
      const value = byKind.get(kind);
      if (!value) throw new Error("SETTLEMENT_CAPACITY_MISSING");
      return value;
    })
  );
}

function normalizeResidencyEvidence(
  value: SettlementResidencyEvidence,
  populationState: PopulationState,
  sourceRevision: string,
  resolutionIndex: number
): SettlementResidencyEvidence {
  assertEvidenceBinding(
    value.sourceReceiptId,
    value.sourceReceiptHash,
    value.sourceRevision,
    value.resolutionIndex,
    sourceRevision,
    resolutionIndex
  );
  const stableSinceResolutionIndex = assertIndex(
    value.stableSinceResolutionIndex,
    "SETTLEMENT_STABLE_RESIDENCY_INDEX_INVALID"
  );
  if (stableSinceResolutionIndex > resolutionIndex)
    throw new Error("SETTLEMENT_STABLE_RESIDENCY_AFTER_RESOLUTION");
  const residentIds = [...value.residentIds]
    .map(personId =>
      assertIdentifier(personId, "SETTLEMENT_STABLE_RESIDENT_ID_INVALID")
    )
    .sort(compare);
  if (new Set(residentIds).size !== residentIds.length)
    throw new Error("SETTLEMENT_STABLE_RESIDENT_DUPLICATE");
  const alive = new Set(populationState.alivePersonIds);
  if (residentIds.some(personId => !alive.has(personId)))
    throw new Error("SETTLEMENT_STABLE_RESIDENT_UNKNOWN");
  return Object.freeze({
    ...value,
    stableSinceResolutionIndex,
    residentIds: Object.freeze(residentIds),
  });
}

function normalizeExistingSettlement(
  value: ExistingSettlementEvidence | null,
  sourceRevision: string
): ExistingSettlementEvidence | null {
  if (!value) return null;
  if (!TIER_INDEX.has(value.tier))
    throw new Error("SETTLEMENT_EXISTING_TIER_INVALID");
  assertIdentifier(
    value.sourceReceiptId,
    "SETTLEMENT_EXISTING_RECEIPT_ID_INVALID"
  );
  assertHash(
    value.sourceReceiptHash,
    "SETTLEMENT_EXISTING_RECEIPT_HASH_INVALID"
  );
  assertRevision(value.sourceRevision, "SETTLEMENT_EXISTING_REVISION_INVALID");
  if (value.sourceRevision !== sourceRevision)
    throw new Error("SETTLEMENT_EXISTING_REVISION_MISMATCH");
  return Object.freeze({ ...value });
}

function blockersFor(
  threshold: SettlementTierThreshold,
  observation: SettlementObservation
): readonly SettlementBlocker[] {
  const blockers: SettlementBlocker[] = [];
  const collect = (
    code: SettlementBlockerCode,
    actual: number,
    required: number
  ) => {
    if (actual < required) blockers.push({ code, actual, required });
  };
  collect(
    "POPULATION_INSUFFICIENT",
    observation.population,
    threshold.minPopulation
  );
  collect(
    "STABLE_RESIDENTS_INSUFFICIENT",
    observation.stableResidents,
    threshold.minStableResidents
  );
  collect(
    "STABLE_RESIDENCY_INSUFFICIENT",
    observation.stableResidencyResolutions,
    threshold.minStableResidencyResolutions
  );
  collect(
    "FOOD_ACCESS_INSUFFICIENT",
    observation.foodAccessBps,
    threshold.minFoodAccessBps
  );
  collect(
    "WATER_ACCESS_INSUFFICIENT",
    observation.waterAccessBps,
    threshold.minWaterAccessBps
  );
  collect(
    "SHELTER_CAPACITY_INSUFFICIENT",
    observation.shelterCapacity,
    threshold.minShelterCapacity
  );
  collect(
    "STORAGE_CAPACITY_INSUFFICIENT",
    observation.storageCapacity,
    threshold.minStorageCapacity
  );
  collect(
    "LOCAL_PRODUCTION_INSUFFICIENT",
    observation.localProductionBps,
    threshold.minLocalProductionBps
  );
  collect("SAFETY_INSUFFICIENT", observation.safetyBps, threshold.minSafetyBps);
  collect(
    "CONNECTIVITY_INSUFFICIENT",
    observation.connectivityBps,
    threshold.minConnectivityBps
  );
  collect(
    "COHESION_INSUFFICIENT",
    observation.cohesionBps,
    threshold.minCohesionBps
  );
  return Object.freeze(blockers.map(value => Object.freeze(value)));
}

export function resolveSettlementEmergence(
  input: SettlementEmergenceInput
): SettlementEmergenceResolution {
  const sourceRevision = assertRevision(
    input.sourceRevision,
    "SETTLEMENT_SOURCE_REVISION_INVALID"
  );
  const resolutionIndex = assertIndex(
    input.resolutionIndex,
    "SETTLEMENT_RESOLUTION_INDEX_INVALID"
  );
  const populationState = createPopulationState(input.populationState);
  if (populationState.stateHash !== input.populationState.stateHash)
    throw new Error("SETTLEMENT_POPULATION_STATE_HASH_MISMATCH");
  if (populationState.resolutionIndex !== resolutionIndex)
    throw new Error("SETTLEMENT_POPULATION_RESOLUTION_INDEX_MISMATCH");

  const thresholds = normalizeThresholdManifest(input.thresholdManifest);
  const metricEvidence = normalizeMetricEvidence(
    input.metricEvidence,
    sourceRevision,
    resolutionIndex
  );
  const capacityEvidence = normalizeCapacityEvidence(
    input.capacityEvidence,
    sourceRevision,
    resolutionIndex
  );
  const residencyEvidence = normalizeResidencyEvidence(
    input.residencyEvidence,
    populationState,
    sourceRevision,
    resolutionIndex
  );
  const existingSettlement = normalizeExistingSettlement(
    input.existingSettlement,
    sourceRevision
  );
  const metrics = new Map(
    metricEvidence.map(value => [value.kind, value.valueBps])
  );
  const capacities = new Map(
    capacityEvidence.map(value => [value.kind, value.capacity])
  );
  const observation: SettlementObservation = Object.freeze({
    population: populationState.population,
    stableResidents: residencyEvidence.residentIds.length,
    stableResidencyResolutions:
      resolutionIndex - residencyEvidence.stableSinceResolutionIndex,
    foodAccessBps: metrics.get("food_access")!,
    waterAccessBps: metrics.get("water_access")!,
    shelterCapacity: capacities.get("shelter")!,
    storageCapacity: capacities.get("storage")!,
    localProductionBps: metrics.get("local_production")!,
    safetyBps: metrics.get("safety")!,
    connectivityBps: metrics.get("connectivity")!,
    cohesionBps: metrics.get("cohesion")!,
  });
  const thresholdManifestHash = canonicalSha256({
    protocol: AURION_SETTLEMENT_EMERGENCE_PROTOCOL,
    revision: input.thresholdManifest.revision,
    tiers: thresholds,
  });
  const evidenceHash = canonicalSha256({
    domain: "aurion.settlement-emergence.evidence.v1",
    sourceRevision,
    resolutionIndex,
    metricEvidence,
    capacityEvidence,
    residencyEvidence,
    existingSettlement,
  });
  const authorityReceiptHash = canonicalSha256({
    domain: "aurion.settlement-emergence.authority.v1",
    worldId: populationState.worldId,
    regionId: populationState.regionId,
    sourceRevision,
    resolutionIndex,
    populationStateHash: populationState.stateHash,
    thresholdManifestHash,
    evidenceHash,
  });
  const highestEligibleTier = thresholds.reduce<SettlementTier | null>(
    (highest, threshold) =>
      blockersFor(threshold, observation).length === 0
        ? threshold.tier
        : highest,
    null
  );
  const existingTier = existingSettlement?.tier ?? null;
  const existingIndex =
    existingTier === null ? -1 : TIER_INDEX.get(existingTier)!;
  const currentThreshold =
    existingIndex < 0 ? null : thresholds[existingIndex]!;
  const currentTierBlockers = currentThreshold
    ? blockersFor(currentThreshold, observation)
    : Object.freeze([] as SettlementBlocker[]);
  const nextThreshold = thresholds[existingIndex + 1] ?? null;
  const nextTierBlockers = nextThreshold
    ? blockersFor(nextThreshold, observation)
    : Object.freeze([] as SettlementBlocker[]);
  const currentTierSatisfied = currentTierBlockers.length === 0;
  const proposedTier =
    currentTierSatisfied && nextThreshold && nextTierBlockers.length === 0
      ? nextThreshold.tier
      : existingTier;
  const growthEligible = proposedTier !== existingTier;
  const settlementId = `settlement:${populationState.worldId}:${populationState.regionId}`;
  const effectIntent = growthEligible
    ? createEffectIntent({
        authorityReceiptHash,
        effectType: "settlement-emergence",
        subjectId: settlementId,
        ordinal: resolutionIndex,
        payload: {
          protocol: AURION_SETTLEMENT_EMERGENCE_PROTOCOL,
          fromTier: existingTier ?? "unformed",
          toTier: proposedTier!,
          sourceRevision,
          populationStateHash: populationState.stateHash,
          thresholdManifestHash,
          evidenceHash,
        },
      })
    : null;
  const resolutionHash = canonicalSha256({
    protocol: AURION_SETTLEMENT_EMERGENCE_PROTOCOL,
    worldId: populationState.worldId,
    regionId: populationState.regionId,
    settlementId,
    sourceRevision,
    resolutionIndex,
    populationStateHash: populationState.stateHash,
    thresholdManifestHash,
    evidenceHash,
    authorityReceiptHash,
    existingTier,
    highestEligibleTier,
    currentTierSatisfied,
    proposedTier,
    growthEligible,
    currentTierBlockers,
    nextTierBlockers,
    effectIntent: effectIntent
      ? {
          effectId: effectIntent.effectId,
          payloadHash: effectIntent.payloadHash,
        }
      : null,
  });
  return Object.freeze({
    protocol: AURION_SETTLEMENT_EMERGENCE_PROTOCOL,
    worldId: populationState.worldId,
    regionId: populationState.regionId,
    settlementId,
    sourceRevision,
    resolutionIndex,
    populationStateHash: populationState.stateHash,
    thresholdManifestHash,
    evidenceHash,
    authorityReceiptHash,
    existingTier,
    highestEligibleTier,
    currentTierSatisfied,
    proposedTier,
    growthEligible,
    currentTierBlockers,
    nextTierBlockers,
    effectIntent,
    resolutionHash,
  });
}

export function verifySettlementEmergenceResolution(
  input: SettlementEmergenceInput,
  resolution: SettlementEmergenceResolution
): boolean {
  try {
    const expected = resolveSettlementEmergence(input);
    return (
      expected.resolutionHash === resolution.resolutionHash &&
      expected.effectIntent?.effectId === resolution.effectIntent?.effectId &&
      expected.effectIntent?.payloadHash ===
        resolution.effectIntent?.payloadHash
    );
  } catch {
    return false;
  }
}
