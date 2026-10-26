import { createHash, randomBytes } from "node:crypto";
import { createPool, type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from "mysql2/promise";
import { verifyLocalPassword, DUMMY_LOCAL_AUTH_HASH } from "./localAuth";
import { AURION_PROBE_MAX_APPROVAL_MS, AURION_PROBE_SCOPES, parseAurionProbeRunIdentity, requireMatchingAurionProbeApproval, type AurionProbeRunIdentity, type AurionProbeScope } from "./aurionProductionProbeApprovalContract";

/** Reserved only for the explicitly approved, server-owned gameplay probe. */
import { AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID } from "../shared/aurionProductionProbeEvidence";
export { AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID };
const GAMEPLAY_PROBE_LOCK_NAME = "aurion-production-gameplay-probe-v1";

type ApprovalRow = RowDataPacket & { approvalId: string; runKey: string; runJson: string; scope: AurionProbeScope;
  approvedByUserId: number; purpose: string; approvedAtMs: number; expiresAtMs: number; consumedAtMs: number | null; revokedAtMs: number | null };
export function probeRunKey(run: AurionProbeRunIdentity) { return createHash("sha256").update(JSON.stringify(parseAurionProbeRunIdentity(run))).digest("hex"); }
export function probeScope(scope: unknown): AurionProbeScope {
  if (!AURION_PROBE_SCOPES.some(value => value === scope)) throw new Error("PROBE_SCOPE_INVALID");
  return scope as AurionProbeScope;
}
async function dbNow(connection: PoolConnection) {
  const [rows] = await connection.query<RowDataPacket[]>("SELECT FLOOR(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000) AS nowMs");
  const now = Number(rows[0]?.nowMs);
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("PROBE_CLOCK_INVALID");
  return now;
}
function publicRecord(row: ApprovalRow) {
  return { approvalId: row.approvalId, run: parseAurionProbeRunIdentity(JSON.parse(row.runJson)), scope: row.scope,
    purpose: row.purpose, approvedAtMs: Number(row.approvedAtMs), expiresAtMs: Number(row.expiresAtMs),
    consumedAtMs: row.consumedAtMs === null ? null : Number(row.consumedAtMs),
    revokedAtMs: row.revokedAtMs === null ? null : Number(row.revokedAtMs) };
}

/** Canonical Aurion MariaDB, no in-memory authority and no DDL at startup. */
export class AurionProductionProbeStore {
  constructor(private readonly pool: Pool) {}
  private async transaction<T>(work: (connection: PoolConnection) => Promise<T>) {
    const connection = await this.pool.getConnection();
    try { await connection.beginTransaction(); const result = await work(connection); await connection.commit(); return result; }
    catch (error) { await connection.rollback(); throw error; } finally { connection.release(); }
  }
  async approve(userId: number, password: string, rawRun: unknown, rawScope: unknown, purpose: string) {
    const run = parseAurionProbeRunIdentity(rawRun), scope = probeScope(rawScope);
    if (typeof purpose !== "string" || purpose.trim().length < 8 || purpose.length > 240
      || typeof password !== "string" || password.length < 1 || password.length > 128) throw new Error("PROBE_APPROVAL_INPUT_INVALID");
    // Return a denied result rather than throwing inside the transaction: failed
    // password counters MUST commit, otherwise attackers get unlimited attempts.
    const result = await this.transaction(async connection => {
      const now = await dbNow(connection);
      const [actors] = await connection.execute<RowDataPacket[]>(
        "SELECT u.role, c.handle, c.passwordHash, c.failedAttempts, c.lockedUntil FROM users u INNER JOIN localCredentials c ON c.userId=u.id WHERE u.id=? FOR UPDATE", [userId]);
      const actor = actors[0];
      if (!actor || actor.role !== "admin" || (actor.lockedUntil && new Date(actor.lockedUntil).getTime() > now)) {
        // Keep the scrypt cost on generic reauth rejection without granting authority.
        await verifyLocalPassword(password, DUMMY_LOCAL_AUTH_HASH);
        return null;
      }
      if (!await verifyLocalPassword(password, actor.passwordHash)) {
        await connection.execute("UPDATE localCredentials SET failedAttempts=failedAttempts+1, lockedUntil=IF(failedAttempts>=5, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE), NULL) WHERE userId=?", [userId]);
        return null;
      }
      await connection.execute("UPDATE localCredentials SET failedAttempts=0, lockedUntil=NULL WHERE userId=?", [userId]);
      const approvalId = randomBytes(16).toString("hex"), expiresAtMs = now + AURION_PROBE_MAX_APPROVAL_MS;
      await connection.execute("INSERT INTO aurionProductionProbeApprovals (approvalId,runKey,runJson,scope,approvedByUserId,purpose,approvedAtMs,expiresAtMs) VALUES (?,?,?,?,?,?,?,?)",
        [approvalId, probeRunKey(run), JSON.stringify(run), scope, userId, purpose.trim(), now, expiresAtMs]);
      return { approvalId, run, scope, purpose: purpose.trim(), approvedAtMs: now, expiresAtMs, consumedAtMs: null, revokedAtMs: null };
    });
    if (!result) throw new Error("PROBE_ADMIN_REAUTH_REQUIRED");
    return result;
  }
  async list(userId: number) {
    const [rows] = await this.pool.execute<ApprovalRow[]>("SELECT a.* FROM aurionProductionProbeApprovals a INNER JOIN users u ON u.id=a.approvedByUserId WHERE u.id=? AND u.role='admin' ORDER BY a.approvedAtMs DESC LIMIT 25", [userId]);
    return rows.map(publicRecord);
  }
  async revoke(userId: number, approvalId: string) {
    if (!/^[a-f0-9]{32}$/.test(approvalId)) throw new Error("PROBE_APPROVAL_INPUT_INVALID");
    return this.transaction(async connection => {
      // Same row lock order as consume: approval first, current user second.
      const [rows] = await connection.execute<ApprovalRow[]>("SELECT * FROM aurionProductionProbeApprovals WHERE approvalId=? FOR UPDATE", [approvalId]);
      const row = rows[0];
      const [actors] = await connection.execute<RowDataPacket[]>("SELECT role FROM users WHERE id=? FOR UPDATE", [userId]);
      if (!row || row.approvedByUserId !== userId || actors[0]?.role !== "admin" || row.consumedAtMs !== null || row.revokedAtMs !== null) throw new Error("PROBE_REVOCATION_DENIED");
      await connection.execute("UPDATE aurionProductionProbeApprovals SET revokedAtMs=? WHERE approvalId=?", [await dbNow(connection), approvalId]);
      return { approvalId, revoked: true };
    });
  }
  /**
   * Serialize the one effectful probe across every runtime process. The reserved
   * actor must never collide with an actual Aurion account; otherwise fail closed.
   * The named lock is held for the complete join/readback/leave sequence.
   */
  async withExclusiveGameplayProbeSession<T>(work: () => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection();
    let locked = false;
    let fenced = false;
    const ownerId = randomBytes(16).toString("hex");
    try {
      const [lockRows] = await connection.execute<RowDataPacket[]>("SELECT GET_LOCK(?, 0) AS acquired", [GAMEPLAY_PROBE_LOCK_NAME]);
      if (Number(lockRows[0]?.acquired) !== 1) throw new Error("PROBE_GAMEPLAY_SESSION_BUSY");
      locked = true;
      const [actors] = await connection.execute<RowDataPacket[]>("SELECT id FROM users WHERE id=? LIMIT 1", [AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID]);
      if (actors.length !== 0) throw new Error("PROBE_GAMEPLAY_ACTOR_COLLISION");
      // Autocommitted before any effect. Unlike GET_LOCK, this survives a lost
      // connection or process. An orphan requires operator recovery; never steal it.
      try {
        await connection.execute("INSERT INTO aurionProductionProbeSessionFence (fenceName,ownerId,createdAtMs) VALUES (?,?,?)", [GAMEPLAY_PROBE_LOCK_NAME, ownerId, await dbNow(connection)]);
        fenced = true;
      } catch (error) {
        if ((error as { code?: string }).code === "ER_DUP_ENTRY") throw new Error("PROBE_GAMEPLAY_SESSION_BUSY");
        throw error;
      }
      return await work();
    } finally {
      if (locked) {
        try { await connection.execute("SELECT RELEASE_LOCK(?)", [GAMEPLAY_PROBE_LOCK_NAME]); }
        catch { /* The durable fence remains authoritative after connection loss. */ }
        finally { connection.release(); }
      } else connection.release();
      // work() must not settle until effectful cleanup is durably read back.
      // Release the dedicated connection first so a one-connection pool can recover.
      if (fenced) {
        const [removed] = await this.pool.execute<ResultSetHeader>("DELETE FROM aurionProductionProbeSessionFence WHERE fenceName=? AND ownerId=?", [GAMEPLAY_PROBE_LOCK_NAME, ownerId]);
        if (removed.affectedRows !== 1) throw new Error("PROBE_GAMEPLAY_FENCE_LOST");
      }
    }
  }
  /** Public bootstrap status only proves that the deployed control-plane table exists. */
  async isReady() {
    const [rows] = await this.pool.query<RowDataPacket[]>("SELECT 1 AS ready FROM aurionProductionProbeApprovals LIMIT 1");
    await this.pool.query("SELECT fenceName FROM aurionProductionProbeSessionFence LIMIT 1");
    return Number(rows[0]?.ready ?? 1) === 1;
  }
  /**
   * Non-authoritative and read-only precheck: fail closed before expensive zone
   * hydration when the separately approved gameplay scope is unavailable.
   * Only consume() under the exclusive gameplay session grants permission.
   */
  async requirePendingGameplayApproval(verifiedRun: AurionProbeRunIdentity): Promise<void> {
    if (!await this.hasPendingGameplayApproval(verifiedRun)) throw new Error("PROBE_GAMEPLAY_APPROVAL_REQUIRED");
  }
  /** Observation only; never grants authority and never updates approval rows. */
  async hasPendingGameplayApproval(verifiedRun: AurionProbeRunIdentity): Promise<boolean> {
    const run = parseAurionProbeRunIdentity(verifiedRun);
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      "SELECT a.approvalId FROM aurionProductionProbeApprovals a INNER JOIN users u ON u.id=a.approvedByUserId " +
      "WHERE a.runKey=? AND a.scope=? AND a.consumedAtMs IS NULL AND a.revokedAtMs IS NULL " +
      "AND a.expiresAtMs>FLOOR(UNIX_TIMESTAMP(CURRENT_TIMESTAMP(3))*1000) AND u.role='admin' LIMIT 1",
      [probeRunKey(run), "aurion.probe.gameplay-session-readback"]);
    return rows.length === 1;
  }
  async consume(verifiedRun: AurionProbeRunIdentity, rawScope: unknown) {
    const run = parseAurionProbeRunIdentity(verifiedRun), scope = probeScope(rawScope);
    return this.transaction(async connection => {
      const [rows] = await connection.execute<ApprovalRow[]>("SELECT * FROM aurionProductionProbeApprovals WHERE runKey=? AND scope=? FOR UPDATE", [probeRunKey(run), scope]);
      const row = rows[0];
      if (!row || row.revokedAtMs !== null) throw new Error("PROBE_APPROVAL_REQUIRED");
      const [actors] = await connection.execute<RowDataPacket[]>("SELECT role FROM users WHERE id=? FOR UPDATE", [row.approvedByUserId]);
      if (actors[0]?.role !== "admin") throw new Error("PROBE_APPROVER_NO_LONGER_ADMIN");
      const now = await dbNow(connection), stored = publicRecord(row);
      const bound = requireMatchingAurionProbeApproval({ approvalId: stored.approvalId, run: stored.run,
        approvedByUserId: row.approvedByUserId, approvedByRole: actors[0].role, decision: "approved",
        approvedAtMs: stored.approvedAtMs, expiresAtMs: stored.expiresAtMs, consumedAtMs: stored.consumedAtMs, scopes: [stored.scope] }, run, scope, now);
      const [updated] = await connection.execute<ResultSetHeader>("UPDATE aurionProductionProbeApprovals SET consumedAtMs=? WHERE approvalId=? AND consumedAtMs IS NULL AND revokedAtMs IS NULL AND expiresAtMs>?", [now, row.approvalId, now]);
      if (updated.affectedRows !== 1) throw new Error("PROBE_APPROVAL_ALREADY_CONSUMED");
      return { ...bound, consumedAtMs: now, mutationAuthority: "none" as const };
    });
  }
}
let store: AurionProductionProbeStore | undefined;
export function productionProbeStore() {
  if (!process.env.DATABASE_URL) throw new Error("PROBE_DATABASE_UNAVAILABLE");
  return store ??= new AurionProductionProbeStore(createPool({ uri: process.env.DATABASE_URL, connectionLimit: 4 }));
}
