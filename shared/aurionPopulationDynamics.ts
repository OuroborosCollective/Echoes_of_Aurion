import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_POPULATION_DYNAMICS_PROTOCOL =
  "aurion.population-dynamics.v1" as const;
export const populationLifeStages = [
  "infant",
  "child",
  "adolescent",
  "adult",
  "elder",
] as const;
export type PopulationLifeStage = (typeof populationLifeStages)[number];
export const populationDeathCauses = [
  "age",
  "starvation",
  "combat",
  "condition",
] as const;
export type PopulationDeathCause = (typeof populationDeathCauses)[number];

const HASH = /^sha256:[a-f0-9]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX = 1_000_000_000;
const BPS = 10_000;

type PersonRef = Readonly<{
  personId: string;
  householdId: string;
  regionId: string;
  lifeStage: PopulationLifeStage;
  alive: boolean;
}>;
type HouseholdRef = Readonly<{
  householdId: string;
  regionId: string;
  residentIds: readonly string[];
  shelterCapacity: number;
}>;

export type PartnershipEligibilityInput = Readonly<{
  partnershipId: string;
  partnerIds: readonly [string, string];
  proximityBps: number;
  accessBps: number;
  socialCompatibilityBps: number;
  resourceBps: number;
  shelterBps: number;
  policyAllowed: boolean;
  lifeStageEligible: boolean;
  sourceReceiptIds: readonly string[];
}>;

export type PartnershipEligibility = Readonly<
  PartnershipEligibilityInput & {
    eligible: boolean;
    rejectionCodes: readonly string[];
    eligibilityHash: string;
  }
>;

export type PopulationBirthReceipt = Readonly<{
  receiptId: string;
  receiptHash: string;
  childId: string;
  parentIds: readonly [string, string];
  householdId: string;
  regionId: string;
  resolutionIndex: number;
}>;

export type PopulationDeathReceipt = Readonly<{
  receiptId: string;
  receiptHash: string;
  personId: string;
  cause: PopulationDeathCause;
  sourceReceiptId: string;
  resolutionIndex: number;
}>;

export type PopulationMigrationReceipt = Readonly<{
  receiptId: string;
  receiptHash: string;
  personId: string;
  householdId: string;
  fromRegionId: string;
  toRegionId: string;
  direction: "in" | "out";
  resolutionIndex: number;
}>;

export type PopulationLineageEdge = Readonly<{
  parentId: string;
  childId: string;
  birthReceiptId: string;
}>;
export type PopulationState = Readonly<{
  protocol: typeof AURION_POPULATION_DYNAMICS_PROTOCOL;
  worldId: string;
  regionId: string;
  resolutionIndex: number;
  alivePersonIds: readonly string[];
  households: readonly HouseholdRef[];
  lineage: readonly PopulationLineageEdge[];
  population: number;
  stateHash: string;
}>;

export type PopulationPressure = Readonly<{
  population: number;
  landNeedBps: number;
  foodShortageBps: number;
  housingNeedBps: number;
  migrationPressureBps: number;
  newSettlementPressureBps: number;
  pressureHash: string;
}>;

export type PopulationResolution = Readonly<{
  protocol: typeof AURION_POPULATION_DYNAMICS_PROTOCOL;
  worldId: string;
  regionId: string;
  previousStateHash: string;
  resolutionIndex: number;
  births: readonly PopulationBirthReceipt[];
  deaths: readonly PopulationDeathReceipt[];
  migrationsIn: readonly PopulationMigrationReceipt[];
  migrationsOut: readonly PopulationMigrationReceipt[];
  nextState: PopulationState;
  resolutionHash: string;
}>;

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function id(value: string, code: string): string {
  if (!ID.test(value)) throw new Error(code);
  return value;
}
function index(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX)
    throw new Error(code);
  return value;
}
function boundedBps(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > BPS)
    throw new Error(code);
  return value;
}
function hash(value: string, code: string): string {
  if (!HASH.test(value)) throw new Error(code);
  return value;
}
function sortedIds(values: readonly string[], code: string): readonly string[] {
  const result = [...values].map(value => id(value, code)).sort(compare);
  if (new Set(result).size !== result.length)
    throw new Error("POPULATION_DUPLICATE_ID");
  return Object.freeze(result);
}
function floorBps(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(
    BPS,
    Number((BigInt(numerator) * 10_000n) / BigInt(denominator))
  );
}
function validateStage(stage: PopulationLifeStage): void {
  if (!populationLifeStages.includes(stage))
    throw new Error("POPULATION_LIFE_STAGE_INVALID");
}

