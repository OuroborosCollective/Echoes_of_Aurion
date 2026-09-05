import { deadlineAfter, hostOperationalClock, operationalNow, type OperationalClock } from "../shared/operationalClock";
import type { GuildBankView } from "@shared/guildBankView";
import { createPool, type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import {
  AURION_GUILD_BANK_CONTENT_VERSION,
  AURION_GUILD_BANK_RULESET_VERSION,
  guildBankOperations,
  type GuildBankOperation,
  type GuildBankPlan,
  type GuildBankReceipt,
  type GuildItemRecordVersion,
  type GuildResourceKey,
} from "@shared/guildBankContract";
import type { GuildCapability, GuildCapabilityScopeKind, GuildMembershipRole } from "@shared/guildGovernanceContract";
import {
  bankOperationCapability,
  guildBuildingDefinitions,
  buildGuildBankPlan,
  buildGuildBankReceipt,
  deriveGuildBankGoals,
  guildBankHash,
  reconcileGuildBankReplay,
  resourceForItemDefinition,
  resolveGuildBuildingUpgrade,
} from "./guildBankProtocol";
import { hasGuildCapability } from "./guildGovernanceProtocol";

const PLAN_TTL_MS = 10 * 60 * 1000;
const digestPattern = /^[a-f0-9]{64}$/;
const PLAYER_POINTS_MAX = 2_147_483_647n;
const resourceKeys = ["wood", "stone", "aether"] as const;

const revisionOf = (value: string | number | bigint): string => BigInt(value).toString(10);
const parseJson = <T>(value: string): T => JSON.parse(value) as T;
const text = (value: unknown, label: string): string => {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
};
const integer = (value: unknown, label: string): number => {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return value as number;
};
const exact = (value: unknown, label: string): bigint => {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]*)$/.test(value)) throw new Error(`${label} must be a canonical decimal`);
  return BigInt(value);
};

type MembershipRow = RowDataPacket & { guildId: string; role: GuildMembershipRole };
type GrantRow = RowDataPacket & { capability: GuildCapability; scopeKind: GuildCapabilityScopeKind; scopeId: string; status: "active" | "revoked" };
type AccountRow = RowDataPacket & { guildId: string; balance: string | number | bigint; revision: string | number | bigint };
type PlayerRow = RowDataPacket & { userId: number; aurionPoints: number };
type PlanRow = RowDataPacket & { confirmationHash: string; actorUserId: number; guildId: string; idempotencyKey: string; payloadHash: string; planJson: string; status: "planned" | "consumed" | "expired"; expiresAt: Date | string };
type ReceiptRow = RowDataPacket & { receiptId: string; guildId: string; actorUserId: number; operation: GuildBankOperation; expectedRevision: string | number | bigint; resultingRevision: string | number | bigint; idempotencyKey: string; confirmationHash: string; requestHash: string; resultHash: string; resultJson: string; ruleSetVersion: typeof AURION_GUILD_BANK_RULESET_VERSION; contentVersion: typeof AURION_GUILD_BANK_CONTENT_VERSION };
type ItemRow = RowDataPacket & { id: string; ownerUserId: number; status: string; definitionId: string };
type CustodyRow = RowDataPacket & { custodyId: string; guildId: string; itemRecordVersion: GuildItemRecordVersion; itemId: string; depositorUserId: number; currentRecipientUserId: number | null; status: "held" | "withdrawn"; revision: string | number | bigint; depositReceiptId: string; withdrawalReceiptId: string | null };
type ResourceRow = RowDataPacket & { resourceKey: GuildResourceKey; balance: string | number | bigint; revision: string | number | bigint };
type BuildingRow = RowDataPacket & { buildingId: string; level: string | number | bigint; revision: string | number | bigint; projectionJson: string };
type AllianceRow = RowDataPacket & { targetGuildId: string; pactType: string; status: string };

function receiptFromRow(row: ReceiptRow): GuildBankReceipt {
  return Object.freeze({ receiptId: row.receiptId, guildId: row.guildId, actorUserId: row.actorUserId, operation: row.operation, expectedRevisionExact: revisionOf(row.expectedRevision), resultingRevisionExact: revisionOf(row.resultingRevision), idempotencyKey: row.idempotencyKey, confirmationHash: row.confirmationHash, requestHash: row.requestHash, resultHash: row.resultHash, result: Object.freeze(parseJson<Record<string, unknown>>(row.resultJson)), ruleSetVersion: row.ruleSetVersion, contentVersion: row.contentVersion });
}

function itemSpec(version: GuildItemRecordVersion): Readonly<{ table: string; definitionColumn: string }> {
  return version === "legacy" ? { table: "itemInstances", definitionColumn: "baseItemKey" } : { table: "aurionItemInstancesV2", definitionColumn: "baseItemDefinitionId" };
}

