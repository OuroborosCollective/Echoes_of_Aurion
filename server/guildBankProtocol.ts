import { createHash } from "node:crypto";
import {
  AURION_GUILD_BANK_CONTENT_VERSION,
  AURION_GUILD_BANK_RULESET_VERSION,
  guildBankOperations,
  type GuildBankBuildingProjection,
  type GuildBankGoal,
  type GuildBankOperation,
  type GuildBankPlan,
  type GuildBankReceipt,
  type GuildItemRecordVersion,
  type GuildResourceKey,
} from "@shared/guildBankContract";
import type { GuildCapability, GuildMembershipRole } from "@shared/guildGovernanceContract";

const safeId = /^[a-z0-9][a-z0-9._:-]{0,127}$/;
const safeToken = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const exactPattern = /^(0|[1-9][0-9]*)$/;
const digestPattern = /^[a-f0-9]{64}$/;
const MAX_PLAYER_POINTS_TRANSFER = 2_147_483_647n;

export type GuildBuildingDefinition = Readonly<{
  id: string;
  maximumLevelExact: string;
  baseCostExact: Readonly<{ points: string; wood: string; stone: string; aether: string }>;
  boundedMaxBonusesBps: Readonly<Record<string, number>>;
}>;

export const guildBuildingDefinitions: Readonly<Record<string, GuildBuildingDefinition>> = Object.freeze({
  bld_citadel: Object.freeze({ id: "bld_citadel", maximumLevelExact: "5", baseCostExact: Object.freeze({ points: "1200", wood: "250", stone: "300", aether: "100" }), boundedMaxBonusesBps: Object.freeze({ memberVitalityBps: 1500, treasurySecurityBps: 800 }) }),
  bld_turquoise_wall: Object.freeze({ id: "bld_turquoise_wall", maximumLevelExact: "5", baseCostExact: Object.freeze({ points: "1800", wood: "400", stone: "600", aether: "250" }), boundedMaxBonusesBps: Object.freeze({ territoryArmorBps: 1200, patrolCapacityBps: 1000 }) }),
  bld_grand_bazaar: Object.freeze({ id: "bld_grand_bazaar", maximumLevelExact: "5", baseCostExact: Object.freeze({ points: "1500", wood: "350", stone: "300", aether: "150" }), boundedMaxBonusesBps: Object.freeze({ vendorValueBps: 1500, foodLogisticsBps: 1000 }) }),
  bld_sovereign_academy: Object.freeze({ id: "bld_sovereign_academy", maximumLevelExact: "5", baseCostExact: Object.freeze({ points: "2200", wood: "500", stone: "450", aether: "350" }), boundedMaxBonusesBps: Object.freeze({ validatedMasteryXpBps: 1000, researchEfficiencyBps: 1200 }) }),
  bld_aether_wellspring: Object.freeze({ id: "bld_aether_wellspring", maximumLevelExact: "5", baseCostExact: Object.freeze({ points: "3000", wood: "600", stone: "700", aether: "500" }), boundedMaxBonusesBps: Object.freeze({ resourceRegenerationBps: 2000, territoryStabilityBps: 1500 }) }),
  bld_sovereign_auktionator: Object.freeze({ id: "bld_sovereign_auktionator", maximumLevelExact: "1", baseCostExact: Object.freeze({ points: "15000", wood: "200", stone: "180", aether: "100" }), boundedMaxBonusesBps: Object.freeze({ marketFeeDiscountBps: 500, tradeAccessBps: 1000 }) }),
});

const resourceItems: Readonly<Record<string, GuildResourceKey>> = Object.freeze({
  mat_wood_oak: "wood",
  mat_stone_sandstone: "stone",
  sandstone: "stone",
  mat_dust_aether: "aether",
  aether: "aether",
});

export const bankOperationCapability: Readonly<Record<GuildBankOperation, GuildCapability>> = Object.freeze({
  deposit_points: "bank_deposit",
  withdraw_points: "bank_withdraw",
  deposit_item: "bank_deposit",
  withdraw_item: "bank_withdraw",
  donate_resource_item: "bank_deposit",
  upgrade_building: "building_manage",
});

export function stableGuildBankStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableGuildBankStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableGuildBankStringify(record[key])}`).join(",")}}`;
}

export function guildBankHash(value: unknown): string {
  return createHash("sha256").update(stableGuildBankStringify(value), "utf8").digest("hex");
}

function exact(value: unknown, label: string, positive = false): bigint {
  if (typeof value !== "string" || !exactPattern.test(value)) throw new Error(`${label} must be a canonical non-negative decimal`);
  const parsed = BigInt(value);
  if (positive && parsed < 1n) throw new Error(`${label} must be positive`);
  return parsed;
}
function id(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !safeId.test(value)) throw new Error(`${label} must be a canonical id`);
}
function token(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !safeToken.test(value)) throw new Error(`${label} must be a canonical token`);
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("bank payload must be an object");
  return value as Record<string, unknown>;
}
function rejectUnknown(payload: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(payload)) if (!allowed.includes(key)) throw new Error(`client authority field rejected: ${key}`);
}
function itemVersion(value: unknown): GuildItemRecordVersion {
  if (value !== "legacy" && value !== "aurion_v2") throw new Error("unknown item record version");
  return value;
}
function resourceKey(value: unknown): GuildResourceKey {
  if (value !== "wood" && value !== "stone" && value !== "aether") throw new Error("unknown guild resource key");
  return value;
}

