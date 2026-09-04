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

type MembershipRow = RowDataPacket & { guildId: string; role: GuildMembershipRole; status: string };
type StateRow = RowDataPacket & { guildId: string; revision: bigint | string | number; kingdomId: string | null; capitalTerritoryId: string | null };
type GrantRow = RowDataPacket & { capability: GuildCapability; scopeKind: GuildCapabilityScopeKind; scopeId: string; status: "active" | "revoked" };
type PlanRow = RowDataPacket & { confirmationHash: string; guildId: string; actorUserId: number; operation: GuildGovernanceOperation; requiredCapability: GuildCapability; expectedRevision: bigint | string | number; idempotencyKey: string; payloadHash: string; payloadJson: string; resourcesJson: string; planJson: string; status: "planned" | "consumed" | "expired"; expiresAt: Date | string };
type TerritoryRow = RowDataPacket & GuildTerritoryCoordinate;
type ReceiptRow = RowDataPacket & { receiptId: string; guildId: string; actorUserId: number; operation: GuildGovernanceOperation; expectedRevision: bigint | string | number; resultingRevision: bigint | string | number; idempotencyKey: string; confirmationHash: string; requestHash: string; resultHash: string; resultJson: string; ruleSetVersion: typeof AURION_GUILD_GOVERNANCE_RULESET_VERSION; contentVersion: typeof AURION_GUILD_GOVERNANCE_CONTENT_VERSION };
type KingdomRow = RowDataPacket & { id: string; guildId: string; name: string; rulerUserId: number; capitalTerritoryId: string; territoryDigest: string; status: string; revision: bigint | string | number };

const revision = (value: bigint | string | number): string => BigInt(value).toString(10);
const json = <T>(value: string): T => JSON.parse(value) as T;

function receiptFromRow(row: ReceiptRow): GuildGovernanceReceipt {
  return Object.freeze({
    receiptId: row.receiptId,
    guildId: row.guildId,
    actorUserId: row.actorUserId,
    operation: row.operation,
    expectedRevisionExact: revision(row.expectedRevision),
    resultingRevisionExact: revision(row.resultingRevision),
    idempotencyKey: row.idempotencyKey,
    confirmationHash: row.confirmationHash,
    requestHash: row.requestHash,
    resultHash: row.resultHash,
    result: Object.freeze(json<Record<string, unknown>>(row.resultJson)),
    ruleSetVersion: row.ruleSetVersion,
    contentVersion: row.contentVersion,
  });
}

function scopeForPlan(plan: GuildMutationPlan): { scopeKind: GuildCapabilityScopeKind; scopeId: string } {
  if (plan.operation === "claim_territory" || plan.operation === "release_territory") return { scopeKind: "territory", scopeId: String(plan.payload.territoryId) };
  if (plan.operation === "set_diplomacy") return { scopeKind: "diplomacy", scopeId: String(plan.payload.targetGuildId) };
  if (plan.operation === "consolidate_kingdom") return { scopeKind: "kingdom", scopeId: plan.guildId };
  return { scopeKind: "guild", scopeId: plan.guildId };
}

