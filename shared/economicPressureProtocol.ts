import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_ECONOMIC_PRESSURE_PROTOCOL =
  "aurion.economic-pressure.v1" as const;
export const ECONOMIC_BPS_MAX = 10_000;
export const ECONOMIC_MAX_QUANTITY = 1_000_000;

export const economicCommodityIds = [
  "grain",
  "sandstone",
  "bronze",
  "aether",
  "salve",
  "rune_core",
] as const;
export type EconomicCommodityId = (typeof economicCommodityIds)[number];
export type EconomicAction =
  | "produce"
  | "consume"
  | "trade"
  | "caravan"
  | "migrate";

export type EconomicStock = Readonly<Record<EconomicCommodityId, number>>;
export type EconomicDemand = Readonly<Record<EconomicCommodityId, number>>;

export interface EconomicRoute {
  readonly routeId: string;
  readonly fromRegionId: string;
  readonly toRegionId: string;
  readonly baseSecurityBps: number;
  readonly distanceUnits: number;
}

export interface EconomicPressureState {
  readonly protocol: typeof AURION_ECONOMIC_PRESSURE_PROTOCOL;
  readonly worldId: string;
  readonly regionId: string;
  readonly resolutionIndex: number;
  readonly revision: number;
  readonly stock: EconomicStock;
  readonly demand: EconomicDemand;
  readonly stateHash: string;
}

export interface EconomicSourceReceipt {
  readonly receiptId: string;
  readonly receiptHash: string;
}

export interface EconomicSupplyReceipt extends EconomicSourceReceipt {
  readonly commodity: EconomicCommodityId;
  readonly quantity: number;
}

export interface EconomicConsumptionReceipt extends EconomicSourceReceipt {
  readonly commodity: EconomicCommodityId;
  readonly quantity: number;
}

export interface EconomicDemandReceipt extends EconomicSourceReceipt {
  readonly commodity: EconomicCommodityId;
  readonly quantity: number;
}

export interface EconomicTradeReceipt extends EconomicSourceReceipt {
  readonly commodity: EconomicCommodityId;
  readonly quantity: number;
  readonly unitPriceCopper: number;
  readonly buyerAccountId: string;
  readonly sellerAccountId: string;
}

export interface EconomicActionCandidate {
  readonly candidateId: string;
  readonly action: EconomicAction;
  readonly commodity: EconomicCommodityId;
  readonly quantity: number;
  readonly sourceReceiptIds: readonly string[];
  readonly routeId: string | null;
  readonly priorityBps: number;
}

