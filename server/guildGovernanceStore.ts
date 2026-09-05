import { operationalNow, deadlineAfter, hostOperationalClock, type OperationalClock } from "../shared/operationalClock";
import { createPool, type Pool, type PoolConnection, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import {
  AURION_GUILD_GOVERNANCE_CONTENT_VERSION,
  AURION_GUILD_GOVERNANCE_RULESET_VERSION,
  type GuildCapability,
  type GuildCapabilityScopeKind,
  type GuildGovernanceOperation,
  type GuildGovernanceReceipt,
  type GuildMembershipRole,
  type GuildMutationPlan,
  type GuildTerritoryCoordinate,
} from "@shared/guildGovernanceContract";
import {
  buildGuildGovernanceReceipt,
  buildGuildMutationPlan,
  guildGovernanceHash,
  hasGuildCapability,
  reconcileGuildGovernanceReplay,
  validateKingdomConsolidation,
} from "./guildGovernanceProtocol";

const PLAN_TTL_MS = 10 * 60 * 1000;
const digestPattern = /^[a-f0-9]{64}$/;
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

type MembershipRow = RowDataPacket & { guildId: string; role: GuildMembershipRole; status: string };
type StateRow = RowDataPacket & { guildId: string; revision: string | number | bigint; kingdomId: string | null; capitalTerritoryId: string | null };
type GrantRow = RowDataPacket & { capability: GuildCapability; scopeKind: GuildCapabilityScopeKind; scopeId: string; status: "active" | "revoked" };
type PlanRow = RowDataPacket & { confirmationHash: string; guildId: string; actorUserId: number; idempotencyKey: string; payloadHash: string; planJson: string; status: "planned" | "consumed" | "expired"; expiresAt: Date | string };
type TerritoryRow = RowDataPacket & GuildTerritoryCoordinate;
type ReceiptRow = RowDataPacket & { receiptId: string; guildId: string; actorUserId: number; operation: GuildGovernanceOperation; expectedRevision: string | number | bigint; resultingRevision: string | number | bigint; idempotencyKey: string; confirmationHash: string; requestHash: string; resultHash: string; resultJson: string; ruleSetVersion: typeof AURION_GUILD_GOVERNANCE_RULESET_VERSION; contentVersion: typeof AURION_GUILD_GOVERNANCE_CONTENT_VERSION };
type KingdomRow = RowDataPacket & { id: string; name: string; rulerUserId: number; capitalTerritoryId: string; territoryDigest: string; revision: string | number | bigint };

function receiptFromRow(row: ReceiptRow): GuildGovernanceReceipt {
  return Object.freeze({
    receiptId: row.receiptId,
    guildId: row.guildId,
    actorUserId: row.actorUserId,
    operation: row.operation,
    expectedRevisionExact: revisionOf(row.expectedRevision),
    resultingRevisionExact: revisionOf(row.resultingRevision),
    idempotencyKey: row.idempotencyKey,
    confirmationHash: row.confirmationHash,
    requestHash: row.requestHash,
    resultHash: row.resultHash,
    result: Object.freeze(parseJson<Record<string, unknown>>(row.resultJson)),
    ruleSetVersion: row.ruleSetVersion,
    contentVersion: row.contentVersion,
  });
}

async function membership(connection: PoolConnection, actorUserId: number, guildId?: string, lock = true): Promise<MembershipRow> {
  const parameters: Array<string | number> = [actorUserId];
  let sql = "SELECT guildId, role, status FROM guildMemberships WHERE userId = ? AND status = 'active'";
  if (guildId) { sql += " AND guildId = ?"; parameters.push(guildId); }
  sql += ` ORDER BY joinedAt ASC LIMIT 2${lock ? " FOR UPDATE" : ""}`;
  const [rows] = await connection.query<MembershipRow[]>(sql, parameters);
  if (rows.length !== 1) throw new Error(rows.length ? "MULTIPLE_ACTIVE_GUILDS_NOT_ALLOWED" : "ACTIVE_GUILD_MEMBERSHIP_REQUIRED");
  return rows[0]!;
}

async function lockedState(connection: PoolConnection, guildId: string): Promise<StateRow> {
  await connection.execute(
    "INSERT IGNORE INTO aurionGuildGovernanceStates (guildId, revision, ruleSetVersion, contentVersion) VALUES (?, 0, ?, ?)",
    [guildId, AURION_GUILD_GOVERNANCE_RULESET_VERSION, AURION_GUILD_GOVERNANCE_CONTENT_VERSION],
  );
  const [rows] = await connection.query<StateRow[]>("SELECT guildId, revision, kingdomId, capitalTerritoryId FROM aurionGuildGovernanceStates WHERE guildId = ? FOR UPDATE", [guildId]);
  if (rows.length !== 1) throw new Error("GUILD_GOVERNANCE_STATE_MISSING");
  return rows[0]!;
}

async function grants(connection: PoolConnection, guildId: string, userId: number): Promise<GrantRow[]> {
  const [rows] = await connection.query<GrantRow[]>("SELECT capability, scopeKind, scopeId, status FROM aurionGuildCapabilityGrants WHERE guildId = ? AND userId = ?", [guildId, userId]);
  return rows;
}

function scopeFor(plan: GuildMutationPlan): { scopeKind: GuildCapabilityScopeKind; scopeId: string } {
  if (plan.operation === "claim_territory" || plan.operation === "release_territory") return { scopeKind: "territory", scopeId: text(plan.payload.territoryId, "territoryId") };
  if (plan.operation === "set_diplomacy") return { scopeKind: "diplomacy", scopeId: text(plan.payload.targetGuildId, "targetGuildId") };
  if (plan.operation === "consolidate_kingdom") return { scopeKind: "kingdom", scopeId: plan.guildId };
  return { scopeKind: "guild", scopeId: plan.guildId };
}

async function assertCapability(connection: PoolConnection, active: MembershipRow, plan: GuildMutationPlan): Promise<void> {
  if (active.role !== plan.role) throw new Error("GUILD_PLAN_ROLE_DRIFT");
  const scope = scopeFor(plan);
  if (!hasGuildCapability({ role: active.role, required: plan.requiredCapability, guildId: active.guildId, scopeKind: scope.scopeKind, scopeId: scope.scopeId, explicit: await grants(connection, active.guildId, plan.actorUserId) })) throw new Error("GUILD_CAPABILITY_REQUIRED");
}

async function territoryRows(connection: PoolConnection, territoryIds: readonly string[]): Promise<TerritoryRow[]> {
  if (!territoryIds.length) return [];
  const placeholders = territoryIds.map(() => "?").join(",");
  const [rows] = await connection.query<TerritoryRow[]>(`SELECT territoryId, worldId, chunkX, chunkZ, guildId, state FROM aurionGuildTerritories WHERE territoryId IN (${placeholders}) ORDER BY territoryId FOR UPDATE`, [...territoryIds]);
  return rows;
}

async function preflight(connection: PoolConnection, plan: GuildMutationPlan): Promise<void> {
  if (plan.operation === "claim_territory") {
    const [rows] = await connection.query<TerritoryRow[]>("SELECT territoryId, worldId, chunkX, chunkZ, guildId, state FROM aurionGuildTerritories WHERE worldId = ? AND chunkX = ? AND chunkZ = ? FOR UPDATE", [text(plan.payload.worldId, "worldId"), integer(plan.payload.chunkX, "chunkX"), integer(plan.payload.chunkZ, "chunkZ")]);
    if (rows[0] && rows[0].state !== "released") throw new Error("TERRITORY_ALREADY_OWNED");
    return;
  }
  if (plan.operation === "release_territory") {
    const rows = await territoryRows(connection, [text(plan.payload.territoryId, "territoryId")]);
    if (rows.length !== 1 || rows[0]!.guildId !== plan.guildId || rows[0]!.state !== "active") throw new Error("ACTIVE_OWNED_TERRITORY_REQUIRED");
    return;
  }
  if (plan.operation === "consolidate_kingdom") {
    const ids = plan.payload.territoryIds as readonly string[];
    validateKingdomConsolidation({ guildId: plan.guildId, plan, territories: await territoryRows(connection, ids) });
    const [rows] = await connection.query<RowDataPacket[]>("SELECT id FROM aurionGuildKingdoms WHERE guildId = ? AND status = 'active' FOR UPDATE", [plan.guildId]);
    if (rows.length) throw new Error("GUILD_ALREADY_HAS_ACTIVE_KINGDOM");
    return;
  }
  if (plan.operation === "grant_capability") {
    await membership(connection, integer(plan.payload.targetUserId, "targetUserId"), plan.guildId);
    return;
  }
  if (plan.operation === "set_diplomacy") {
    const targetGuildId = text(plan.payload.targetGuildId, "targetGuildId");
    if (targetGuildId === plan.guildId) throw new Error("GUILD_CANNOT_TARGET_ITSELF");
    const [rows] = await connection.query<RowDataPacket[]>("SELECT id FROM guilds WHERE id = ? FOR UPDATE", [targetGuildId]);
    if (rows.length !== 1) throw new Error("TARGET_GUILD_NOT_FOUND");
  }
}

export type GuildGovernanceReadback = Readonly<{
  guildId: string;
  actorUserId: number;
  role: GuildMembershipRole;
  revisionExact: string;
  kingdom: null | Readonly<{ id: string; name: string; rulerUserId: number; capitalTerritoryId: string; territoryDigest: string; revisionExact: string }>;
  territories: readonly GuildTerritoryCoordinate[];
  grants: readonly Readonly<{ capability: GuildCapability; scopeKind: GuildCapabilityScopeKind; scopeId: string; status: "active" | "revoked" }>[];
}>;

export class GuildGovernanceStore {
  constructor(private readonly pool: Pool, private readonly clock: OperationalClock = hostOperationalClock) {}

  static fromDatabaseUrl(databaseUrl = process.env.DATABASE_URL, clock: OperationalClock = hostOperationalClock): GuildGovernanceStore {
    if (!databaseUrl) throw new Error("DATABASE_URL is required for guild governance");
    return new GuildGovernanceStore(createPool(databaseUrl), clock);
  }

  async close(): Promise<void> { await this.pool.end(); }

  async plan(actorUserId: number, input: Readonly<{ operation: GuildGovernanceOperation; expectedRevisionExact: string; idempotencyKey: string; payload: unknown }>): Promise<Readonly<{ plan: GuildMutationPlan; expiresAt: string; replay: boolean }>> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const active = await membership(connection, actorUserId);
      const state = await lockedState(connection, active.guildId);
      const plan = buildGuildMutationPlan({ actorUserId, guildId: active.guildId, role: active.role, operation: input.operation, expectedRevisionExact: input.expectedRevisionExact, idempotencyKey: input.idempotencyKey, payload: input.payload });
      if (plan.expectedRevisionExact !== revisionOf(state.revision)) throw new Error("GUILD_REVISION_CONFLICT");
      await assertCapability(connection, active, plan);
      await preflight(connection, plan);
      const [existing] = await connection.query<PlanRow[]>("SELECT confirmationHash, guildId, actorUserId, idempotencyKey, payloadHash, planJson, status, expiresAt FROM aurionGuildMutationPlans WHERE idempotencyKey = ? FOR UPDATE", [plan.idempotencyKey]);
      if (existing[0]) {
        const stored = parseJson<GuildMutationPlan>(existing[0].planJson);
        if (stored.confirmationHash !== plan.confirmationHash || existing[0].payloadHash !== plan.payloadHash) throw new Error("GUILD_PLAN_IDEMPOTENCY_CONFLICT");
        await connection.commit();
        return Object.freeze({ plan: stored, expiresAt: new Date(existing[0].expiresAt).toISOString(), replay: true });
      }
      const expiresAt = new Date(deadlineAfter(operationalNow(this.clock), PLAN_TTL_MS));
      await connection.execute("INSERT INTO aurionGuildMutationPlans (confirmationHash, guildId, actorUserId, operation, requiredCapability, expectedRevision, idempotencyKey, payloadHash, payloadJson, resourcesJson, planJson, status, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?)", [plan.confirmationHash, plan.guildId, plan.actorUserId, plan.operation, plan.requiredCapability, plan.expectedRevisionExact, plan.idempotencyKey, plan.payloadHash, JSON.stringify(plan.payload), JSON.stringify(plan.resources), JSON.stringify(plan), expiresAt]);
      await connection.commit();
      return Object.freeze({ plan, expiresAt: expiresAt.toISOString(), replay: false });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  }

  async apply(actorUserId: number, confirmationHash: string): Promise<Readonly<{ receipt: GuildGovernanceReceipt; replay: boolean; readback: GuildGovernanceReadback }>> {
    if (!digestPattern.test(confirmationHash)) throw new Error("confirmationHash must be SHA-256");
    const connection = await this.pool.getConnection();
    let receipt!: GuildGovernanceReceipt;
    let replay = false;
    try {
      await connection.beginTransaction();
      const [plans] = await connection.query<PlanRow[]>("SELECT confirmationHash, guildId, actorUserId, idempotencyKey, payloadHash, planJson, status, expiresAt FROM aurionGuildMutationPlans WHERE confirmationHash = ? FOR UPDATE", [confirmationHash]);
      const row = plans[0];
      if (!row || row.actorUserId !== actorUserId) throw new Error("GUILD_PLAN_NOT_FOUND");
      if (row.status === "consumed") {
        const [rows] = await connection.query<ReceiptRow[]>("SELECT * FROM aurionGuildGovernanceReceipts WHERE confirmationHash = ?", [confirmationHash]);
        if (!rows[0]) throw new Error("GUILD_RECEIPT_READBACK_MISSING");
        receipt = receiptFromRow(rows[0]);
        replay = true;
        await connection.commit();
      } else {
        if (row.status !== "planned" || new Date(row.expiresAt).getTime() <= operationalNow(this.clock)) throw new Error("GUILD_PLAN_EXPIRED");
        const stored = parseJson<GuildMutationPlan>(row.planJson);
        const plan = buildGuildMutationPlan({ actorUserId: stored.actorUserId, guildId: stored.guildId, role: stored.role, operation: stored.operation, expectedRevisionExact: stored.expectedRevisionExact, idempotencyKey: stored.idempotencyKey, payload: stored.payload });
        if (plan.confirmationHash !== row.confirmationHash || plan.payloadHash !== row.payloadHash) throw new Error("GUILD_PLAN_STORAGE_DRIFT");
        const active = await membership(connection, actorUserId, plan.guildId);
        const state = await lockedState(connection, plan.guildId);
        if (revisionOf(state.revision) !== plan.expectedRevisionExact) throw new Error("GUILD_REVISION_CONFLICT");
        await assertCapability(connection, active, plan);
        await preflight(connection, plan);
        const resultingRevisionExact = (BigInt(plan.expectedRevisionExact) + 1n).toString(10);

        let result: Readonly<Record<string, unknown>>;
        if (plan.operation === "claim_territory") result = Object.freeze({ territoryId: text(plan.payload.territoryId, "territoryId"), worldId: text(plan.payload.worldId, "worldId"), chunkX: integer(plan.payload.chunkX, "chunkX"), chunkZ: integer(plan.payload.chunkZ, "chunkZ"), guildId: plan.guildId, state: "active" });
        else if (plan.operation === "release_territory") result = Object.freeze({ territoryId: text(plan.payload.territoryId, "territoryId"), guildId: plan.guildId, state: "released" });
        else if (plan.operation === "grant_capability") result = Object.freeze({ grantId: `gcg_${guildGovernanceHash([plan.confirmationHash, plan.payload]).slice(0, 48)}`, guildId: plan.guildId, userId: integer(plan.payload.targetUserId, "targetUserId"), capability: text(plan.payload.capability, "capability"), scopeKind: text(plan.payload.scopeKind, "scopeKind"), scopeId: text(plan.payload.scopeId, "scopeId"), status: text(plan.payload.grantStatus, "grantStatus") });
        else if (plan.operation === "set_diplomacy") result = Object.freeze({ pactId: `gdp_${guildGovernanceHash([plan.guildId, plan.payload.targetGuildId, plan.payload.pactType]).slice(0, 48)}`, sourceGuildId: plan.guildId, targetGuildId: text(plan.payload.targetGuildId, "targetGuildId"), pactType: text(plan.payload.pactType, "pactType"), status: text(plan.payload.pactStatus, "pactStatus") });
        else {
          const kingdom = validateKingdomConsolidation({ guildId: plan.guildId, plan, territories: await territoryRows(connection, plan.payload.territoryIds as readonly string[]) });
          result = Object.freeze({ ...kingdom, guildId: plan.guildId, rulerUserId: actorUserId, status: "active" });
        }
        receipt = buildGuildGovernanceReceipt({ plan, resultingRevisionExact, result });

        if (plan.operation === "claim_territory") {
          const territoryId = text(result.territoryId, "territoryId");
          const [updated] = await connection.execute<ResultSetHeader>("UPDATE aurionGuildTerritories SET guildId = ?, state = 'active', acquiredByUserId = ?, claimReceiptId = ?, claimRevision = ? WHERE territoryId = ? AND state = 'released'", [plan.guildId, actorUserId, receipt.receiptId, resultingRevisionExact, territoryId]);
          if (!updated.affectedRows) await connection.execute("INSERT INTO aurionGuildTerritories (territoryId, worldId, chunkX, chunkZ, guildId, state, acquiredByUserId, claimReceiptId, claimRevision) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)", [territoryId, text(result.worldId, "worldId"), integer(result.chunkX, "chunkX"), integer(result.chunkZ, "chunkZ"), plan.guildId, actorUserId, receipt.receiptId, resultingRevisionExact]);
        } else if (plan.operation === "release_territory") {
          const [updated] = await connection.execute<ResultSetHeader>("UPDATE aurionGuildTerritories SET state = 'released' WHERE territoryId = ? AND guildId = ? AND state = 'active'", [text(result.territoryId, "territoryId"), plan.guildId]);
          if (updated.affectedRows !== 1) throw new Error("TERRITORY_RELEASE_CONFLICT");
        } else if (plan.operation === "grant_capability") {
          await connection.execute("INSERT INTO aurionGuildCapabilityGrants (id, guildId, userId, capability, scopeKind, scopeId, status, grantedByUserId, grantReceiptId, idempotencyKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), grantedByUserId = VALUES(grantedByUserId), grantReceiptId = VALUES(grantReceiptId), idempotencyKey = VALUES(idempotencyKey)", [text(result.grantId, "grantId"), plan.guildId, integer(result.userId, "userId"), text(result.capability, "capability"), text(result.scopeKind, "scopeKind"), text(result.scopeId, "scopeId"), text(result.status, "status"), actorUserId, receipt.receiptId, plan.idempotencyKey]);
        } else if (plan.operation === "set_diplomacy") {
          await connection.execute("INSERT INTO aurionGuildDiplomacyPacts (id, sourceGuildId, targetGuildId, pactType, status, revision, receiptId, idempotencyKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), revision = VALUES(revision), receiptId = VALUES(receiptId), idempotencyKey = VALUES(idempotencyKey)", [text(result.pactId, "pactId"), plan.guildId, text(result.targetGuildId, "targetGuildId"), text(result.pactType, "pactType"), text(result.status, "status"), resultingRevisionExact, receipt.receiptId, plan.idempotencyKey]);
        } else {
          await connection.execute("INSERT INTO aurionGuildKingdoms (id, guildId, name, rulerUserId, capitalTerritoryId, territoryDigest, status, revision) VALUES (?, ?, ?, ?, ?, ?, 'active', ?) ON DUPLICATE KEY UPDATE name = VALUES(name), rulerUserId = VALUES(rulerUserId), capitalTerritoryId = VALUES(capitalTerritoryId), territoryDigest = VALUES(territoryDigest), status = 'active', revision = VALUES(revision)", [text(result.kingdomId, "kingdomId"), plan.guildId, text(result.name, "name"), actorUserId, text(result.capitalTerritoryId, "capitalTerritoryId"), text(result.territoryDigest, "territoryDigest"), resultingRevisionExact]);
        }

        await connection.execute("INSERT INTO aurionGuildGovernanceReceipts (receiptId, guildId, actorUserId, operation, expectedRevision, resultingRevision, idempotencyKey, confirmationHash, requestHash, resultHash, resultJson, ruleSetVersion, contentVersion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", [receipt.receiptId, receipt.guildId, receipt.actorUserId, receipt.operation, receipt.expectedRevisionExact, receipt.resultingRevisionExact, receipt.idempotencyKey, receipt.confirmationHash, receipt.requestHash, receipt.resultHash, JSON.stringify(receipt.result), receipt.ruleSetVersion, receipt.contentVersion]);
        const [stateUpdate] = await connection.execute<ResultSetHeader>("UPDATE aurionGuildGovernanceStates SET revision = ?, kingdomId = CASE WHEN ? = 'consolidate_kingdom' THEN ? ELSE kingdomId END, capitalTerritoryId = CASE WHEN ? = 'consolidate_kingdom' THEN ? ELSE capitalTerritoryId END, ruleSetVersion = ?, contentVersion = ? WHERE guildId = ? AND revision = ?", [resultingRevisionExact, plan.operation, result.kingdomId == null ? null : text(result.kingdomId, "kingdomId"), plan.operation, result.capitalTerritoryId == null ? null : text(result.capitalTerritoryId, "capitalTerritoryId"), AURION_GUILD_GOVERNANCE_RULESET_VERSION, AURION_GUILD_GOVERNANCE_CONTENT_VERSION, plan.guildId, plan.expectedRevisionExact]);
        if (stateUpdate.affectedRows !== 1) throw new Error("GUILD_REVISION_CONFLICT");
        const [consumed] = await connection.execute<ResultSetHeader>("UPDATE aurionGuildMutationPlans SET status = 'consumed', consumedAt = CURRENT_TIMESTAMP WHERE confirmationHash = ? AND status = 'planned'", [confirmationHash]);
        if (consumed.affectedRows !== 1) throw new Error("GUILD_PLAN_CONSUME_CONFLICT");
        await connection.commit();
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }

    const readback = await this.read(actorUserId, receipt.guildId);
    if (readback.revisionExact !== receipt.resultingRevisionExact) throw new Error("GUILD_GOVERNANCE_REVISION_READBACK_FAILED");
    if (replay) {
      const planRow = await this.planRow(receipt.confirmationHash);
      const stored = parseJson<GuildMutationPlan>(planRow.planJson);
      reconcileGuildGovernanceReplay(receipt, buildGuildGovernanceReceipt({ plan: stored, resultingRevisionExact: receipt.resultingRevisionExact, result: receipt.result }));
    }
    return Object.freeze({ receipt, replay, readback });
  }

  private async planRow(confirmationHash: string): Promise<PlanRow> {
    const [rows] = await this.pool.query<PlanRow[]>("SELECT confirmationHash, guildId, actorUserId, idempotencyKey, payloadHash, planJson, status, expiresAt FROM aurionGuildMutationPlans WHERE confirmationHash = ?", [confirmationHash]);
    if (!rows[0]) throw new Error("GUILD_PLAN_READBACK_MISSING");
    return rows[0];
  }

  async read(actorUserId: number, requestedGuildId?: string): Promise<GuildGovernanceReadback> {
    const connection = await this.pool.getConnection();
    try {
      const active = await membership(connection, actorUserId, requestedGuildId, false);
      const [states] = await connection.query<StateRow[]>("SELECT guildId, revision, kingdomId, capitalTerritoryId FROM aurionGuildGovernanceStates WHERE guildId = ?", [active.guildId]);
      const state = states[0] ?? ({ guildId: active.guildId, revision: "0", kingdomId: null, capitalTerritoryId: null } as StateRow);
      const [territories] = await connection.query<TerritoryRow[]>("SELECT territoryId, worldId, chunkX, chunkZ, guildId, state FROM aurionGuildTerritories WHERE guildId = ? AND state != 'released' ORDER BY territoryId", [active.guildId]);
      const [kingdoms] = await connection.query<KingdomRow[]>("SELECT id, name, rulerUserId, capitalTerritoryId, territoryDigest, revision FROM aurionGuildKingdoms WHERE guildId = ? AND status = 'active'", [active.guildId]);
      const explicit = await grants(connection, active.guildId, actorUserId);
      const kingdom = kingdoms[0] ? Object.freeze({ id: kingdoms[0].id, name: kingdoms[0].name, rulerUserId: kingdoms[0].rulerUserId, capitalTerritoryId: kingdoms[0].capitalTerritoryId, territoryDigest: kingdoms[0].territoryDigest, revisionExact: revisionOf(kingdoms[0].revision) }) : null;
      return Object.freeze({ guildId: active.guildId, actorUserId, role: active.role, revisionExact: revisionOf(state.revision), kingdom, territories: Object.freeze(territories.map(row => Object.freeze({ territoryId: row.territoryId, worldId: row.worldId, chunkX: row.chunkX, chunkZ: row.chunkZ, guildId: row.guildId, state: row.state }))), grants: Object.freeze(explicit.map(row => Object.freeze({ capability: row.capability, scopeKind: row.scopeKind, scopeId: row.scopeId, status: row.status }))) });
    } finally { connection.release(); }
  }
}
