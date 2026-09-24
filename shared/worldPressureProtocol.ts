import { canonicalSha256 } from "./aurionCanonicalHash";

type GlobalWorldSectorLike = {
  id: string;
  settlement: { population: number; capacity: number };
  resources: { food: number; water: number; ore: number; drought: number; forestHealth: number };
  polity: { conflictPressure: number; stability: number };
};

type GlobalWorldPlanLike = {
  epoch: number;
  deterministicHash: string;
  sectors: readonly GlobalWorldSectorLike[];
};

export const WORLD_PRESSURE_SCHEMA = "aurion.world-pressure.v1" as const;
export const WORLD_PRESSURE_RULESET_VERSION = "aurion.world-pressure.rules.v1" as const;
export const WORLD_DIRECTOR_SCHEMA = "aurion.world-director.v1" as const;
export const WORLD_DIRECTOR_RULESET_VERSION = "aurion.world-director.rules.v1" as const;

export type WorldIntentKind =
  | "caravan"
  | "migration"
  | "supply_intervention"
  | "regional_defense"
  | "pressure_escalation"
  | "event_opportunity";

export type WorldPressureRegion = Readonly<{
  regionId: string;
  populationBps: number;
  resourceBps: number;
  economyBps: number;
  politicsBps: number;
  ecologyBps: number;
  totalBps: number;
}>;

export type WorldPressureField = Readonly<{
  schemaVersion: typeof WORLD_PRESSURE_SCHEMA;
  rulesetVersion: typeof WORLD_PRESSURE_RULESET_VERSION;
  worldId: string;
  worldEpoch: number;
  logicalTick: number;
  sourceRevision: string;
  sourceRootHash: string;
  regions: readonly WorldPressureRegion[];
  fieldHash: string;
}>;

export type WorldDirectorCandidate = Readonly<{
  id: string;
  kind: WorldIntentKind;
  sourceRegionId: string;
  targetRegionId: string | null;
  magnitudeBps: number;
  rationaleCode: string;
}>;

export type WorldIntent = Readonly<{
  id: string;
  kind: WorldIntentKind;
  sourceRegionId: string;
  targetRegionId: string | null;
  magnitudeBps: number;
  priorityBps: number;
  candidateId: string;
  decisionHash: string;
}>;

export type WorldDirectorDecision = Readonly<{
  schemaVersion: typeof WORLD_DIRECTOR_SCHEMA;
  rulesetVersion: typeof WORLD_DIRECTOR_RULESET_VERSION;
  worldId: string;
  worldEpoch: number;
  logicalTick: number;
  sourceRevision: string;
  sourceRootHash: string;
  causalReceiptHash: string;
  seedDigest: string;
  previousReceiptHash: string | null;
  candidateSetHash: string;
  decisionHash: string;
  intents: readonly WorldIntent[];
}>;

function assertNonNegativeSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`WORLD_DIRECTOR_INVALID_${label.toUpperCase()}`);
}

function assertBps(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > 10_000) {
    throw new Error(`WORLD_DIRECTOR_INVALID_${label.toUpperCase()}`);
  }
}

function toBps(value: number): number {
  if (!Number.isFinite(value)) throw new Error("WORLD_PRESSURE_NON_FINITE");
  return Math.max(0, Math.min(10_000, Math.round(value * 10_000)));
}

function sectorPressureDimensions(sector: GlobalWorldSectorLike): Omit<WorldPressureRegion, "regionId" | "totalBps"> {
  const populationPressure = toBps(sector.settlement.population / Math.max(1, sector.settlement.capacity));
  const foodPressure = toBps(1 - sector.resources.food);
  const waterPressure = toBps(1 - sector.resources.water);
  const orePressure = toBps(1 - sector.resources.ore);
  const droughtPressure = toBps(sector.resources.drought);
  const resourceBps = Math.round((foodPressure + waterPressure + orePressure + droughtPressure) / 4);
  const economyBps = toBps(Math.abs(sector.resources.food - sector.resources.ore));
  const politicsBps = toBps(Math.max(sector.polity.conflictPressure, 1 - sector.polity.stability));
  const ecologyBps = Math.round(((10_000 - toBps(sector.resources.forestHealth)) + droughtPressure) / 2);
  return Object.freeze({
    populationBps: populationPressure,
    resourceBps,
    economyBps,
    politicsBps,
    ecologyBps,
  });
}