export interface EconomicPressureResolution {
  readonly protocol: typeof AURION_ECONOMIC_PRESSURE_PROTOCOL;
  readonly previousStateHash: string;
  readonly inputHash: string;
  readonly pricesCopper: Readonly<Record<EconomicCommodityId, number>>;
  readonly scarcityBps: Readonly<Record<EconomicCommodityId, number>>;
  readonly shortages: readonly EconomicCommodityId[];
  readonly routeSecurityBps: readonly Readonly<{
    routeId: string;
    securityBps: number;
  }>[];
  readonly candidates: readonly EconomicActionCandidate[];
  readonly resolutionHash: string;
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const HASH = /^sha256:[a-f0-9]{64}$/;
const ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const BASE_PRICES: Readonly<Record<EconomicCommodityId, number>> =
  Object.freeze({
    grain: 100,
    sandstone: 70,
    bronze: 180,
    aether: 450,
    salve: 260,
    rune_core: 900,
  });

function fail(code: string): never {
  throw new Error(code);
}
function integer(
  value: unknown,
  min: number,
  max: number,
  code: string
): number {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  )
    fail(code);
  return value as number;
}
function id(value: unknown, code: string): string {
  if (typeof value !== "string" || !ID.test(value)) fail(code);
  return value;
}
function hash(value: unknown, code: string): string {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}
function commodity(value: unknown): EconomicCommodityId {
  if (
    typeof value !== "string" ||
    !economicCommodityIds.includes(value as EconomicCommodityId)
  )
    fail("ECONOMIC_COMMODITY_INVALID");
  return value as EconomicCommodityId;
}
function boundedBps(value: unknown, code: string): number {
  return integer(value, 0, ECONOMIC_BPS_MAX, code);
}
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
function ceilDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator + denominator - 1) / denominator);
}
function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function freezeRecord(
  values: Record<EconomicCommodityId, number>
): EconomicStock {
  return Object.freeze({ ...values });
}
function emptyCommodityRecord(): Record<EconomicCommodityId, number> {
  return {
    grain: 0,
    sandstone: 0,
    bronze: 0,
    aether: 0,
    salve: 0,
    rune_core: 0,
  };
}
function sortedUniqueReceipts<T extends EconomicSourceReceipt>(
  values: readonly T[],
  label: string
): readonly T[] {
  const normalized = values
    .map(value => {
      const receiptId = id(value.receiptId, `${label}_RECEIPT_ID_INVALID`);
      const receiptHash = hash(
        value.receiptHash,
        `${label}_RECEIPT_HASH_INVALID`
      );
      return Object.freeze({ ...value, receiptId, receiptHash });
    })
    .sort((left, right) => compare(left.receiptId, right.receiptId));
  if (
    new Set(normalized.map(value => value.receiptId)).size !== normalized.length
  )
    fail(`${label}_RECEIPT_DUPLICATE`);
  return Object.freeze(normalized);
}
function parseQuantity(value: unknown, code: string): number {
  return integer(value, 1, ECONOMIC_MAX_QUANTITY, code);
}
function parseState(state: EconomicPressureState): EconomicPressureState {
  if (state.protocol !== AURION_ECONOMIC_PRESSURE_PROTOCOL)
    fail("ECONOMIC_PROTOCOL_INVALID");
  const worldId = id(state.worldId, "ECONOMIC_WORLD_ID_INVALID");
  const regionId = id(state.regionId, "ECONOMIC_REGION_ID_INVALID");
  const resolutionIndex = integer(
    state.resolutionIndex,
    0,
    2_147_483_647,
    "ECONOMIC_RESOLUTION_INVALID"
  );
  const revision = integer(
    state.revision,
    0,
    2_147_483_647,
    "ECONOMIC_REVISION_INVALID"
  );
  const stock = emptyCommodityRecord();
  const demand = emptyCommodityRecord();
  for (const item of economicCommodityIds) {
    stock[item] = integer(
      state.stock[item],
      0,
      ECONOMIC_MAX_QUANTITY,
      "ECONOMIC_STOCK_INVALID"
    );
    demand[item] = integer(
      state.demand[item],
      0,
      ECONOMIC_MAX_QUANTITY,
      "ECONOMIC_DEMAND_INVALID"
    );
  }
  const envelope = {
    protocol: AURION_ECONOMIC_PRESSURE_PROTOCOL,
    worldId,
    regionId,
    resolutionIndex,
    revision,
    stock: freezeRecord(stock),
    demand: freezeRecord(demand),
  };
  if (state.stateHash !== canonicalSha256(envelope))
    fail("ECONOMIC_STATE_HASH_MISMATCH");
  return Object.freeze({ ...envelope, stateHash: state.stateHash });
}
function parseRoute(route: EconomicRoute): EconomicRoute {
  return Object.freeze({
    routeId: id(route.routeId, "ECONOMIC_ROUTE_ID_INVALID"),
    fromRegionId: id(route.fromRegionId, "ECONOMIC_ROUTE_FROM_INVALID"),
    toRegionId: id(route.toRegionId, "ECONOMIC_ROUTE_TO_INVALID"),
    baseSecurityBps: boundedBps(
      route.baseSecurityBps,
      "ECONOMIC_ROUTE_SECURITY_INVALID"
    ),
    distanceUnits: integer(
      route.distanceUnits,
      1,
      ECONOMIC_MAX_QUANTITY,
      "ECONOMIC_ROUTE_DISTANCE_INVALID"
    ),
  });
}
function parseSupply(
  values: readonly EconomicSupplyReceipt[]
): readonly EconomicSupplyReceipt[] {
  return sortedUniqueReceipts(values, "ECONOMIC_SUPPLY").map(value =>
    Object.freeze({
      ...value,
      commodity: commodity(value.commodity),
      quantity: parseQuantity(
        value.quantity,
        "ECONOMIC_SUPPLY_QUANTITY_INVALID"
      ),
    })
  );
}
function parseConsumption(
  values: readonly EconomicConsumptionReceipt[]
): readonly EconomicConsumptionReceipt[] {
  return sortedUniqueReceipts(values, "ECONOMIC_CONSUMPTION").map(value =>
    Object.freeze({
      ...value,
      commodity: commodity(value.commodity),
      quantity: parseQuantity(
        value.quantity,
        "ECONOMIC_CONSUMPTION_QUANTITY_INVALID"
      ),
    })
  );
}
function parseDemand(
  values: readonly EconomicDemandReceipt[]
): readonly EconomicDemandReceipt[] {
  return sortedUniqueReceipts(values, "ECONOMIC_DEMAND").map(value =>
    Object.freeze({
      ...value,
      commodity: commodity(value.commodity),
      quantity: parseQuantity(
        value.quantity,
        "ECONOMIC_DEMAND_QUANTITY_INVALID"
      ),
    })
  );
}
function parseTrades(
  values: readonly EconomicTradeReceipt[]
): readonly EconomicTradeReceipt[] {
  return sortedUniqueReceipts(values, "ECONOMIC_TRADE")
    .map(value =>
      Object.freeze({
        ...value,
        commodity: commodity(value.commodity),
        quantity: parseQuantity(
          value.quantity,
          "ECONOMIC_TRADE_QUANTITY_INVALID"
        ),
        unitPriceCopper: integer(
          value.unitPriceCopper,
          1,
          Number.MAX_SAFE_INTEGER,
          "ECONOMIC_TRADE_PRICE_INVALID"
        ),
        buyerAccountId: id(
          value.buyerAccountId,
          "ECONOMIC_TRADE_BUYER_INVALID"
        ),
        sellerAccountId: id(
          value.sellerAccountId,
          "ECONOMIC_TRADE_SELLER_INVALID"
        ),
      })
    )
    .map(value => {
      if (value.buyerAccountId === value.sellerAccountId)
        fail("ECONOMIC_TRADE_SELF_TRANSFER");
      return value;
    });
}