async function activeMembership(connection: PoolConnection, actorUserId: number, guildId?: string): Promise<MembershipRow> {
  const params: unknown[] = [actorUserId];
  let sql = "SELECT guildId, role, status FROM guildMemberships WHERE userId = ? AND status = 'active'";
  if (guildId) { sql += " AND guildId = ?"; params.push(guildId); }
  sql += " ORDER BY joinedAt ASC LIMIT 2 FOR UPDATE";
  const [rows] = await connection.query<MembershipRow[]>(sql, params);
  if (rows.length !== 1) throw new Error(rows.length === 0 ? "ACTIVE_GUILD_MEMBERSHIP_REQUIRED" : "MULTIPLE_ACTIVE_GUILDS_NOT_ALLOWED");
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

async function explicitGrants(connection: PoolConnection, guildId: string, userId: number): Promise<GrantRow[]> {
  const [rows] = await connection.query<GrantRow[]>(
    "SELECT capability, scopeKind, scopeId, status FROM aurionGuildCapabilityGrants WHERE guildId = ? AND userId = ?",
    [guildId, userId],
  );
  return rows;
}

async function assertCapability(connection: PoolConnection, membership: MembershipRow, plan: GuildMutationPlan): Promise<void> {
  if (membership.role !== plan.role) throw new Error("GUILD_PLAN_ROLE_DRIFT");
  const scope = scopeForPlan(plan);
  const grants = await explicitGrants(connection, membership.guildId, plan.actorUserId);
  if (!hasGuildCapability({ role: membership.role, required: plan.requiredCapability, guildId: membership.guildId, scopeKind: scope.scopeKind, scopeId: scope.scopeId, explicit: grants })) {
    throw new Error("GUILD_CAPABILITY_REQUIRED");
  }
}

async function territoryRows(connection: PoolConnection, territoryIds: readonly string[]): Promise<TerritoryRow[]> {
  if (!territoryIds.length) return [];
  const placeholders = territoryIds.map(() => "?").join(",");
  const [rows] = await connection.query<TerritoryRow[]>(
    `SELECT territoryId, worldId, chunkX, chunkZ, guildId, state FROM aurionGuildTerritories WHERE territoryId IN (${placeholders}) ORDER BY territoryId FOR UPDATE`,
    [...territoryIds],
  );
  return rows;
}

async function preflight(connection: PoolConnection, plan: GuildMutationPlan): Promise<void> {
  if (plan.operation === "claim_territory") {
    const [rows] = await connection.query<TerritoryRow[]>("SELECT territoryId, worldId, chunkX, chunkZ, guildId, state FROM aurionGuildTerritories WHERE worldId = ? AND chunkX = ? AND chunkZ = ? FOR UPDATE", [plan.payload.worldId, plan.payload.chunkX, plan.payload.chunkZ]);
    if (rows[0] && rows[0].state !== "released") throw new Error("TERRITORY_ALREADY_OWNED");
  } else if (plan.operation === "release_territory") {
    const rows = await territoryRows(connection, [String(plan.payload.territoryId)]);
    if (rows.length !== 1 || rows[0]!.guildId !== plan.guildId || rows[0]!.state !== "active") throw new Error("ACTIVE_OWNED_TERRITORY_REQUIRED");
  } else if (plan.operation === "consolidate_kingdom") {
    const ids = plan.payload.territoryIds as readonly string[];
    validateKingdomConsolidation({ guildId: plan.guildId, plan, territories: await territoryRows(connection, ids) });
    const [kingdoms] = await connection.query<KingdomRow[]>("SELECT id, guildId, name, rulerUserId, capitalTerritoryId, territoryDigest, status, revision FROM aurionGuildKingdoms WHERE guildId = ? FOR UPDATE", [plan.guildId]);
    if (kingdoms.some(row => row.status === "active")) throw new Error("GUILD_ALREADY_HAS_ACTIVE_KINGDOM");
  } else if (plan.operation === "grant_capability") {
    await activeMembership(connection, Number(plan.payload.targetUserId), plan.guildId);
  } else if (plan.operation === "set_diplomacy") {
    if (plan.payload.targetGuildId === plan.guildId) throw new Error("GUILD_CANNOT_TARGET_ITSELF");
    const [rows] = await connection.query<RowDataPacket[]>("SELECT id FROM guilds WHERE id = ? FOR UPDATE", [plan.payload.targetGuildId]);
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
  constructor(private readonly pool: Pool) {}

  static fromDatabaseUrl(databaseUrl = process.env.DATABASE_URL): GuildGovernanceStore {
    if (!databaseUrl) throw new Error("DATABASE_URL is required for guild governance");
    return new GuildGovernanceStore(createPool(databaseUrl));
  }

  async close(): Promise<void> { await this.pool.end(); }

  async plan(actorUserId: number, input: Readonly<{ operation: GuildGovernanceOperation; expectedRevisionExact: string; idempotencyKey: string; payload: unknown }>): Promise<Readonly<{ plan: GuildMutationPlan; expiresAt: string; replay: boolean }>> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const membership = await activeMembership(connection, actorUserId);
      const state = await lockedState(connection, membership.guildId);
      const plan = buildGuildMutationPlan({ actorUserId, guildId: membership.guildId, role: membership.role, operation: input.operation, expectedRevisionExact: input.expectedRevisionExact, idempotencyKey: input.idempotencyKey, payload: input.payload });
      if (plan.expectedRevisionExact !== revision(state.revision)) throw new Error("GUILD_REVISION_CONFLICT");
      await assertCapability(connection, membership, plan);
      await preflight(connection, plan);

      const [existing] = await connection.query<PlanRow[]>("SELECT * FROM aurionGuildMutationPlans WHERE idempotencyKey = ? FOR UPDATE", [plan.idempotencyKey]);
      if (existing[0]) {
        const stored = json<GuildMutationPlan>(existing[0].planJson);
        if (stored.confirmationHash !== plan.confirmationHash || existing[0].payloadHash !== plan.payloadHash) throw new Error("GUILD_PLAN_IDEMPOTENCY_CONFLICT");
        await connection.commit();
        return Object.freeze({ plan: stored, expiresAt: new Date(existing[0].expiresAt).toISOString(), replay: true });
      }

      const expiresAt = new Date(Date.now() + PLAN_TTL_MS);
      await connection.execute(
        "INSERT INTO aurionGuildMutationPlans (confirmationHash, guildId, actorUserId, operation, requiredCapability, expectedRevision, idempotencyKey, payloadHash, payloadJson, resourcesJson, planJson, status, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'planned', ?)",
        [plan.confirmationHash, plan.guildId, plan.actorUserId, plan.operation, plan.requiredCapability, plan.expectedRevisionExact, plan.idempotencyKey, plan.payloadHash, JSON.stringify(plan.payload), JSON.stringify(plan.resources), JSON.stringify(plan), expiresAt],
      );
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
      const [plans] = await connection.query<PlanRow[]>("SELECT * FROM aurionGuildMutationPlans WHERE confirmationHash = ? FOR UPDATE", [confirmationHash]);
      const row = plans[0];
      if (!row || row.actorUserId !== actorUserId) throw new Error("GUILD_PLAN_NOT_FOUND");
      if (row.status === "consumed") {
        const [receipts] = await connection.query<ReceiptRow[]>("SELECT * FROM aurionGuildGovernanceReceipts WHERE confirmationHash = ?", [confirmationHash]);
        if (!receipts[0]) throw new Error("GUILD_RECEIPT_READBACK_MISSING");
        receipt = receiptFromRow(receipts[0]);
        replay = true;
        await connection.commit();
      } else {
        if (row.status !== "planned" || new Date(row.expiresAt).getTime() <= Date.now()) {
          throw new Error("GUILD_PLAN_EXPIRED");
        }
        const plan = json<GuildMutationPlan>(row.planJson);
        const rebuilt = buildGuildMutationPlan({ actorUserId: plan.actorUserId, guildId: plan.guildId, role: plan.role, operation: plan.operation, expectedRevisionExact: plan.expectedRevisionExact, idempotencyKey: plan.idempotencyKey, payload: plan.payload });
        if (rebuilt.confirmationHash !== row.confirmationHash || rebuilt.payloadHash !== row.payloadHash) throw new Error("GUILD_PLAN_STORAGE_DRIFT");
        const membership = await activeMembership(connection, actorUserId, plan.guildId);
        const state = await lockedState(connection, plan.guildId);
        if (revision(state.revision) !== plan.expectedRevisionExact) throw new Error("GUILD_REVISION_CONFLICT");
        await assertCapability(connection, membership, plan);
        await preflight(connection, plan);
        const resultingRevisionExact = (BigInt(plan.expectedRevisionExact) + 1n).toString(10);

        let result: Readonly<Record<string, unknown>>;
        if (plan.operation === "claim_territory") {
          result = Object.freeze({ territoryId: plan.payload.territoryId, worldId: plan.payload.worldId, chunkX: plan.payload.chunkX, chunkZ: plan.payload.chunkZ, guildId: plan.guildId, state: "active" });
        } else if (plan.operation === "release_territory") {
          result = Object.freeze({ territoryId: plan.payload.territoryId, guildId: plan.guildId, state: "released" });
        } else if (plan.operation === "grant_capability") {
          const grantId = `gcg_${guildGovernanceHash([plan.confirmationHash, plan.payload.targetUserId, plan.payload.capability, plan.payload.scopeKind, plan.payload.scopeId]).slice(0, 48)}`;
          result = Object.freeze({ grantId, guildId: plan.guildId, userId: plan.payload.targetUserId, capability: plan.payload.capability, scopeKind: plan.payload.scopeKind, scopeId: plan.payload.scopeId, status: plan.payload.grantStatus });
        } else if (plan.operation === "set_diplomacy") {
          const pactId = `gdp_${guildGovernanceHash([plan.guildId, plan.payload.targetGuildId, plan.payload.pactType]).slice(0, 48)}`;
          result = Object.freeze({ pactId, sourceGuildId: plan.guildId, targetGuildId: plan.payload.targetGuildId, pactType: plan.payload.pactType, status: plan.payload.pactStatus });
        } else {
          const kingdom = validateKingdomConsolidation({ guildId: plan.guildId, plan, territories: await territoryRows(connection, plan.payload.territoryIds as readonly string[]) });
          result = Object.freeze({ ...kingdom, guildId: plan.guildId, rulerUserId: actorUserId, status: "active" });
        }

        receipt = buildGuildGovernanceReceipt({ plan, resultingRevisionExact, result });
        if (plan.operation === "claim_territory") {
          const [updated] = await connection.execute<ResultSetHeader>(
            "UPDATE aurionGuildTerritories SET guildId = ?, state = 'active', acquiredByUserId = ?, claimReceiptId = ?, claimRevision = ? WHERE territoryId = ? AND state = 'released'",
            [plan.guildId, actorUserId, receipt.receiptId, resultingRevisionExact, plan.payload.territoryId],
          );
          if (updated.affectedRows === 0) await connection.execute(
            "INSERT INTO aurionGuildTerritories (territoryId, worldId, chunkX, chunkZ, guildId, state, acquiredByUserId, claimReceiptId, claimRevision) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)",
            [plan.payload.territoryId, plan.payload.worldId, plan.payload.chunkX, plan.payload.chunkZ, plan.guildId, actorUserId, receipt.receiptId, resultingRevisionExact],
          );
        } else if (plan.operation === "release_territory") {
          const [updated] = await connection.execute<ResultSetHeader>("UPDATE aurionGuildTerritories SET state = 'released' WHERE territoryId = ? AND guildId = ? AND state = 'active'", [plan.payload.territoryId, plan.guildId]);
          if (updated.affectedRows !== 1) throw new Error("TERRITORY_RELEASE_CONFLICT");
        } else if (plan.operation === "grant_capability") {
          await connection.execute(
            "INSERT INTO aurionGuildCapabilityGrants (id, guildId, userId, capability, scopeKind, scopeId, status, grantedByUserId, grantReceiptId, idempotencyKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), grantedByUserId = VALUES(grantedByUserId), grantReceiptId = VALUES(grantReceiptId), idempotencyKey = VALUES(idempotencyKey)",
            [result.grantId, plan.guildId, plan.payload.targetUserId, plan.payload.capability, plan.payload.scopeKind, plan.payload.scopeId, plan.payload.grantStatus, actorUserId, receipt.receiptId, plan.idempotencyKey],
          );
        } else if (plan.operation === "set_diplomacy") {
          await connection.execute(
            "INSERT INTO aurionGuildDiplomacyPacts (id, sourceGuildId, targetGuildId, pactType, status, revision, receiptId, idempotencyKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = VALUES(status), revision = VALUES(revision), receiptId = VALUES(receiptId), idempotencyKey = VALUES(idempotencyKey)",
            [result.pactId, plan.guildId, plan.payload.targetGuildId, plan.payload.pactType, plan.payload.pactStatus, resultingRevisionExact, receipt.receiptId, plan.idempotencyKey],
          );
        } else {
          await connection.execute(
            "INSERT INTO aurionGuildKingdoms (id, guildId, name, rulerUserId, capitalTerritoryId, territoryDigest, status, revision) VALUES (?, ?, ?, ?, ?, ?, 'active', ?)",
            [result.kingdomId, plan.guildId, result.name, actorUserId, result.capitalTerritoryId, result.territoryDigest, resultingRevisionExact],
          );
        }

        await connection.execute(
          "INSERT INTO aurionGuildGovernanceReceipts (receiptId, guildId, actorUserId, operation, expectedRevision, resultingRevision, idempotencyKey, confirmationHash, requestHash, resultHash, resultJson, ruleSetVersion, contentVersion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          [receipt.receiptId, receipt.guildId, receipt.actorUserId, receipt.operation, receipt.expectedRevisionExact, receipt.resultingRevisionExact, receipt.idempotencyKey, receipt.confirmationHash, receipt.requestHash, receipt.resultHash, JSON.stringify(receipt.result), receipt.ruleSetVersion, receipt.contentVersion],
        );
        const [stateUpdate] = await connection.execute<ResultSetHeader>(
          "UPDATE aurionGuildGovernanceStates SET revision = ?, kingdomId = CASE WHEN ? = 'consolidate_kingdom' THEN ? ELSE kingdomId END, capitalTerritoryId = CASE WHEN ? = 'consolidate_kingdom' THEN ? ELSE capitalTerritoryId END, ruleSetVersion = ?, contentVersion = ? WHERE guildId = ? AND revision = ?",
          [resultingRevisionExact, plan.operation, result.kingdomId ?? null, plan.operation, result.capitalTerritoryId ?? null, AURION_GUILD_GOVERNANCE_RULESET_VERSION, AURION_GUILD_GOVERNANCE_CONTENT_VERSION, plan.guildId, plan.expectedRevisionExact],
        );
        if (stateUpdate.affectedRows !== 1) throw new Error("GUILD_REVISION_CONFLICT");
        await connection.execute("UPDATE aurionGuildMutationPlans SET status = 'consumed', consumedAt = CURRENT_TIMESTAMP WHERE confirmationHash = ? AND status = 'planned'", [confirmationHash]);
        await connection.commit();
      }
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }

    const readback = await this.read(actorUserId, receipt.guildId);
    if (readback.revisionExact !== receipt.resultingRevisionExact) throw new Error("GUILD_GOVERNANCE_REVISION_READBACK_FAILED");
    if (replay) {
      const candidate = buildGuildGovernanceReceipt({ plan: json<GuildMutationPlan>((await this.planRow(receipt.confirmationHash)).planJson), resultingRevisionExact: receipt.resultingRevisionExact, result: receipt.result });
      reconcileGuildGovernanceReplay(receipt, candidate);
    }
    return Object.freeze({ receipt, replay, readback });
  }

  private async planRow(confirmationHash: string): Promise<PlanRow> {
    const [rows] = await this.pool.query<PlanRow[]>("SELECT * FROM aurionGuildMutationPlans WHERE confirmationHash = ?", [confirmationHash]);
    if (!rows[0]) throw new Error("GUILD_PLAN_READBACK_MISSING");
    return rows[0];
  }

  async read(actorUserId: number, requestedGuildId?: string): Promise<GuildGovernanceReadback> {
    const connection = await this.pool.getConnection();
    try {
      const membership = await activeMembership(connection, actorUserId, requestedGuildId);
      const [states] = await connection.query<StateRow[]>("SELECT guildId, revision, kingdomId, capitalTerritoryId FROM aurionGuildGovernanceStates WHERE guildId = ?", [membership.guildId]);
      const state = states[0] ?? { guildId: membership.guildId, revision: "0", kingdomId: null, capitalTerritoryId: null } as StateRow;
      const [territories] = await connection.query<TerritoryRow[]>("SELECT territoryId, worldId, chunkX, chunkZ, guildId, state FROM aurionGuildTerritories WHERE guildId = ? AND state != 'released' ORDER BY territoryId", [membership.guildId]);
      const [kingdoms] = await connection.query<KingdomRow[]>("SELECT id, guildId, name, rulerUserId, capitalTerritoryId, territoryDigest, status, revision FROM aurionGuildKingdoms WHERE guildId = ? AND status = 'active'", [membership.guildId]);
      const grants = await explicitGrants(connection, membership.guildId, actorUserId);
      const kingdom = kingdoms[0] ? Object.freeze({ id: kingdoms[0].id, name: kingdoms[0].name, rulerUserId: kingdoms[0].rulerUserId, capitalTerritoryId: kingdoms[0].capitalTerritoryId, territoryDigest: kingdoms[0].territoryDigest, revisionExact: revision(kingdoms[0].revision) }) : null;
      return Object.freeze({ guildId: membership.guildId, actorUserId, role: membership.role, revisionExact: revision(state.revision), kingdom, territories: Object.freeze(territories.map(row => Object.freeze({ territoryId: row.territoryId, worldId: row.worldId, chunkX: row.chunkX, chunkZ: row.chunkZ, guildId: row.guildId, state: row.state }))), grants: Object.freeze(grants.map(grant => Object.freeze({ capability: grant.capability, scopeKind: grant.scopeKind, scopeId: grant.scopeId, status: grant.status }))) });
    } finally { connection.release(); }
  }
}