async function activeMembership(connection: PoolConnection, userId: number, guildId?: string, lock = true): Promise<MembershipRow> {
  const parameters: Array<string | number> = [userId];
  let sql = "SELECT guildId, role FROM guildMemberships WHERE userId = ? AND status = 'active'";
  if (guildId) { sql += " AND guildId = ?"; parameters.push(guildId); }
  sql += ` ORDER BY joinedAt ASC LIMIT 2${lock ? " FOR UPDATE" : ""}`;
  const [rows] = await connection.query<MembershipRow[]>(sql, parameters);
  if (rows.length !== 1) throw new Error(rows.length ? "MULTIPLE_ACTIVE_GUILDS_NOT_ALLOWED" : "ACTIVE_GUILD_MEMBERSHIP_REQUIRED");
  return rows[0]!;
}

async function explicitGrants(connection: PoolConnection, guildId: string, userId: number): Promise<GrantRow[]> {
  const [rows] = await connection.query<GrantRow[]>("SELECT capability, scopeKind, scopeId, status FROM aurionGuildCapabilityGrants WHERE guildId = ? AND userId = ?", [guildId, userId]);
  return rows;
}

function capabilityScope(plan: GuildBankPlan): Readonly<{ scopeKind: GuildCapabilityScopeKind; scopeId: string }> {
  if (plan.operation === "upgrade_building") return { scopeKind: "building", scopeId: text(plan.payload.buildingId, "buildingId") };
  return { scopeKind: "bank", scopeId: plan.guildId };
}

async function assertCapability(connection: PoolConnection, membership: MembershipRow, plan: GuildBankPlan): Promise<void> {
  if (membership.role !== plan.role) throw new Error("GUILD_BANK_PLAN_ROLE_DRIFT");
  const scope = capabilityScope(plan);
  if (!hasGuildCapability({ role: membership.role, required: plan.requiredCapability, guildId: membership.guildId, scopeKind: scope.scopeKind, scopeId: scope.scopeId, explicit: await explicitGrants(connection, membership.guildId, plan.actorUserId) })) throw new Error("GUILD_CAPABILITY_REQUIRED");
}

async function readAccount(connection: PoolConnection, guildId: string, lock: boolean): Promise<AccountRow> {
  const [rows] = await connection.query<AccountRow[]>(`SELECT guildId, balance, revision FROM aurionGuildTreasuryAccounts WHERE guildId = ?${lock ? " FOR UPDATE" : ""}`, [guildId]);
  return rows[0] ?? ({ guildId, balance: "0", revision: "0" } as AccountRow);
}

async function lockedAccount(connection: PoolConnection, guildId: string): Promise<AccountRow> {
  await connection.execute("INSERT IGNORE INTO aurionGuildTreasuryAccounts (guildId, balance, revision, ruleSetVersion, contentVersion) VALUES (?, 0, 0, ?, ?)", [guildId, AURION_GUILD_BANK_RULESET_VERSION, AURION_GUILD_BANK_CONTENT_VERSION]);
  return readAccount(connection, guildId, true);
}

async function player(connection: PoolConnection, userId: number, lock = true): Promise<PlayerRow> {
  const [rows] = await connection.query<PlayerRow[]>(`SELECT userId, aurionPoints FROM playerProfiles WHERE userId = ?${lock ? " FOR UPDATE" : ""}`, [userId]);
  if (!rows[0]) throw new Error("PLAYER_PROFILE_REQUIRED");
  return rows[0];
}

async function item(connection: PoolConnection, version: GuildItemRecordVersion, itemId: string, lock = true): Promise<ItemRow> {
  const spec = itemSpec(version);
  const [rows] = await connection.query<ItemRow[]>(`SELECT id, ownerUserId, status, ${spec.definitionColumn} AS definitionId FROM ${spec.table} WHERE id = ?${lock ? " FOR UPDATE" : ""}`, [itemId]);
  if (!rows[0]) throw new Error("ITEM_NOT_FOUND");
  return rows[0];
}

async function updateItem(connection: PoolConnection, version: GuildItemRecordVersion, itemId: string, ownerUserId: number, fromStatus: string, toStatus: string): Promise<void> {
  const spec = itemSpec(version);
  const [updated] = await connection.execute<ResultSetHeader>(`UPDATE ${spec.table} SET ownerUserId = ?, status = ? WHERE id = ? AND status = ?`, [ownerUserId, toStatus, itemId, fromStatus]);
  if (updated.affectedRows !== 1) throw new Error("ITEM_CUSTODY_CONFLICT");
}

async function assertNotEquipped(connection: PoolConnection, version: GuildItemRecordVersion, itemId: string): Promise<void> {
  const [rows] = await connection.query<RowDataPacket[]>("SELECT id FROM aurionEquipmentSlots WHERE itemRecordVersion = ? AND itemId = ? FOR UPDATE", [version, itemId]);
  if (rows.length) throw new Error("EQUIPPED_ITEM_CANNOT_ENTER_GUILD_BANK");
}

async function custody(connection: PoolConnection, version: GuildItemRecordVersion, itemId: string, lock = true): Promise<CustodyRow | null> {
  const [rows] = await connection.query<CustodyRow[]>(`SELECT custodyId, guildId, itemRecordVersion, itemId, depositorUserId, currentRecipientUserId, status, revision, depositReceiptId, withdrawalReceiptId FROM aurionGuildItemCustody WHERE itemRecordVersion = ? AND itemId = ?${lock ? " FOR UPDATE" : ""}`, [version, itemId]);
  return rows[0] ?? null;
}