/** Exact integer scarcity: demand/stock, with zero stock treated as one unit. */
export function economicScarcityBps(stock: number, demand: number): number {
  return clamp(
    Math.floor(
      (integer(demand, 0, ECONOMIC_MAX_QUANTITY, "ECONOMIC_DEMAND_INVALID") *
        ECONOMIC_BPS_MAX) /
        Math.max(
          1,
          integer(stock, 0, ECONOMIC_MAX_QUANTITY, "ECONOMIC_STOCK_INVALID")
        )
    ),
    0,
    30_000
  );
}

/** Deterministic copper price; no floating point, time, random, or hidden balancing input. */
export function economicPriceCopper(
  input: Readonly<{
    commodity: EconomicCommodityId;
    stock: number;
    demand: number;
    taxBps: number;
  }>
): number {
  const item = commodity(input.commodity);
  const stock = integer(
    input.stock,
    0,
    ECONOMIC_MAX_QUANTITY,
    "ECONOMIC_STOCK_INVALID"
  );
  const demand = integer(
    input.demand,
    0,
    ECONOMIC_MAX_QUANTITY,
    "ECONOMIC_DEMAND_INVALID"
  );
  const taxBps = boundedBps(input.taxBps, "ECONOMIC_TAX_INVALID");
  return Math.max(
    1,
    ceilDiv(
      BASE_PRICES[item] *
        (ECONOMIC_BPS_MAX + economicScarcityBps(stock, demand) + taxBps),
      ECONOMIC_BPS_MAX
    )
  );
}