export function resourceForItemDefinition(itemDefinitionId: string): GuildResourceKey | null {
  return resourceItems[itemDefinitionId] ?? null;
}

export function normalizeGuildBankPayload(operation: GuildBankOperation, raw: unknown): Readonly<Record<string, unknown>> {
  const payload = record(raw);
  if (operation === "deposit_points" || operation === "withdraw_points") {
    rejectUnknown(payload, ["amountExact"]);
    const amount = exact(payload.amountExact, "amountExact", true);
    if (amount > MAX_PLAYER_POINTS_TRANSFER) throw new Error("amount exceeds current Aurion player-wallet integer range");
    return Object.freeze({ amountExact: amount.toString(10) });
  }
  if (operation === "deposit_item" || operation === "withdraw_item") {
    rejectUnknown(payload, ["itemRecordVersion", "itemId"]);
    const version = itemVersion(payload.itemRecordVersion);
    token(payload.itemId, "itemId");
    return Object.freeze({ itemRecordVersion: version, itemId: payload.itemId });
  }
  if (operation === "donate_resource_item") {
    rejectUnknown(payload, ["itemRecordVersion", "itemId", "expectedResourceKey"]);
    const version = itemVersion(payload.itemRecordVersion);
    token(payload.itemId, "itemId");
    return Object.freeze({ itemRecordVersion: version, itemId: payload.itemId, expectedResourceKey: resourceKey(payload.expectedResourceKey) });
  }
  if (operation === "upgrade_building") {
    rejectUnknown(payload, ["buildingId", "expectedLevelExact"]);
    id(payload.buildingId, "buildingId");
    if (!guildBuildingDefinitions[payload.buildingId]) throw new Error("unknown guild building");
    const expectedLevel = exact(payload.expectedLevelExact, "expectedLevelExact");
    return Object.freeze({ buildingId: payload.buildingId, expectedLevelExact: expectedLevel.toString(10) });
  }
  throw new Error("unsupported guild bank operation");
}

export function guildBankResources(operation: GuildBankOperation, payload: Readonly<Record<string, unknown>>, actorUserId: number, guildId: string): readonly string[] {
  if (operation === "deposit_points" || operation === "withdraw_points") return Object.freeze([`player-wallet:${actorUserId}`, `guild-treasury:${guildId}`]);
  if (operation === "deposit_item" || operation === "withdraw_item") return Object.freeze([`item:${payload.itemRecordVersion}:${payload.itemId}`, `guild-custody:${guildId}`]);
  if (operation === "donate_resource_item") return Object.freeze([`item:${payload.itemRecordVersion}:${payload.itemId}`, `guild-resource:${guildId}:${payload.expectedResourceKey}`]);
  const buildingId = String(payload.buildingId);
  return Object.freeze([`guild-building:${guildId}:${buildingId}`, `guild-treasury:${guildId}`, ...(["wood", "stone", "aether"] as const).map(key => `guild-resource:${guildId}:${key}`)]);
}

export function buildGuildBankPlan(input: Readonly<{
  actorUserId: number;
  guildId: string;
  role: GuildMembershipRole;
  operation: GuildBankOperation;
  expectedRevisionExact: string;
  idempotencyKey: string;
  payload: unknown;
}>): GuildBankPlan {
  if (!Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) throw new Error("actor must come from an authenticated Aurion session");
  id(input.guildId, "guildId"); token(input.idempotencyKey, "idempotencyKey");
  if (!(guildBankOperations as readonly string[]).includes(input.operation)) throw new Error("unsupported guild bank operation");
  const expectedRevisionExact = exact(input.expectedRevisionExact, "expectedRevisionExact").toString(10);
  const payload = normalizeGuildBankPayload(input.operation, input.payload);
  const payloadHash = guildBankHash(payload);
  const unsigned = {
    schemaVersion: 1 as const,
    actorUserId: input.actorUserId,
    guildId: input.guildId,
    role: input.role,
    operation: input.operation,
    requiredCapability: bankOperationCapability[input.operation],
    expectedRevisionExact,
    idempotencyKey: input.idempotencyKey,
    resources: guildBankResources(input.operation, payload, input.actorUserId, input.guildId),
    payload,
    payloadHash,
    ruleSetVersion: AURION_GUILD_BANK_RULESET_VERSION,
    contentVersion: AURION_GUILD_BANK_CONTENT_VERSION,
  };
  return Object.freeze({ ...unsigned, confirmationHash: guildBankHash(unsigned) });
}