async function resources(connection: PoolConnection, guildId: string, lock: boolean): Promise<Readonly<Record<GuildResourceKey, bigint>>> {
  const [rows] = await connection.query<ResourceRow[]>(`SELECT resourceKey, balance, revision FROM aurionGuildResourceAccounts WHERE guildId = ? ORDER BY resourceKey${lock ? " FOR UPDATE" : ""}`, [guildId]);
  const balances: Record<GuildResourceKey, bigint> = { wood: 0n, stone: 0n, aether: 0n };
  for (const row of rows) balances[row.resourceKey] = BigInt(row.balance);
  return Object.freeze(balances);
}

async function ensureResourceAccounts(connection: PoolConnection, guildId: string): Promise<void> {
  for (const key of resourceKeys) await connection.execute("INSERT IGNORE INTO aurionGuildResourceAccounts (id, guildId, resourceKey, balance, revision) VALUES (?, ?, ?, 0, 0)", [`${guildId}:${key}`, guildId, key]);
}

async function building(connection: PoolConnection, guildId: string, buildingId: string, lock: boolean): Promise<BuildingRow> {
  const [rows] = await connection.query<BuildingRow[]>(`SELECT buildingId, level, revision, projectionJson FROM aurionGuildBuildings WHERE guildId = ? AND buildingId = ?${lock ? " FOR UPDATE" : ""}`, [guildId, buildingId]);
  return rows[0] ?? ({ buildingId, level: "0", revision: "0", projectionJson: "{}" } as BuildingRow);
}

async function validateOperation(connection: PoolConnection, plan: GuildBankPlan, account: AccountRow): Promise<void> {
  if (plan.operation === "deposit_points") {
    const wallet = await player(connection, plan.actorUserId);
    if (BigInt(wallet.aurionPoints) < exact(plan.payload.amountExact, "amountExact")) throw new Error("INSUFFICIENT_PLAYER_POINTS");
    return;
  }
  if (plan.operation === "withdraw_points") {
    const wallet = await player(connection, plan.actorUserId);
    const amount = exact(plan.payload.amountExact, "amountExact");
    if (BigInt(account.balance) < amount) throw new Error("INSUFFICIENT_GUILD_TREASURY");
    if (BigInt(wallet.aurionPoints) + amount > PLAYER_POINTS_MAX) throw new Error("PLAYER_POINTS_OVERFLOW");
    return;
  }
  if (plan.operation === "deposit_item" || plan.operation === "donate_resource_item") {
    const version = text(plan.payload.itemRecordVersion, "itemRecordVersion") as GuildItemRecordVersion;
    const itemId = text(plan.payload.itemId, "itemId");
    const current = await item(connection, version, itemId);
    if (current.ownerUserId !== plan.actorUserId || current.status !== "owned") throw new Error("OWNED_ITEM_REQUIRED");
    await assertNotEquipped(connection, version, itemId);
    const existing = await custody(connection, version, itemId);
    if (existing?.status === "held") throw new Error("ITEM_ALREADY_IN_GUILD_CUSTODY");
    if (plan.operation === "donate_resource_item") {
      const resolved = resourceForItemDefinition(current.definitionId);
      if (!resolved || resolved !== plan.payload.expectedResourceKey) throw new Error("RESOURCE_ITEM_MAPPING_MISMATCH");
    }
    return;
  }
  if (plan.operation === "withdraw_item") {
    const version = text(plan.payload.itemRecordVersion, "itemRecordVersion") as GuildItemRecordVersion;
    const current = await custody(connection, version, text(plan.payload.itemId, "itemId"));
    if (!current || current.guildId !== plan.guildId || current.status !== "held") throw new Error("HELD_GUILD_ITEM_REQUIRED");
    return;
  }
  const buildingId = text(plan.payload.buildingId, "buildingId");
  const current = await building(connection, plan.guildId, buildingId, true);
  if (revisionOf(current.level) !== plan.payload.expectedLevelExact) throw new Error("GUILD_BUILDING_LEVEL_CONFLICT");
  const upgrade = resolveGuildBuildingUpgrade(buildingId, text(plan.payload.expectedLevelExact, "expectedLevelExact"));
  if (BigInt(account.balance) < BigInt(upgrade.costExact.points)) throw new Error("INSUFFICIENT_GUILD_TREASURY");
  const balances = await resources(connection, plan.guildId, true);
  for (const key of resourceKeys) if (balances[key] < BigInt(upgrade.costExact[key])) throw new Error(`INSUFFICIENT_GUILD_RESOURCE:${key}`);
}