/** Fixed-point route security; route effects remain proposals until a receipt/readback exists. */
export function economicRouteSecurityBps(
  input: Readonly<{
    baseSecurityBps: number;
    polityStabilityBps: number;
    rememberedThreatBps: number;
  }>
): number {
  return clamp(
    integer(
      input.baseSecurityBps,
      0,
      ECONOMIC_BPS_MAX,
      "ECONOMIC_ROUTE_SECURITY_INVALID"
    ) +
      Math.floor(
        (boundedBps(input.polityStabilityBps, "ECONOMIC_POLITY_INVALID") * 15) /
          100
      ) -
      Math.floor(
        (boundedBps(input.rememberedThreatBps, "ECONOMIC_THREAT_INVALID") *
          35) /
          100
      ),
    500,
    ECONOMIC_BPS_MAX
  );
}

export function economicTransactionIdentity(
  input: Readonly<{
    action: EconomicAction;
    commodity: EconomicCommodityId;
    quantity: number;
    routeId?: string | null;
    sourceReceiptIds: readonly string[];
  }>
): string {
  if (
    !["produce", "consume", "trade", "caravan", "migrate"].includes(
      input.action
    )
  )
    fail("ECONOMIC_ACTION_INVALID");
  const normalizedSources = [
    ...new Set(
      input.sourceReceiptIds.map(value =>
        id(value, "ECONOMIC_SOURCE_RECEIPT_ID_INVALID")
      )
    ),
  ].sort(compare);
  if (normalizedSources.length === 0) fail("ECONOMIC_SOURCE_RECEIPT_REQUIRED");
  return canonicalSha256({
    domain: "aurion.economic.transaction.v1",
    action: input.action,
    commodity: commodity(input.commodity),
    quantity: parseQuantity(input.quantity, "ECONOMIC_QUANTITY_INVALID"),
    routeId:
      input.routeId === null || input.routeId === undefined
        ? null
        : id(input.routeId, "ECONOMIC_ROUTE_ID_INVALID"),
    sourceReceiptIds: normalizedSources,
  });
}

export function createEconomicPressureState(
  input: Readonly<Omit<EconomicPressureState, "protocol" | "stateHash">>
): EconomicPressureState {
  const worldId = id(input.worldId, "ECONOMIC_WORLD_ID_INVALID");
  const regionId = id(input.regionId, "ECONOMIC_REGION_ID_INVALID");
  const resolutionIndex = integer(
    input.resolutionIndex,
    0,
    2_147_483_647,
    "ECONOMIC_RESOLUTION_INVALID"
  );
  const revision = integer(
    input.revision,
    0,
    2_147_483_647,
    "ECONOMIC_REVISION_INVALID"
  );
  const stock = emptyCommodityRecord();
  const demand = emptyCommodityRecord();
  for (const item of economicCommodityIds) {
    stock[item] = integer(
      input.stock[item],
      0,
      ECONOMIC_MAX_QUANTITY,
      "ECONOMIC_STOCK_INVALID"
    );
    demand[item] = integer(
      input.demand[item],
      0,
      ECONOMIC_MAX_QUANTITY,
      "ECONOMIC_DEMAND_INVALID"
    );
  }
  const envelope = {
    protocol: AURION_ECONOMIC_PRESSURE_PROTOCOL,
    worldId,
    regionId,
    resolutionIndex,
    revision,
    stock: freezeRecord(stock),
    demand: freezeRecord(demand),
  };
  return Object.freeze({ ...envelope, stateHash: canonicalSha256(envelope) });
}