export function buildWorldPressureField(input: {
  worldPlan: GlobalWorldPlanLike;
  worldRevision: string;
  logicalTick: number;
  sourceRootHash?: string;
}): WorldPressureField {
  assertNonNegativeSafeInteger(input.worldPlan.epoch, "epoch");
  assertNonNegativeSafeInteger(input.logicalTick, "tick");
  if (!input.worldRevision.trim()) throw new Error("WORLD_DIRECTOR_SOURCE_REVISION_REQUIRED");
  const sourceRootHash = input.sourceRootHash ?? input.worldPlan.deterministicHash;
  if (!sourceRootHash.trim()) throw new Error("WORLD_DIRECTOR_SOURCE_ROOT_REQUIRED");

  const regions = input.worldPlan.sectors
    .map(sector => {
      const dimensions = sectorPressureDimensions(sector);
      const totalBps = Math.round(
        (
          dimensions.populationBps * 2 +
          dimensions.resourceBps * 4 +
          dimensions.economyBps * 3 +
          dimensions.politicsBps * 5 +
          dimensions.ecologyBps * 3
        ) / 17
      );
      return Object.freeze({ regionId: sector.id, ...dimensions, totalBps });
    })
    .sort((left, right) => left.regionId.localeCompare(right.regionId));

  const fieldHash = canonicalSha256({
    schemaVersion: WORLD_PRESSURE_SCHEMA,
    rulesetVersion: WORLD_PRESSURE_RULESET_VERSION,
    worldId: "echoes-of-aurion-global",
    worldEpoch: input.worldPlan.epoch,
    logicalTick: input.logicalTick,
    sourceRevision: input.worldRevision,
    sourceRootHash,
    regions,
  });

  return Object.freeze({
    schemaVersion: WORLD_PRESSURE_SCHEMA,
    rulesetVersion: WORLD_PRESSURE_RULESET_VERSION,
    worldId: "echoes-of-aurion-global",
    worldEpoch: input.worldPlan.epoch,
    logicalTick: input.logicalTick,
    sourceRevision: input.worldRevision,
    sourceRootHash,
    regions: Object.freeze(regions),
    fieldHash,
  });
}

export function deriveWorldDirectorCandidates(
  field: WorldPressureField,
  worldPlan: GlobalWorldPlanLike,
): readonly WorldDirectorCandidate[] {
  const sectors = [...worldPlan.sectors].sort((a, b) => a.id.localeCompare(b.id));
  const candidates: WorldDirectorCandidate[] = [];

  for (const region of field.regions) {
    const sector = sectors.find(other => other.id === region.regionId);
    if (!sector) throw new Error(`WORLD_DIRECTOR_REGION_MISSING:${region.regionId}`);
    const neighbor = sectors.find(other => other.id !== sector.id) ?? null;
    if (region.economyBps >= 4_600 && neighbor) {
      candidates.push({
        id: `director:${region.regionId}:caravan`,
        kind: "caravan",
        sourceRegionId: region.regionId,
        targetRegionId: neighbor.id,
        magnitudeBps: region.economyBps,
        rationaleCode: "TRADE_IMBALANCE",
      });
    }
    if (region.resourceBps >= 5_500 && neighbor) {
      candidates.push({
        id: `director:${region.regionId}:supply`,
        kind: "supply_intervention",
        sourceRegionId: region.regionId,
        targetRegionId: neighbor.id,
        magnitudeBps: region.resourceBps,
        rationaleCode: "RESOURCE_SHORTAGE",
      });
    }
    if (region.populationBps >= 7_500 && neighbor) {
      candidates.push({
        id: `director:${region.regionId}:migration`,
        kind: "migration",
        sourceRegionId: region.regionId,
        targetRegionId: neighbor.id,
        magnitudeBps: region.populationBps,
        rationaleCode: "CAPACITY_PRESSURE",
      });
    }
    if (region.politicsBps >= 5_500) {
      candidates.push({
        id: `director:${region.regionId}:defense`,
        kind: "regional_defense",
        sourceRegionId: region.regionId,
        targetRegionId: null,
        magnitudeBps: region.politicsBps,
        rationaleCode: "POLITICAL_INSTABILITY",
      });
    }
    if (region.totalBps >= 6_500) {
      candidates.push({
        id: `director:${region.regionId}:escalation`,
        kind: "pressure_escalation",
        sourceRegionId: region.regionId,
        targetRegionId: null,
        magnitudeBps: region.totalBps,
        rationaleCode: "COMPOSITE_PRESSURE",
      });
    }
    if (region.totalBps >= 3_000 && region.totalBps < 6_500) {
      candidates.push({
        id: `director:${region.regionId}:event`,
        kind: "event_opportunity",
        sourceRegionId: region.regionId,
        targetRegionId: null,
        magnitudeBps: region.totalBps,
        rationaleCode: "EMERGENT_OPPORTUNITY",
      });
    }
  }

  return Object.freeze([...candidates].sort(
    (left, right) =>
      right.magnitudeBps - left.magnitudeBps ||
      left.kind.localeCompare(right.kind) ||
      left.sourceRegionId.localeCompare(right.sourceRegionId) ||
      (left.targetRegionId ?? "").localeCompare(right.targetRegionId ?? "") ||
      left.id.localeCompare(right.id),
  ));
}