export type GuildBankReadback = Readonly<Pick<GuildBankView,"allowedOperations"|"availableItems"|"buildingOptions"|"planningRevisionExact"> & {
  guildId: string;
  actorUserId: number;
  role: GuildMembershipRole;
  revisionExact: string;
  playerPointsExact: string;
  treasuryBalanceExact: string;
  heldItems: readonly Readonly<{ custodyId: string; itemRecordVersion: GuildItemRecordVersion; itemId: string; depositorUserId: number; revisionExact: string }>[];
  resourceBalancesExact: Readonly<Record<GuildResourceKey, string>>;
  buildings: readonly Readonly<{ buildingId: string; levelExact: string; projection: Readonly<Record<string, unknown>> }>[];
  alliances: readonly Readonly<{ targetGuildId: string; pactType: string }>[];
  goals: ReturnType<typeof deriveGuildBankGoals>;
}>;

export class GuildBankStore {
  constructor(private readonly pool: Pool, private readonly clock: OperationalClock = hostOperationalClock) {}

  static fromDatabaseUrl(databaseUrl = process.env.DATABASE_URL, clock: OperationalClock = hostOperationalClock): GuildBankStore {
    if (!databaseUrl) throw new Error("DATABASE_URL is required for guild bank");
    return new GuildBankStore(createPool(databaseUrl), clock);
  }

  async close(): Promise<void> { await this.pool.end(); }