export function resolveEconomicPressure(
  input: Readonly<{
    state: EconomicPressureState;
    taxBps: number;
    polityStabilityBps: number;
    rememberedThreatBps: number;
    routes: readonly EconomicRoute[];
    demandReceipts: readonly EconomicDemandReceipt[];
    supplyReceipts: readonly EconomicSupplyReceipt[];
    consumptionReceipts: readonly EconomicConsumptionReceipt[];
    tradeReceipts: readonly EconomicTradeReceipt[];
  }>
): EconomicPressureResolution {
  const state = parseState(input.state);
  const taxBps = boundedBps(input.taxBps, "ECONOMIC_TAX_INVALID");
  const demandReceipts = parseDemand(input.demandReceipts);
  const supplyReceipts = parseSupply(input.supplyReceipts);
  const consumptionReceipts = parseConsumption(input.consumptionReceipts);
  const tradeReceipts = parseTrades(input.tradeReceipts);
  const routes = input.routes
    .map(parseRoute)
    .sort((left, right) => compare(left.routeId, right.routeId));
  if (new Set(routes.map(route => route.routeId)).size !== routes.length)
    fail("ECONOMIC_ROUTE_DUPLICATE");
  const demand = { ...state.demand };
  for (const receipt of demandReceipts)
    demand[receipt.commodity] = Math.min(
      ECONOMIC_MAX_QUANTITY,
      demand[receipt.commodity] + receipt.quantity
    );
  const stock = { ...state.stock };
  for (const receipt of supplyReceipts)
    stock[receipt.commodity] = Math.min(
      ECONOMIC_MAX_QUANTITY,
      stock[receipt.commodity] + receipt.quantity
    );
  for (const receipt of consumptionReceipts) {
    if (receipt.quantity > stock[receipt.commodity])
      fail("ECONOMIC_CONSUMPTION_STOCK_MISMATCH");
    stock[receipt.commodity] -= receipt.quantity;
  }
  for (const receipt of tradeReceipts) {
    if (receipt.quantity > stock[receipt.commodity])
      fail("ECONOMIC_TRADE_STOCK_MISMATCH");
    stock[receipt.commodity] -= receipt.quantity;
  }
  const prices = emptyCommodityRecord();
  const scarcity = emptyCommodityRecord();
  for (const item of economicCommodityIds) {
    prices[item] = economicPriceCopper({
      commodity: item,
      stock: stock[item],
      demand: demand[item],
      taxBps,
    });
    scarcity[item] = economicScarcityBps(stock[item], demand[item]);
  }
  const shortages = Object.freeze(
    economicCommodityIds.filter(item => demand[item] > stock[item])
  );
  const routeSecurityBps = Object.freeze(
    routes.map(route =>
      Object.freeze({
        routeId: route.routeId,
        securityBps: economicRouteSecurityBps({
          baseSecurityBps: route.baseSecurityBps,
          polityStabilityBps: input.polityStabilityBps,
          rememberedThreatBps: input.rememberedThreatBps,
        }),
      })
    )
  );
  const candidates: EconomicActionCandidate[] = [];
  for (const item of shortages) {
    const quantity = Math.min(
      ECONOMIC_MAX_QUANTITY,
      demand[item] - stock[item]
    );
    const sourceReceiptIds = Object.freeze(
      [
        ...demandReceipts
          .filter(receipt => receipt.commodity === item)
          .map(receipt => receipt.receiptId),
        ...supplyReceipts
          .filter(receipt => receipt.commodity === item)
          .map(receipt => receipt.receiptId),
      ].sort(compare)
    );
    candidates.push(
      Object.freeze({
        candidateId: economicTransactionIdentity({
          action: "produce",
          commodity: item,
          quantity,
          sourceReceiptIds,
        }),
        action: "produce",
        commodity: item,
        quantity,
        sourceReceiptIds,
        routeId: null,
        priorityBps: Math.min(ECONOMIC_BPS_MAX, scarcity[item]),
      })
    );
    const route = routes.find(
      value =>
        value.fromRegionId === state.regionId &&
        value.toRegionId !== state.regionId
    );
    if (route)
      candidates.push(
        Object.freeze({
          candidateId: economicTransactionIdentity({
            action: "caravan",
            commodity: item,
            quantity,
            routeId: route.routeId,
            sourceReceiptIds,
          }),
          action: "caravan",
          commodity: item,
          quantity,
          sourceReceiptIds,
          routeId: route.routeId,
          priorityBps: Math.min(
            ECONOMIC_BPS_MAX,
            scarcity[item] +
              (ECONOMIC_BPS_MAX -
                (routeSecurityBps.find(value => value.routeId === route.routeId)
                  ?.securityBps ?? 0)) /
                2
          ),
        })
      );
  }
  candidates.sort(
    (left, right) =>
      right.priorityBps - left.priorityBps ||
      compare(left.candidateId, right.candidateId)
  );
  const normalizedInput = {
    previousStateHash: state.stateHash,
    taxBps,
    polityStabilityBps: input.polityStabilityBps,
    rememberedThreatBps: input.rememberedThreatBps,
    routes,
    demandReceipts,
    supplyReceipts,
    consumptionReceipts,
    tradeReceipts,
  };
  const inputHash = canonicalSha256(normalizedInput);
  return Object.freeze({
    protocol: AURION_ECONOMIC_PRESSURE_PROTOCOL,
    previousStateHash: state.stateHash,
    inputHash,
    pricesCopper: freezeRecord(prices),
    scarcityBps: freezeRecord(scarcity),
    shortages,
    routeSecurityBps,
    candidates: Object.freeze(candidates),
    resolutionHash: canonicalSha256({
      protocol: AURION_ECONOMIC_PRESSURE_PROTOCOL,
      previousStateHash: state.stateHash,
      inputHash,
      pricesCopper: freezeRecord(prices),
      scarcityBps: freezeRecord(scarcity),
      shortages,
      routeSecurityBps,
      candidates,
    }),
  });
}

