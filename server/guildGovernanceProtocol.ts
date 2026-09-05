import { createHash } from "node:crypto";
import {
  AURION_GUILD_GOVERNANCE_CONTENT_VERSION,
  AURION_GUILD_GOVERNANCE_RULESET_VERSION,
  AURION_KINGDOM_MINIMUM_TERRITORIES,
  guildCapabilities,
  guildGovernanceOperations,
  type GuildCapability,
  type GuildCapabilityScopeKind,
  type GuildDiplomacyType,
  type GuildGovernanceOperation,
  type GuildGovernanceReceipt,
  type GuildMembershipRole,
  type GuildMutationPlan,
  type GuildTerritoryCoordinate,
} from "@shared/guildGovernanceContract";

const safeId = /^[a-z0-9][a-z0-9._:-]{0,95}$/;
const safeToken = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const kingdomNamePattern = /^[\p{L}\p{N}][\p{L}\p{N} .,'’&-]{1,63}$/u;
const exactPattern = /^(0|[1-9][0-9]*)$/;
const compareText = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

export function stableGuildStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableGuildStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${stableGuildStringify(record[key])}`).join(",")}}`;
}

export function guildGovernanceHash(value: unknown): string {
  return createHash("sha256").update(stableGuildStringify(value), "utf8").digest("hex");
}

function assertId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !safeId.test(value)) throw new Error(`${label} must be a canonical id`);
}
function assertToken(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || !safeToken.test(value)) throw new Error(`${label} must be a canonical token`);
}
function exactRevision(value: unknown, label: string): string {
  if (typeof value !== "string" || !exactPattern.test(value)) throw new Error(`${label} must be a canonical non-negative decimal`);
  return BigInt(value).toString(10);
}
function assertWhole(value: unknown, label: string): asserts value is number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
}
function rejectUnknownKeys(payload: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(payload)) if (!allowed.includes(key)) throw new Error(`client authority field rejected: ${key}`);
}
function freezeRecord(record: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze(record);
}

export const roleCapabilities: Readonly<Record<GuildMembershipRole, readonly GuildCapability[]>> = Object.freeze({
  founder: Object.freeze([...guildCapabilities] as GuildCapability[]),
  officer: Object.freeze(["member_manage", "diplomacy_manage", "territory_manage", "bank_deposit", "building_manage"] as GuildCapability[]),
  member: Object.freeze(["bank_deposit"] as GuildCapability[]),
  applicant: Object.freeze([] as GuildCapability[]),
});

export const operationCapability: Readonly<Record<GuildGovernanceOperation, GuildCapability>> = Object.freeze({
  grant_capability: "member_manage",
  claim_territory: "territory_manage",
  release_territory: "territory_manage",
  consolidate_kingdom: "kingdom_consolidate",
  set_diplomacy: "diplomacy_manage",
});

export function guildTerritoryId(worldId: string, chunkX: number, chunkZ: number): string {
  assertId(worldId, "worldId");
  assertWhole(chunkX, "chunkX");
  assertWhole(chunkZ, "chunkZ");
  if (Math.abs(chunkX) > 1_000_000 || Math.abs(chunkZ) > 1_000_000) throw new Error("territory coordinate out of range");
  return `${worldId}:${chunkX}:${chunkZ}`;
}

export function hasGuildCapability(input: Readonly<{
  role: GuildMembershipRole;
  required: GuildCapability;
  guildId: string;
  scopeKind: GuildCapabilityScopeKind;
  scopeId: string;
  explicit: readonly Readonly<{ capability: GuildCapability; scopeKind: GuildCapabilityScopeKind; scopeId: string; status: "active" | "revoked" }>[];
}>): boolean {
  const exactGrant = input.explicit.find(grant => grant.capability === input.required && grant.scopeKind === input.scopeKind && grant.scopeId === input.scopeId);
  const guildGrant = input.explicit.find(grant => grant.capability === input.required && grant.scopeKind === "guild" && grant.scopeId === input.guildId);
  if (exactGrant) return exactGrant.status === "active";
  if (guildGrant) return guildGrant.status === "active";
  return roleCapabilities[input.role].includes(input.required);
}