export function evaluatePartnershipEligibility(
  input: PartnershipEligibilityInput
): PartnershipEligibility {
  id(input.partnershipId, "POPULATION_PARTNERSHIP_ID_INVALID");
  if (
    input.partnerIds.length !== 2 ||
    input.partnerIds[0] === input.partnerIds[1]
  )
    throw new Error("POPULATION_PARTNERS_INVALID");
  const partnerIds = sortedIds(
    input.partnerIds,
    "POPULATION_PARTNER_ID_INVALID"
  ) as [string, string];
  const bps = [
    input.proximityBps,
    input.accessBps,
    input.socialCompatibilityBps,
    input.resourceBps,
    input.shelterBps,
  ].map(value => boundedBps(value, "POPULATION_ELIGIBILITY_BPS_INVALID"));
  const rejectionCodes = [
    ...(bps[0] < 5_000 ? ["PROXIMITY_INSUFFICIENT"] : []),
    ...(bps[1] < 5_000 ? ["ACCESS_INSUFFICIENT"] : []),
    ...(bps[2] < 5_000 ? ["SOCIAL_COMPATIBILITY_INSUFFICIENT"] : []),
    ...(bps[3] < 5_000 ? ["RESOURCES_INSUFFICIENT"] : []),
    ...(bps[4] < 5_000 ? ["SHELTER_INSUFFICIENT"] : []),
    ...(!input.lifeStageEligible ? ["LIFE_STAGE_INELIGIBLE"] : []),
    ...(!input.policyAllowed ? ["POLICY_DISALLOWS_PARTNERSHIP"] : []),
    ...(input.sourceReceiptIds.length === 0 ? ["SOURCE_RECEIPT_REQUIRED"] : []),
  ];
  const sourceReceiptIds = sortedIds(
    input.sourceReceiptIds,
    "POPULATION_SOURCE_RECEIPT_INVALID"
  );
  const unsigned = {
    protocol: AURION_POPULATION_DYNAMICS_PROTOCOL,
    partnershipId: input.partnershipId,
    partnerIds,
    proximityBps: bps[0],
    accessBps: bps[1],
    socialCompatibilityBps: bps[2],
    resourceBps: bps[3],
    shelterBps: bps[4],
    policyAllowed: input.policyAllowed,
    lifeStageEligible: input.lifeStageEligible,
    sourceReceiptIds,
    rejectionCodes,
  };
  return Object.freeze({
    ...input,
    partnerIds,
    proximityBps: bps[0],
    accessBps: bps[1],
    socialCompatibilityBps: bps[2],
    resourceBps: bps[3],
    shelterBps: bps[4],
    sourceReceiptIds,
    eligible: rejectionCodes.length === 0,
    rejectionCodes: Object.freeze(rejectionCodes),
    eligibilityHash: canonicalSha256(unsigned),
  });
}

function normalizeHouseholds(
  values: readonly HouseholdRef[]
): readonly HouseholdRef[] {
  const households = values
    .map(value => {
      const householdId = id(
        value.householdId,
        "POPULATION_HOUSEHOLD_ID_INVALID"
      );
      const regionId = id(value.regionId, "POPULATION_REGION_ID_INVALID");
      const residentIds = sortedIds(
        value.residentIds,
        "POPULATION_RESIDENT_ID_INVALID"
      );
      const shelterCapacity = index(
        value.shelterCapacity,
        "POPULATION_SHELTER_CAPACITY_INVALID"
      );
      if (residentIds.length > shelterCapacity)
        throw new Error("POPULATION_SHELTER_OVER_CAPACITY");
      return Object.freeze({
        householdId,
        regionId,
        residentIds,
        shelterCapacity,
      });
    })
    .sort((a, b) => compare(a.householdId, b.householdId));
  if (
    new Set(households.map(value => value.householdId)).size !==
    households.length
  )
    throw new Error("POPULATION_DUPLICATE_HOUSEHOLD");
  return Object.freeze(households);
}