/** Applies only confirmed, receipt-backed effects and returns the next hash-bound state. */
export function applyConfirmedEconomicTransition(
  input: Readonly<{
    state: EconomicPressureState;
    nextResolutionIndex: number;
    supplyReceipts: readonly EconomicSupplyReceipt[];
    consumptionReceipts: readonly EconomicConsumptionReceipt[];
    demandReceipts: readonly EconomicDemandReceipt[];
  }>
): EconomicPressureState {
  const state = parseState(input.state);
  const nextResolutionIndex = integer(
    input.nextResolutionIndex,
    0,
    2_147_483_647,
    "ECONOMIC_RESOLUTION_INVALID"
  );
  if (nextResolutionIndex !== state.resolutionIndex + 1)
    fail("ECONOMIC_RESOLUTION_NOT_NEXT");
  const supply = parseSupply(input.supplyReceipts),
    consumption = parseConsumption(input.consumptionReceipts),
    demandReceipts = parseDemand(input.demandReceipts);
  const stock = { ...state.stock },
    demand = { ...state.demand };
  for (const receipt of supply)
    stock[receipt.commodity] =
      stock[receipt.commodity] + receipt.quantity > ECONOMIC_MAX_QUANTITY
        ? fail("ECONOMIC_STOCK_OVERFLOW")
        : stock[receipt.commodity] + receipt.quantity;
  for (const receipt of consumption)
    stock[receipt.commodity] =
      receipt.quantity > stock[receipt.commodity]
        ? fail("ECONOMIC_INSUFFICIENT_STOCK")
        : stock[receipt.commodity] - receipt.quantity;
  for (const receipt of demandReceipts)
    demand[receipt.commodity] = Math.min(
      ECONOMIC_MAX_QUANTITY,
      demand[receipt.commodity] + receipt.quantity
    );
  return createEconomicPressureState({
    worldId: state.worldId,
    regionId: state.regionId,
    resolutionIndex: nextResolutionIndex,
    revision: state.revision + 1,
    stock,
    demand,
  });
}