export function areGuildTerritoriesConnected(territories: readonly GuildTerritoryCoordinate[]): boolean {
  if (territories.length === 0) return false;
  const active = territories.filter(territory => territory.state === "active");
  if (active.length !== territories.length) return false;
  const worldId = active[0]!.worldId;
  if (active.some(territory => territory.worldId !== worldId)) return false;
  const byCoordinate = new Map(active.map(territory => [`${territory.chunkX}:${territory.chunkZ}`, territory] as const));
  if (byCoordinate.size !== active.length) return false;
  const pending = [active[0]!];
  const visited = new Set<string>();
  while (pending.length) {
    const current = pending.shift()!;
    const key = `${current.chunkX}:${current.chunkZ}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const neighbour = byCoordinate.get(`${current.chunkX + dx}:${current.chunkZ + dz}`);
      if (neighbour && !visited.has(`${neighbour.chunkX}:${neighbour.chunkZ}`)) pending.push(neighbour);
    }
  }
  return visited.size === active.length;
}

export function normalizeGuildGovernancePayload(operation: GuildGovernanceOperation, raw: unknown): Readonly<Record<string, unknown>> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("governance payload must be an object");
  const payload = raw as Record<string, unknown>;
  if (operation === "claim_territory") {
    rejectUnknownKeys(payload, ["worldId", "chunkX", "chunkZ", "territoryId"]);
    assertId(payload.worldId, "worldId"); assertWhole(payload.chunkX, "chunkX"); assertWhole(payload.chunkZ, "chunkZ");
    const territoryId = guildTerritoryId(payload.worldId, payload.chunkX, payload.chunkZ);
    if (payload.territoryId !== undefined && payload.territoryId !== territoryId) throw new Error("derived territoryId does not match canonical coordinates");
    return freezeRecord({ territoryId, worldId: payload.worldId, chunkX: payload.chunkX, chunkZ: payload.chunkZ });
  }
  if (operation === "release_territory") {
    rejectUnknownKeys(payload, ["territoryId"]); assertToken(payload.territoryId, "territoryId");
    return freezeRecord({ territoryId: payload.territoryId });
  }
  if (operation === "grant_capability") {
    rejectUnknownKeys(payload, ["targetUserId", "capability", "scopeKind", "scopeId", "grantStatus"]);
    assertWhole(payload.targetUserId, "targetUserId");
    if ((payload.targetUserId as number) <= 0) throw new Error("targetUserId must be positive");
    if (typeof payload.capability !== "string" || !(guildCapabilities as readonly string[]).includes(payload.capability)) throw new Error("unknown guild capability");
    if (typeof payload.scopeKind !== "string" || !["guild", "territory", "kingdom", "diplomacy", "bank", "building"].includes(payload.scopeKind)) throw new Error("unknown capability scope");
    assertToken(payload.scopeId, "scopeId");
    if (payload.grantStatus !== "active" && payload.grantStatus !== "revoked") throw new Error("grantStatus must be active or revoked");
    return freezeRecord({ targetUserId: payload.targetUserId, capability: payload.capability, scopeKind: payload.scopeKind, scopeId: payload.scopeId, grantStatus: payload.grantStatus });
  }
  if (operation === "set_diplomacy") {
    rejectUnknownKeys(payload, ["targetGuildId", "pactType", "pactStatus"]); assertId(payload.targetGuildId, "targetGuildId");
    if (typeof payload.pactType !== "string" || !["alliance", "trade", "non_aggression", "tribute", "sanction", "war"].includes(payload.pactType)) throw new Error("unknown diplomacy type");
    if (payload.pactStatus !== "active" && payload.pactStatus !== "ended") throw new Error("pactStatus must be active or ended");
    return freezeRecord({ targetGuildId: payload.targetGuildId, pactType: payload.pactType as GuildDiplomacyType, pactStatus: payload.pactStatus });
  }
  if (operation === "consolidate_kingdom") {
    rejectUnknownKeys(payload, ["kingdomName", "capitalTerritoryId", "territoryIds"]);
    if (typeof payload.kingdomName !== "string" || !kingdomNamePattern.test(payload.kingdomName.trim())) throw new Error("invalid kingdom name");
    assertToken(payload.capitalTerritoryId, "capitalTerritoryId");
    if (!Array.isArray(payload.territoryIds)) throw new Error("territoryIds must be an array");
    const territoryIds = payload.territoryIds.map((entry, index) => { assertToken(entry, `territoryIds[${index}]`); return entry; }).sort(compareText);
    if (new Set(territoryIds).size !== territoryIds.length) throw new Error("duplicate territories are not permitted");
    if (territoryIds.length < AURION_KINGDOM_MINIMUM_TERRITORIES) throw new Error(`kingdom requires at least ${AURION_KINGDOM_MINIMUM_TERRITORIES} territories`);
    if (!territoryIds.includes(payload.capitalTerritoryId)) throw new Error("capital must be one of the selected territories");
    return freezeRecord({ kingdomName: payload.kingdomName.trim(), capitalTerritoryId: payload.capitalTerritoryId, territoryIds: Object.freeze(territoryIds) });
  }
  throw new Error("unsupported governance operation");
}

export function governanceResources(operation: GuildGovernanceOperation, payload: Readonly<Record<string, unknown>>, guildId: string): readonly string[] {
  if (operation === "claim_territory" || operation === "release_territory") return Object.freeze([String(payload.territoryId)]);
  if (operation === "grant_capability") return Object.freeze([`user:${payload.targetUserId}`, `${payload.scopeKind}:${payload.scopeId}`, `capability:${payload.capability}`]);
  if (operation === "set_diplomacy") return Object.freeze([`guild:${payload.targetGuildId}`, `pact:${payload.pactType}`]);
  if (operation === "consolidate_kingdom") return Object.freeze([`guild:${guildId}`, `capital:${payload.capitalTerritoryId}`, ...((payload.territoryIds as readonly string[]).map(id => `territory:${id}`))].sort(compareText));
  return Object.freeze([]);
}

export function buildGuildMutationPlan(input: Readonly<{
  actorUserId: number;
  guildId: string;
  role: GuildMembershipRole;
  operation: GuildGovernanceOperation;
  expectedRevisionExact: string;
  idempotencyKey: string;
  payload: unknown;
}>): GuildMutationPlan {
  if (!Number.isSafeInteger(input.actorUserId) || input.actorUserId <= 0) throw new Error("actor must come from an authenticated Aurion session");
  assertId(input.guildId, "guildId"); assertToken(input.idempotencyKey, "idempotencyKey");
  if (!(guildGovernanceOperations as readonly string[]).includes(input.operation)) throw new Error("unsupported governance operation");
  const expectedRevisionExact = exactRevision(input.expectedRevisionExact, "expectedRevisionExact");
  const payload = normalizeGuildGovernancePayload(input.operation, input.payload);
  const resources = governanceResources(input.operation, payload, input.guildId);
  const payloadHash = guildGovernanceHash(payload);
  const unsigned = {
    schemaVersion: 1 as const,
    actorUserId: input.actorUserId,
    guildId: input.guildId,
    role: input.role,
    operation: input.operation,
    requiredCapability: operationCapability[input.operation],
    expectedRevisionExact,
    idempotencyKey: input.idempotencyKey,
    resources,
    payload,
    payloadHash,
    ruleSetVersion: AURION_GUILD_GOVERNANCE_RULESET_VERSION,
    contentVersion: AURION_GUILD_GOVERNANCE_CONTENT_VERSION,
  };
  return Object.freeze({ ...unsigned, confirmationHash: guildGovernanceHash(unsigned) });
}

export function validateKingdomConsolidation(input: Readonly<{
  guildId: string;
  plan: GuildMutationPlan;
  territories: readonly GuildTerritoryCoordinate[];
}>): Readonly<{ kingdomId: string; name: string; capitalTerritoryId: string; territoryIds: readonly string[]; territoryDigest: string }> {
  if (input.plan.operation !== "consolidate_kingdom" || input.plan.guildId !== input.guildId) throw new Error("kingdom plan mismatch");
  const requested = input.plan.payload.territoryIds as readonly string[];
  const territories = input.territories.slice().sort((left, right) => compareText(left.territoryId, right.territoryId));
  if (territories.length !== requested.length || territories.some((territory, index) => territory.territoryId !== requested[index])) throw new Error("territory readback does not match confirmed plan");
  if (territories.some(territory => territory.guildId !== input.guildId || territory.state !== "active")) throw new Error("all kingdom territories must be actively owned by the guild");
  if (!areGuildTerritoriesConnected(territories)) throw new Error("kingdom territories must be four-neighbour connected");
  const capital = String(input.plan.payload.capitalTerritoryId);
  if (!territories.some(territory => territory.territoryId === capital)) throw new Error("capital territory is not owned by the guild");
  const territoryIds = Object.freeze(territories.map(territory => territory.territoryId));
  const territoryDigest = guildGovernanceHash(territories.map(territory => [territory.territoryId, territory.worldId, territory.chunkX, territory.chunkZ, territory.guildId, territory.state]));
  return Object.freeze({
    kingdomId: `kingdom_${guildGovernanceHash([input.guildId, input.plan.confirmationHash, territoryDigest]).slice(0, 40)}`,
    name: String(input.plan.payload.kingdomName),
    capitalTerritoryId: capital,
    territoryIds,
    territoryDigest,
  });
}

export function buildGuildGovernanceReceipt(input: Readonly<{
  plan: GuildMutationPlan;
  resultingRevisionExact: string;
  result: Readonly<Record<string, unknown>>;
}>): GuildGovernanceReceipt {
  if (!digestPattern.test(input.plan.confirmationHash) || input.plan.payloadHash !== guildGovernanceHash(input.plan.payload)) throw new Error("governance plan digest mismatch");
  const resultingRevisionExact = exactRevision(input.resultingRevisionExact, "resultingRevisionExact");
  if (BigInt(resultingRevisionExact) !== BigInt(input.plan.expectedRevisionExact) + 1n) throw new Error("governance revision must advance exactly once");
  const requestHash = guildGovernanceHash(input.plan);
  const resultHash = guildGovernanceHash(input.result);
  return Object.freeze({
    receiptId: `ggr_${guildGovernanceHash([requestHash, resultHash, resultingRevisionExact]).slice(0, 48)}`,
    guildId: input.plan.guildId,
    actorUserId: input.plan.actorUserId,
    operation: input.plan.operation,
    expectedRevisionExact: input.plan.expectedRevisionExact,
    resultingRevisionExact,
    idempotencyKey: input.plan.idempotencyKey,
    confirmationHash: input.plan.confirmationHash,
    requestHash,
    resultHash,
    result: input.result,
    ruleSetVersion: AURION_GUILD_GOVERNANCE_RULESET_VERSION,
    contentVersion: AURION_GUILD_GOVERNANCE_CONTENT_VERSION,
  });
}

export function reconcileGuildGovernanceReplay(existing: GuildGovernanceReceipt, candidate: GuildGovernanceReceipt): Readonly<{ replay: true; receipt: GuildGovernanceReceipt }> {
  if (existing.idempotencyKey !== candidate.idempotencyKey || existing.confirmationHash !== candidate.confirmationHash || existing.requestHash !== candidate.requestHash || existing.resultHash !== candidate.resultHash || existing.receiptId !== candidate.receiptId) {
    throw new Error("GUILD_GOVERNANCE_IDEMPOTENCY_CONFLICT");
  }
  return Object.freeze({ replay: true, receipt: existing });
}