export function createPopulationState(
  input: Omit<PopulationState, "protocol" | "population" | "stateHash">
): PopulationState {
  const worldId = id(input.worldId, "POPULATION_WORLD_ID_INVALID");
  const regionId = id(input.regionId, "POPULATION_REGION_ID_INVALID");
  const resolutionIndex = index(
    input.resolutionIndex,
    "POPULATION_RESOLUTION_INDEX_INVALID"
  );
  const alivePersonIds = sortedIds(
    input.alivePersonIds,
    "POPULATION_PERSON_ID_INVALID"
  );
  const households = normalizeHouseholds(input.households);
  const housed = new Set(
    households.flatMap(household => household.residentIds)
  );
  if ([...housed].some(personId => !alivePersonIds.includes(personId)))
    throw new Error("POPULATION_UNKNOWN_RESIDENT");
  const lineage = Object.freeze(
    [...input.lineage]
      .map(edge =>
        Object.freeze({
          parentId: id(edge.parentId, "POPULATION_LINEAGE_PARENT_INVALID"),
          childId: id(edge.childId, "POPULATION_LINEAGE_CHILD_INVALID"),
          birthReceiptId: id(
            edge.birthReceiptId,
            "POPULATION_BIRTH_RECEIPT_ID_INVALID"
          ),
        })
      )
      .sort(
        (a, b) =>
          compare(a.childId, b.childId) || compare(a.parentId, b.parentId)
      )
  );
  const unsigned = {
    protocol: AURION_POPULATION_DYNAMICS_PROTOCOL,
    worldId,
    regionId,
    resolutionIndex,
    alivePersonIds,
    households,
    lineage,
  };
  return Object.freeze({
    ...unsigned,
    population: alivePersonIds.length,
    stateHash: canonicalSha256(unsigned),
  });
}

function validateReceiptIdentity(
  receiptId: string,
  receiptHash: string,
  code: string
): void {
  id(receiptId, code);
  hash(receiptHash, "POPULATION_RECEIPT_HASH_INVALID");
}