export function decideWorldDirectors(input: {
  field: WorldPressureField;
  candidates: readonly WorldDirectorCandidate[];
  causalReceiptHash: string;
  seedDigest: string;
  previousReceiptHash: string | null;
  maxIntents?: number;
}): WorldDirectorDecision {
  if (!/^sha256:[a-f0-9]{64}$/.test(input.causalReceiptHash)) throw new Error("WORLD_DIRECTOR_CAUSAL_RECEIPT_INVALID");
  if (!/^sha256:[a-f0-9]{64}$/.test(input.seedDigest)) throw new Error("WORLD_DIRECTOR_SEED_INVALID");

  const normalized = [...input.candidates].sort(
    (left, right) =>
      left.id.localeCompare(right.id) ||
      left.kind.localeCompare(right.kind) ||
      left.sourceRegionId.localeCompare(right.sourceRegionId) ||
      (left.targetRegionId ?? "").localeCompare(right.targetRegionId ?? "") ||
      left.magnitudeBps - right.magnitudeBps,
  );
  if (new Set(normalized.map(candidate => candidate.id)).size !== normalized.length) {
    throw new Error("WORLD_DIRECTOR_CANDIDATE_ID_CONFLICT");
  }
  for (const candidate of normalized) assertBps(candidate.magnitudeBps, "magnitude");

  const candidateSetHash = canonicalSha256({
    schemaVersion: WORLD_DIRECTOR_SCHEMA,
    fieldHash: input.field.fieldHash,
    candidates: normalized,
  });
  const maxIntents = Math.max(1, Math.min(64, input.maxIntents ?? 16));
  const selected = normalized.slice(0, maxIntents);
  const decisionHash = canonicalSha256({
    schemaVersion: WORLD_DIRECTOR_SCHEMA,
    rulesetVersion: WORLD_DIRECTOR_RULESET_VERSION,
    worldId: input.field.worldId,
    worldEpoch: input.field.worldEpoch,
    logicalTick: input.field.logicalTick,
    sourceRevision: input.field.sourceRevision,
    sourceRootHash: input.field.sourceRootHash,
    causalReceiptHash: input.causalReceiptHash,
    seedDigest: input.seedDigest,
    previousReceiptHash: input.previousReceiptHash,
    candidateSetHash,
    selected,
  });

  const intents = selected.map(candidate => Object.freeze({
    id: `intent:${candidate.id}`,
    kind: candidate.kind,
    sourceRegionId: candidate.sourceRegionId,
    targetRegionId: candidate.targetRegionId,
    magnitudeBps: candidate.magnitudeBps,
    priorityBps: candidate.magnitudeBps,
    candidateId: candidate.id,
    decisionHash,
  }));

  return Object.freeze({
    schemaVersion: WORLD_DIRECTOR_SCHEMA,
    rulesetVersion: WORLD_DIRECTOR_RULESET_VERSION,
    worldId: input.field.worldId,
    worldEpoch: input.field.worldEpoch,
    logicalTick: input.field.logicalTick,
    sourceRevision: input.field.sourceRevision,
    sourceRootHash: input.field.sourceRootHash,
    causalReceiptHash: input.causalReceiptHash,
    seedDigest: input.seedDigest,
    previousReceiptHash: input.previousReceiptHash,
    candidateSetHash,
    decisionHash,
    intents: Object.freeze(intents),
  });
}