export type GuildBuildingUpgrade = Readonly<{
  buildingId: string;
  previousLevelExact: string;
  resultingLevelExact: string;
  maximumLevelExact: string;
  costExact: Readonly<{ points: string; wood: string; stone: string; aether: string }>;
  projection: GuildBankBuildingProjection;
}>;

export function resolveGuildBuildingProjection(buildingId: string, levelExact: string): GuildBankBuildingProjection {
  const definition = guildBuildingDefinitions[buildingId];
  if (!definition) throw new Error("unknown guild building");
  const level = exact(levelExact, "levelExact");
  const maximum = BigInt(definition.maximumLevelExact);
  if (level > maximum) throw new Error("guild building level exceeds content maximum");
  const bonusesBps = Object.freeze(Object.fromEntries(Object.entries(definition.boundedMaxBonusesBps).map(([key, maximumBps]) => [key, Number(BigInt(maximumBps) * level / maximum)])));
  return Object.freeze({ buildingId, levelExact: level.toString(10), maximumLevelExact: maximum.toString(10), bonusesBps });
}

export function resolveGuildBuildingUpgrade(buildingId: string, expectedLevelExact: string): GuildBuildingUpgrade {
  const definition = guildBuildingDefinitions[buildingId];
  if (!definition) throw new Error("unknown guild building");
  const current = exact(expectedLevelExact, "expectedLevelExact");
  const maximum = BigInt(definition.maximumLevelExact);
  if (current >= maximum) throw new Error("guild building is already at maximum level");
  const next = current + 1n;
  const costExact = Object.freeze(Object.fromEntries(Object.entries(definition.baseCostExact).map(([key, value]) => [key, (BigInt(value) * next).toString(10)])) as { points: string; wood: string; stone: string; aether: string });
  return Object.freeze({ buildingId, previousLevelExact: current.toString(10), resultingLevelExact: next.toString(10), maximumLevelExact: maximum.toString(10), costExact, projection: resolveGuildBuildingProjection(buildingId, next.toString(10)) });
}

export function buildGuildBankReceipt(input: Readonly<{ plan: GuildBankPlan; resultingRevisionExact: string; result: Readonly<Record<string, unknown>> }>): GuildBankReceipt {
  if (!digestPattern.test(input.plan.confirmationHash) || guildBankHash(input.plan.payload) !== input.plan.payloadHash) throw new Error("guild bank plan digest mismatch");
  const resulting = exact(input.resultingRevisionExact, "resultingRevisionExact");
  if (resulting !== BigInt(input.plan.expectedRevisionExact) + 1n) throw new Error("guild bank revision must advance exactly once");
  const requestHash = guildBankHash(input.plan);
  const resultHash = guildBankHash(input.result);
  return Object.freeze({
    receiptId: `gbr_${guildBankHash([requestHash, resultHash, resulting.toString(10)]).slice(0, 48)}`,
    guildId: input.plan.guildId,
    actorUserId: input.plan.actorUserId,
    operation: input.plan.operation,
    expectedRevisionExact: input.plan.expectedRevisionExact,
    resultingRevisionExact: resulting.toString(10),
    idempotencyKey: input.plan.idempotencyKey,
    confirmationHash: input.plan.confirmationHash,
    requestHash,
    resultHash,
    result: input.result,
    ruleSetVersion: AURION_GUILD_BANK_RULESET_VERSION,
    contentVersion: AURION_GUILD_BANK_CONTENT_VERSION,
  });
}

export function reconcileGuildBankReplay(existing: GuildBankReceipt, candidate: GuildBankReceipt): Readonly<{ replay: true; receipt: GuildBankReceipt }> {
  if (existing.idempotencyKey !== candidate.idempotencyKey || existing.confirmationHash !== candidate.confirmationHash || existing.requestHash !== candidate.requestHash || existing.resultHash !== candidate.resultHash || existing.receiptId !== candidate.receiptId) throw new Error("GUILD_BANK_IDEMPOTENCY_CONFLICT");
  return Object.freeze({ replay: true, receipt: existing });
}

export function deriveGuildBankGoals(input: Readonly<{ treasuryBalanceExact: string; activeTerritoriesExact: string; heldItemsExact: string; totalBuildingLevelsExact: string }>): readonly GuildBankGoal[] {
  const definitions = [
    ["treasury_foundation", exact(input.treasuryBalanceExact, "treasuryBalanceExact"), 10_000n],
    ["territory_union", exact(input.activeTerritoriesExact, "activeTerritoriesExact"), 6n],
    ["bank_stewardship", exact(input.heldItemsExact, "heldItemsExact"), 5n],
    ["construction_foundation", exact(input.totalBuildingLevelsExact, "totalBuildingLevelsExact"), 3n],
  ] as const;
  return Object.freeze(definitions.map(([id, current, target]) => Object.freeze({ id, currentExact: current.toString(10), targetExact: target.toString(10), complete: current >= target })));
}