export function resolvePopulationStep(
  input: Readonly<{
    state: PopulationState;
    personRefs: readonly PersonRef[];
    births: readonly PopulationBirthReceipt[];
    deaths: readonly PopulationDeathReceipt[];
    migrations: readonly PopulationMigrationReceipt[];
  }>
): PopulationResolution {
  const state = createPopulationState(input.state);
  if (state.stateHash !== input.state.stateHash)
    throw new Error("POPULATION_STATE_HASH_MISMATCH");
  const nextIndex = index(
    state.resolutionIndex + 1,
    "POPULATION_RESOLUTION_INDEX_INVALID"
  );
  const known = new Set(state.alivePersonIds);
  const refs = new Map(
    input.personRefs.map(
      person =>
        [id(person.personId, "POPULATION_PERSON_ID_INVALID"), person] as const
    )
  );
  for (const personId of state.alivePersonIds)
    if (!refs.has(personId))
      throw new Error("POPULATION_PERSON_REFERENCE_REQUIRED");
  const births = [...input.births].sort((a, b) =>
    compare(a.receiptId, b.receiptId)
  );
  const deaths = [...input.deaths].sort((a, b) =>
    compare(a.receiptId, b.receiptId)
  );
  const migrationsIn = input.migrations
    .filter(migration => migration.direction === "in")
    .sort((a, b) => compare(a.receiptId, b.receiptId));
  const migrationsOut = input.migrations
    .filter(migration => migration.direction === "out")
    .sort((a, b) => compare(a.receiptId, b.receiptId));
  const receiptIds = [...births, ...deaths, ...input.migrations].map(
    receipt => receipt.receiptId
  );
  if (new Set(receiptIds).size !== receiptIds.length)
    throw new Error("POPULATION_DUPLICATE_RECEIPT");
  for (const receipt of births) {
    validateReceiptIdentity(
      receipt.receiptId,
      receipt.receiptHash,
      "POPULATION_BIRTH_RECEIPT_ID_INVALID"
    );
    if (
      receipt.resolutionIndex !== nextIndex ||
      known.has(receipt.childId) ||
      receipt.parentIds[0] === receipt.parentIds[1] ||
      !known.has(receipt.parentIds[0]) ||
      !known.has(receipt.parentIds[1])
    )
      throw new Error("POPULATION_BIRTH_NOT_ELIGIBLE");
    const household = state.households.find(
      value => value.householdId === receipt.householdId
    );
    if (!household || household.residentIds.length >= household.shelterCapacity)
      throw new Error("POPULATION_BIRTH_SHELTER_INVALID");
    known.add(id(receipt.childId, "POPULATION_CHILD_ID_INVALID"));
  }
  for (const receipt of deaths) {
    validateReceiptIdentity(
      receipt.receiptId,
      receipt.receiptHash,
      "POPULATION_DEATH_RECEIPT_ID_INVALID"
    );
    id(receipt.sourceReceiptId, "POPULATION_DEATH_SOURCE_INVALID");
    if (
      !populationDeathCauses.includes(receipt.cause) ||
      receipt.resolutionIndex !== nextIndex ||
      !state.alivePersonIds.includes(receipt.personId)
    )
      throw new Error("POPULATION_DEATH_NOT_ELIGIBLE");
    known.delete(receipt.personId);
  }
  for (const receipt of [...migrationsIn, ...migrationsOut]) {
    validateReceiptIdentity(
      receipt.receiptId,
      receipt.receiptHash,
      "POPULATION_MIGRATION_RECEIPT_ID_INVALID"
    );
    id(receipt.householdId, "POPULATION_HOUSEHOLD_ID_INVALID");
    id(receipt.fromRegionId, "POPULATION_REGION_ID_INVALID");
    id(receipt.toRegionId, "POPULATION_REGION_ID_INVALID");
    if (
      receipt.fromRegionId === receipt.toRegionId ||
      receipt.resolutionIndex !== nextIndex
    )
      throw new Error("POPULATION_MIGRATION_INVALID");
    if (
      (receipt.direction === "out" &&
        receipt.fromRegionId !== state.regionId) ||
      (receipt.direction === "in" && receipt.toRegionId !== state.regionId)
    )
      throw new Error("POPULATION_MIGRATION_REGION_INVALID");
    if (receipt.direction === "out" && !known.has(receipt.personId))
      throw new Error("POPULATION_MIGRATION_OUT_NOT_ELIGIBLE");
    if (receipt.direction === "in" && known.has(receipt.personId))
      throw new Error("POPULATION_MIGRATION_IN_NOT_ELIGIBLE");
    if (receipt.direction === "in") known.add(receipt.personId);
    else known.delete(receipt.personId);
  }
  const lineage = [
    ...state.lineage,
    ...births.flatMap(birth =>
      birth.parentIds.map(parentId => ({
        parentId,
        childId: birth.childId,
        birthReceiptId: birth.receiptId,
      }))
    ),
  ];
  const householdMap = new Map(
    state.households.map(household => [
      household.householdId,
      { ...household, residentIds: [...household.residentIds] },
    ])
  );
  for (const birth of births)
    householdMap.get(birth.householdId)!.residentIds.push(birth.childId);
  for (const migration of migrationsOut) {
    const household = householdMap.get(migration.householdId);
    if (!household) throw new Error("POPULATION_MIGRATION_HOUSEHOLD_INVALID");
    household.residentIds = household.residentIds.filter(
      personId => personId !== migration.personId
    );
  }
  for (const migration of migrationsIn) {
    const household = householdMap.get(migration.householdId);
    if (!household || household.residentIds.length >= household.shelterCapacity)
      throw new Error("POPULATION_MIGRATION_SHELTER_INVALID");
    household.residentIds.push(migration.personId);
  }
  for (const death of deaths) {
    const household = householdMap
      .values()
      .find(value => value.residentIds.includes(death.personId));
    if (household)
      household.residentIds = household.residentIds.filter(
        personId => personId !== death.personId
      );
  }
  const nextState = createPopulationState({
    worldId: state.worldId,
    regionId: state.regionId,
    resolutionIndex: nextIndex,
    alivePersonIds: [...known],
    households: [...householdMap.values()],
    lineage,
  });
  const resolutionHash = canonicalSha256({
    protocol: AURION_POPULATION_DYNAMICS_PROTOCOL,
    worldId: state.worldId,
    regionId: state.regionId,
    previousStateHash: state.stateHash,
    resolutionIndex: nextIndex,
    births,
    deaths,
    migrationsIn,
    migrationsOut,
    nextStateHash: nextState.stateHash,
  });
  return Object.freeze({
    protocol: AURION_POPULATION_DYNAMICS_PROTOCOL,
    worldId: state.worldId,
    regionId: state.regionId,
    previousStateHash: state.stateHash,
    resolutionIndex: nextIndex,
    births: Object.freeze(births),
    deaths: Object.freeze(deaths),
    migrationsIn: Object.freeze(migrationsIn),
    migrationsOut: Object.freeze(migrationsOut),
    nextState,
    resolutionHash,
  });
}