  async plan(actorUserId: number, input: Readonly<{ operation: GuildBankOperation; expectedRevisionExact: string; idempotencyKey: string; payload: unknown }>): Promise<Readonly<{ plan: GuildBankPlan; expiresAt: string; replay: boolean }>> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const member = await activeMembership(connection, actorUserId);
      const account = await readAccount(connection, member.guildId, true);
      const plan = buildGuildBankPlan({ actorUserId, guildId: member.guildId, role: member.role, operation: input.operation, expectedRevisionExact: input.expectedRevisionExact, idempotencyKey: input.idempotencyKey, payload: input.payload });
      if (plan.expectedRevisionExact !== revisionOf(account.revision)) throw new Error("GUILD_BANK_REVISION_CONFLICT");
      await assertCapability(connection, member, plan);
      const [existing] = await connection.query<PlanRow[]>("SELECT confirmationHash, actorUserId, guildId, idempotencyKey, payloadHash, planJson, status, expiresAt FROM aurionGuildBankPlans WHERE idempotencyKey = ? FOR UPDATE", [plan.idempotencyKey]);
      if (existing[0]) {
        const stored = parseJson<GuildBankPlan>(existing[0].planJson);
        if (stored.confirmationHash !== plan.confirmationHash || existing[0].payloadHash !== plan.payloadHash) throw new Error("GUILD_BANK_PLAN_IDEMPOTENCY_CONFLICT");
        await connection.commit();
        return Object.freeze({ plan: stored, expiresAt: new Date(existing[0].expiresAt).toISOString(), replay: true });
      }
      await validateOperation(connection, plan, account);
      const expiresAt = new Date(deadlineAfter(operationalNow(this.clock), PLAN_TTL_MS));
      await connection.execute("INSERT INTO aurionGuildBankPlans (confirmationHash, guildId, actorUserId, operation, requiredCapability, expectedRevision, idempotencyKey, payloadHash, payloadJson, resourcesJson, planJson, status, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?)", [plan.confirmationHash, plan.guildId, plan.actorUserId, plan.operation, plan.requiredCapability, plan.expectedRevisionExact, plan.idempotencyKey, plan.payloadHash, JSON.stringify(plan.payload), JSON.stringify(plan.resources), JSON.stringify(plan), expiresAt]);
      await connection.commit();
      return Object.freeze({ plan, expiresAt: expiresAt.toISOString(), replay: false });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  async apply(actorUserId: number, confirmationHash: string): Promise<Readonly<{ receipt: GuildBankReceipt; replay: boolean; readback: GuildBankReadback }>> {
    if (!digestPattern.test(confirmationHash)) throw new Error("confirmationHash must be SHA-256");
    const connection = await this.pool.getConnection();
    let receipt!: GuildBankReceipt;
    let replay = false;
    try {
      await connection.beginTransaction();
      const [plans] = await connection.query<PlanRow[]>("SELECT confirmationHash, actorUserId, guildId, idempotencyKey, payloadHash, planJson, status, expiresAt FROM aurionGuildBankPlans WHERE confirmationHash = ? FOR UPDATE", [confirmationHash]);
      const row = plans[0];
      if (!row || row.actorUserId !== actorUserId) throw new Error("GUILD_BANK_PLAN_NOT_FOUND");
      if (row.status === "consumed") {
        const [rows] = await connection.query<ReceiptRow[]>("SELECT * FROM aurionGuildBankReceipts WHERE confirmationHash = ?", [confirmationHash]);
        if (!rows[0]) throw new Error("GUILD_BANK_RECEIPT_READBACK_MISSING");
        receipt = receiptFromRow(rows[0]);
        replay = true;
        await connection.commit();
      } else {
        if (row.status !== "planned" || new Date(row.expiresAt).getTime() <= operationalNow(this.clock)) throw new Error("GUILD_BANK_PLAN_EXPIRED");
        const stored = parseJson<GuildBankPlan>(row.planJson);
        const plan = buildGuildBankPlan({ actorUserId: stored.actorUserId, guildId: stored.guildId, role: stored.role, operation: stored.operation, expectedRevisionExact: stored.expectedRevisionExact, idempotencyKey: stored.idempotencyKey, payload: stored.payload });
        if (plan.confirmationHash !== row.confirmationHash || plan.payloadHash !== row.payloadHash) throw new Error("GUILD_BANK_PLAN_STORAGE_DRIFT");
        const member = await activeMembership(connection, actorUserId, plan.guildId);
        const account = await lockedAccount(connection, plan.guildId);
        if (revisionOf(account.revision) !== plan.expectedRevisionExact) throw new Error("GUILD_BANK_REVISION_CONFLICT");
        await assertCapability(connection, member, plan);
        await ensureResourceAccounts(connection, plan.guildId);
        await validateOperation(connection, plan, account);
        const beforeBalance = BigInt(account.balance);
        const resultingRevision = BigInt(plan.expectedRevisionExact) + 1n;
        let afterBalance = beforeBalance;
        let result: Readonly<Record<string, unknown>>;

        if (plan.operation === "deposit_points" || plan.operation === "withdraw_points") {
          const amount = exact(plan.payload.amountExact, "amountExact");
          const wallet = await player(connection, actorUserId);
          if (plan.operation === "deposit_points") {
            afterBalance = beforeBalance + amount;
            const [updated] = await connection.execute<ResultSetHeader>("UPDATE playerProfiles SET aurionPoints = aurionPoints - ? WHERE userId = ? AND aurionPoints >= ?", [amount.toString(), actorUserId, amount.toString()]);
            if (updated.affectedRows !== 1) throw new Error("PLAYER_POINTS_CONFLICT");
          } else {
            afterBalance = beforeBalance - amount;
            const resultingWallet = BigInt(wallet.aurionPoints) + amount;
            if (resultingWallet > PLAYER_POINTS_MAX) throw new Error("PLAYER_POINTS_OVERFLOW");
            const [updated] = await connection.execute<ResultSetHeader>("UPDATE playerProfiles SET aurionPoints = aurionPoints + ? WHERE userId = ?", [amount.toString(), actorUserId]);
            if (updated.affectedRows !== 1) throw new Error("PLAYER_POINTS_CONFLICT");
          }
          result = Object.freeze({ amountExact: amount.toString(), playerPointsBeforeExact: String(wallet.aurionPoints), playerPointsAfterExact: (plan.operation === "deposit_points" ? BigInt(wallet.aurionPoints) - amount : BigInt(wallet.aurionPoints) + amount).toString(), treasuryBeforeExact: beforeBalance.toString(), treasuryAfterExact: afterBalance.toString() });
        } else if (plan.operation === "deposit_item" || plan.operation === "withdraw_item") {
          const version = text(plan.payload.itemRecordVersion, "itemRecordVersion") as GuildItemRecordVersion;
          const itemId = text(plan.payload.itemId, "itemId");
          const custodyId = `gic_${guildBankHash([version, itemId]).slice(0, 48)}`;
          if (plan.operation === "deposit_item") {
            await updateItem(connection, version, itemId, actorUserId, "owned", "guild_custody");
            result = Object.freeze({ custodyId, itemRecordVersion: version, itemId, depositorUserId: actorUserId, status: "held" });
          } else {
            const held = await custody(connection, version, itemId);
            if (!held) throw new Error("HELD_GUILD_ITEM_REQUIRED");
            await updateItem(connection, version, itemId, actorUserId, "guild_custody", "owned");
            result = Object.freeze({ custodyId: held.custodyId, itemRecordVersion: version, itemId, recipientUserId: actorUserId, status: "withdrawn" });
          }
        } else if (plan.operation === "donate_resource_item") {
          const version = text(plan.payload.itemRecordVersion, "itemRecordVersion") as GuildItemRecordVersion;
          const itemId = text(plan.payload.itemId, "itemId");
          const current = await item(connection, version, itemId);
          const key = resourceForItemDefinition(current.definitionId);
          if (!key || key !== plan.payload.expectedResourceKey) throw new Error("RESOURCE_ITEM_MAPPING_MISMATCH");
          const balances = await resources(connection, plan.guildId, true);
          await updateItem(connection, version, itemId, actorUserId, "owned", "consumed");
          result = Object.freeze({ itemRecordVersion: version, itemId, itemDefinitionId: current.definitionId, resourceKey: key, amountExact: "1", balanceBeforeExact: balances[key].toString(), balanceAfterExact: (balances[key] + 1n).toString(), itemStatus: "consumed" });
        } else {
          const buildingId = text(plan.payload.buildingId, "buildingId");
          const upgrade = resolveGuildBuildingUpgrade(buildingId, text(plan.payload.expectedLevelExact, "expectedLevelExact"));
          const balances = await resources(connection, plan.guildId, true);
          afterBalance = beforeBalance - BigInt(upgrade.costExact.points);
          result = Object.freeze({ buildingId, previousLevelExact: upgrade.previousLevelExact, resultingLevelExact: upgrade.resultingLevelExact, costExact: upgrade.costExact, treasuryBeforeExact: beforeBalance.toString(), treasuryAfterExact: afterBalance.toString(), resourceBalancesBeforeExact: Object.fromEntries(resourceKeys.map(key => [key, balances[key].toString()])), resourceBalancesAfterExact: Object.fromEntries(resourceKeys.map(key => [key, (balances[key] - BigInt(upgrade.costExact[key])).toString()])), projection: upgrade.projection });
        }

        receipt = buildGuildBankReceipt({ plan, resultingRevisionExact: resultingRevision.toString(), result });

        if (plan.operation === "deposit_points" || plan.operation === "withdraw_points" || plan.operation === "upgrade_building") {
          const amount = plan.operation === "upgrade_building" ? beforeBalance - afterBalance : exact(plan.payload.amountExact, "amountExact");
          await connection.execute("INSERT INTO aurionGuildTreasuryLedger (entryId, guildId, actorUserId, receiptId, direction, reason, amount, balanceBefore, balanceAfter) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [`gtl_${guildBankHash([receipt.receiptId, "treasury"]).slice(0, 48)}`, plan.guildId, actorUserId, receipt.receiptId, plan.operation === "deposit_points" ? "credit" : "debit", plan.operation === "deposit_points" ? "player_deposit" : plan.operation === "withdraw_points" ? "player_withdrawal" : "building_upgrade", amount.toString(), beforeBalance.toString(), afterBalance.toString()]);
        }

        if (plan.operation === "deposit_item") {
          const version = text(plan.payload.itemRecordVersion, "itemRecordVersion") as GuildItemRecordVersion;
          const itemId = text(plan.payload.itemId, "itemId");
          const custodyId = text(result.custodyId, "custodyId");
          await connection.execute("INSERT INTO aurionGuildItemCustody (custodyId, guildId, itemRecordVersion, itemId, depositorUserId, currentRecipientUserId, status, revision, depositReceiptId, withdrawalReceiptId, withdrawnAt) VALUES (?, ?, ?, ?, ?, NULL, 'held', ?, ?, NULL, NULL) ON DUPLICATE KEY UPDATE guildId = VALUES(guildId), depositorUserId = VALUES(depositorUserId), currentRecipientUserId = NULL, status = 'held', revision = VALUES(revision), depositReceiptId = VALUES(depositReceiptId), withdrawalReceiptId = NULL, withdrawnAt = NULL", [custodyId, plan.guildId, version, itemId, actorUserId, resultingRevision.toString(), receipt.receiptId]);
          await connection.execute("INSERT INTO aurionGuildItemCustodyLedger (eventId, custodyId, guildId, itemRecordVersion, itemId, actorUserId, eventType, receiptId, previousOwnerUserId, resultingOwnerUserId) VALUES (?, ?, ?, ?, ?, ?, 'deposit', ?, ?, NULL)", [`gicl_${guildBankHash([receipt.receiptId, "deposit"]).slice(0, 48)}`, custodyId, plan.guildId, version, itemId, actorUserId, receipt.receiptId, actorUserId]);
        } else if (plan.operation === "withdraw_item") {
          const version = text(plan.payload.itemRecordVersion, "itemRecordVersion") as GuildItemRecordVersion;
          const itemId = text(plan.payload.itemId, "itemId");
          const custodyId = text(result.custodyId, "custodyId");
          const [updated] = await connection.execute<ResultSetHeader>("UPDATE aurionGuildItemCustody SET currentRecipientUserId = ?, status = 'withdrawn', revision = ?, withdrawalReceiptId = ?, withdrawnAt = CURRENT_TIMESTAMP WHERE custodyId = ? AND guildId = ? AND status = 'held'", [actorUserId, resultingRevision.toString(), receipt.receiptId, custodyId, plan.guildId]);
          if (updated.affectedRows !== 1) throw new Error("ITEM_CUSTODY_CONFLICT");
          await connection.execute("INSERT INTO aurionGuildItemCustodyLedger (eventId, custodyId, guildId, itemRecordVersion, itemId, actorUserId, eventType, receiptId, previousOwnerUserId, resultingOwnerUserId) VALUES (?, ?, ?, ?, ?, ?, 'withdrawal', ?, ?, ?)", [`gicl_${guildBankHash([receipt.receiptId, "withdrawal"]).slice(0, 48)}`, custodyId, plan.guildId, version, itemId, actorUserId, receipt.receiptId, integer((await custody(connection, version, itemId))?.depositorUserId, "depositorUserId"), actorUserId]);
        } else if (plan.operation === "donate_resource_item") {
          const key = text(result.resourceKey, "resourceKey") as GuildResourceKey;
          await connection.execute("UPDATE aurionGuildResourceAccounts SET balance = balance + 1, revision = revision + 1 WHERE guildId = ? AND resourceKey = ?", [plan.guildId, key]);
          await connection.execute("INSERT INTO aurionGuildResourceLedger (entryId, guildId, resourceKey, direction, amount, balanceBefore, balanceAfter, sourceItemRecordVersion, sourceItemId, sourceReceiptId) VALUES (?, ?, ?, 'credit', 1, ?, ?, ?, ?, ?)", [`grl_${guildBankHash([receipt.receiptId, key]).slice(0, 48)}`, plan.guildId, key, text(result.balanceBeforeExact, "balanceBeforeExact"), text(result.balanceAfterExact, "balanceAfterExact"), text(result.itemRecordVersion, "itemRecordVersion"), text(result.itemId, "itemId"), receipt.receiptId]);
        } else if (plan.operation === "upgrade_building") {
          const buildingId = text(result.buildingId, "buildingId");
          const costs = result.costExact as Readonly<Record<GuildResourceKey | "points", string>>;
          const beforeResources = result.resourceBalancesBeforeExact as Readonly<Record<GuildResourceKey, string>>;
          const afterResources = result.resourceBalancesAfterExact as Readonly<Record<GuildResourceKey, string>>;
          for (const key of resourceKeys) {
            const [updated] = await connection.execute<ResultSetHeader>("UPDATE aurionGuildResourceAccounts SET balance = ?, revision = revision + 1 WHERE guildId = ? AND resourceKey = ? AND balance = ?", [afterResources[key], plan.guildId, key, beforeResources[key]]);
            if (updated.affectedRows !== 1) throw new Error(`GUILD_RESOURCE_CONFLICT:${key}`);
            await connection.execute("INSERT INTO aurionGuildResourceLedger (entryId, guildId, resourceKey, direction, amount, balanceBefore, balanceAfter, sourceReceiptId) VALUES (?, ?, ?, 'debit', ?, ?, ?, ?)", [`grl_${guildBankHash([receipt.receiptId, key]).slice(0, 48)}`, plan.guildId, key, costs[key], beforeResources[key], afterResources[key], receipt.receiptId]);
          }
          await connection.execute("INSERT INTO aurionGuildBuildings (id, guildId, buildingId, level, revision, upgradeReceiptId, projectionJson) VALUES (?, ?, ?, ?, 1, ?, ?) ON DUPLICATE KEY UPDATE level = VALUES(level), revision = revision + 1, upgradeReceiptId = VALUES(upgradeReceiptId), projectionJson = VALUES(projectionJson)", [`${plan.guildId}:${buildingId}`, plan.guildId, buildingId, text(result.resultingLevelExact, "resultingLevelExact"), receipt.receiptId, JSON.stringify(result.projection)]);
        }

        await connection.execute("INSERT INTO aurionGuildBankReceipts (receiptId, guildId, actorUserId, operation, expectedRevision, resultingRevision, idempotencyKey, confirmationHash, requestHash, resultHash, resultJson, ruleSetVersion, contentVersion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [receipt.receiptId, receipt.guildId, receipt.actorUserId, receipt.operation, receipt.expectedRevisionExact, receipt.resultingRevisionExact, receipt.idempotencyKey, receipt.confirmationHash, receipt.requestHash, receipt.resultHash, JSON.stringify(receipt.result), receipt.ruleSetVersion, receipt.contentVersion]);
        const [accountUpdate] = await connection.execute<ResultSetHeader>("UPDATE aurionGuildTreasuryAccounts SET balance = ?, revision = ?, ruleSetVersion = ?, contentVersion = ? WHERE guildId = ? AND revision = ?", [afterBalance.toString(), resultingRevision.toString(), AURION_GUILD_BANK_RULESET_VERSION, AURION_GUILD_BANK_CONTENT_VERSION, plan.guildId, plan.expectedRevisionExact]);
        if (accountUpdate.affectedRows !== 1) throw new Error("GUILD_BANK_REVISION_CONFLICT");
        const [consumed] = await connection.execute<ResultSetHeader>("UPDATE aurionGuildBankPlans SET status = 'consumed', consumedAt = CURRENT_TIMESTAMP WHERE confirmationHash = ? AND status = 'planned'", [confirmationHash]);
        if (consumed.affectedRows !== 1) throw new Error("GUILD_BANK_PLAN_CONSUME_CONFLICT");
        await connection.commit();
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }

    const readback = await this.read(actorUserId, receipt.guildId);
    if (readback.revisionExact !== receipt.resultingRevisionExact) throw new Error("GUILD_BANK_REVISION_READBACK_FAILED");
    if (replay) {
      const [rows] = await this.pool.query<PlanRow[]>("SELECT confirmationHash, actorUserId, guildId, idempotencyKey, payloadHash, planJson, status, expiresAt FROM aurionGuildBankPlans WHERE confirmationHash = ?", [confirmationHash]);
      if (!rows[0]) throw new Error("GUILD_BANK_PLAN_READBACK_MISSING");
      reconcileGuildBankReplay(receipt, buildGuildBankReceipt({ plan: parseJson<GuildBankPlan>(rows[0].planJson), resultingRevisionExact: receipt.resultingRevisionExact, result: receipt.result }));
    }
    return Object.freeze({ receipt, replay, readback });
  }

  async read(actorUserId: number, requestedGuildId?: string): Promise<GuildBankReadback> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const member = await activeMembership(connection, actorUserId, requestedGuildId, false);
      const account = await readAccount(connection, member.guildId, false);
      const wallet = await player(connection, actorUserId, false);
      const [held] = await connection.query<CustodyRow[]>("SELECT custodyId, guildId, itemRecordVersion, itemId, depositorUserId, currentRecipientUserId, status, revision, depositReceiptId, withdrawalReceiptId FROM aurionGuildItemCustody WHERE guildId = ? AND status = 'held' ORDER BY depositedAt, custodyId LIMIT 1001", [member.guildId]);
      if(held.length>1000) throw new Error("GUILD_BANK_PAGE_REQUIRED");
      const availableItems: GuildBankView["availableItems"]=[];
      for(const itemRecordVersion of ["legacy","aurion_v2"] as const){
        const spec=itemSpec(itemRecordVersion);
        const [rows]=await connection.query<RowDataPacket[]>(`SELECT id, ${spec.definitionColumn} AS definitionId FROM ${spec.table} WHERE ownerUserId=? AND status='owned' ORDER BY id LIMIT 1001`,[actorUserId]);
        for(const row of rows)availableItems.push({itemRecordVersion,itemId:row.id,definitionId:row.definitionId,resourceKey:resourceForItemDefinition(row.definitionId)});
      }
      if(availableItems.length>1000) throw new Error("GUILD_INVENTORY_PAGE_REQUIRED");
      const [planningRows]=await connection.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM aurionGuildBankPlans WHERE guildId=? AND actorUserId=?",[member.guildId,actorUserId]);
      const planningRevisionExact=String(planningRows[0].count);
      const grants=await explicitGrants(connection,member.guildId,actorUserId);
      const can=(required:GuildCapability,scopeKind:GuildCapabilityScopeKind,scopeId:string)=>hasGuildCapability({role:member.role,required,guildId:member.guildId,scopeKind,scopeId,explicit:grants});
      const allowedOperations=guildBankOperations.filter(op=>op!=="upgrade_building"&&can(bankOperationCapability[op],"bank",member.guildId));
      const balances = await resources(connection, member.guildId, false);
      const [buildingRows] = await connection.query<BuildingRow[]>("SELECT buildingId, level, revision, projectionJson FROM aurionGuildBuildings WHERE guildId = ? ORDER BY buildingId", [member.guildId]);
      const [alliances] = await connection.query<AllianceRow[]>("SELECT targetGuildId, pactType, status FROM aurionGuildDiplomacyPacts WHERE sourceGuildId = ? AND status = 'active' ORDER BY targetGuildId, pactType", [member.guildId]);
      const [territoryRows] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) AS rowCount FROM aurionGuildTerritories WHERE guildId = ? AND state = 'active'", [member.guildId]);
      const totalBuildingLevels = buildingRows.reduce((sum, row) => sum + BigInt(row.level), 0n);
      const goals = deriveGuildBankGoals({ treasuryBalanceExact: revisionOf(account.balance), activeTerritoriesExact: String(territoryRows[0]?.rowCount ?? 0), heldItemsExact: String(held.length), totalBuildingLevelsExact: totalBuildingLevels.toString() });
      const buildingOptions=Object.values(guildBuildingDefinitions).map(definition=>{
        const levelExact=revisionOf(buildingRows.find(row=>row.buildingId===definition.id)?.level??"0");
        const next=BigInt(levelExact)<BigInt(definition.maximumLevelExact)?resolveGuildBuildingUpgrade(definition.id,levelExact):null;
        return {buildingId:definition.id,levelExact,maximumLevelExact:definition.maximumLevelExact,canUpgrade:Boolean(next)&&can("building_manage","building",definition.id),nextCost:next?{...next.costExact}:null};
      });
      const readback=Object.freeze({
        allowedOperations,availableItems,buildingOptions,planningRevisionExact,
        guildId: member.guildId,
        actorUserId,
        role: member.role,
        revisionExact: revisionOf(account.revision),
        playerPointsExact: String(wallet.aurionPoints),
        treasuryBalanceExact: revisionOf(account.balance),
        heldItems: Object.freeze(held.map(row => Object.freeze({ custodyId: row.custodyId, itemRecordVersion: row.itemRecordVersion, itemId: row.itemId, depositorUserId: row.depositorUserId, revisionExact: revisionOf(row.revision) }))),
        resourceBalancesExact: Object.freeze(Object.fromEntries(resourceKeys.map(key => [key, balances[key].toString()])) as Record<GuildResourceKey, string>),
        buildings: Object.freeze(buildingRows.map(row => Object.freeze({ buildingId: row.buildingId, levelExact: revisionOf(row.level), projection: Object.freeze(parseJson<Record<string, unknown>>(row.projectionJson)) }))),
        alliances: Object.freeze(alliances.map(row => Object.freeze({ targetGuildId: row.targetGuildId, pactType: row.pactType }))),
        goals,
      });
    await connection.commit();
    return readback;
    } catch(error){await connection.rollback();throw error;} finally { connection.release(); }
  }
}