export function populationBalance(
  input: Readonly<{
    population: number;
    births: number;
    migrationIn: number;
    deaths: number;
    migrationOut: number;
  }>
): number {
  const values = [
    input.population,
    input.births,
    input.migrationIn,
    input.deaths,
    input.migrationOut,
  ].map(value => index(value, "POPULATION_BALANCE_INVALID"));
  const result = values[0] + values[1] + values[2] - values[3] - values[4];
  if (result < 0 || result > MAX) throw new Error("POPULATION_BALANCE_INVALID");
  return result;
}

export function derivePopulationPressure(
  input: Readonly<{
    population: number;
    landCapacity: number;
    foodStock: number;
    foodPerPerson: number;
    shelterCapacity: number;
  }>
): PopulationPressure {
  const population = index(input.population, "POPULATION_COUNT_INVALID");
  const landCapacity = index(
    input.landCapacity,
    "POPULATION_LAND_CAPACITY_INVALID"
  );
  const foodStock = index(input.foodStock, "POPULATION_FOOD_STOCK_INVALID");
  const foodPerPerson = index(
    input.foodPerPerson,
    "POPULATION_FOOD_REQUIREMENT_INVALID"
  );
  const shelterCapacity = index(
    input.shelterCapacity,
    "POPULATION_SHELTER_CAPACITY_INVALID"
  );
  const requiredFoodExact = BigInt(population) * BigInt(foodPerPerson);
  const foodStockExact = BigInt(foodStock);
  const landNeedBps = floorBps(population, landCapacity);
  const foodShortageBps =
    requiredFoodExact > foodStockExact
      ? Math.min(
          BPS,
          Number(
            ((requiredFoodExact - foodStockExact) * 10_000n) / requiredFoodExact
          )
        )
      : 0;
  const housingNeedBps = floorBps(population, shelterCapacity);
  const migrationPressureBps = Math.max(
    landNeedBps,
    foodShortageBps,
    housingNeedBps
  );
  const landOverflowBps =
    population > landCapacity
      ? floorBps(population - landCapacity, Math.max(1, landCapacity))
      : 0;
  const shelterOverflowBps =
    population > shelterCapacity
      ? floorBps(population - shelterCapacity, Math.max(1, shelterCapacity))
      : 0;
  const newSettlementPressureBps = Math.max(
    landOverflowBps,
    shelterOverflowBps
  );
  const unsigned = {
    protocol: AURION_POPULATION_DYNAMICS_PROTOCOL,
    population,
    landNeedBps,
    foodShortageBps,
    housingNeedBps,
    migrationPressureBps,
    newSettlementPressureBps,
  };
  return Object.freeze({
    ...unsigned,
    pressureHash: canonicalSha256(unsigned),
  });
}
