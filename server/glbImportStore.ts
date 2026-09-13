import { createHash } from "node:crypto";
import { createPool, type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { operationalDate } from "../shared/operationalClock";
import {
  EQUIPMENT_DISPLAY_PREFIX,
  GLB_IMPORT_VERSION,
  NPC_FALLBACK_DISPLAY_PREFIX,
  PUBLIC_PLAYER_DISPLAY_PREFIX,
  WORLD_ENVIRONMENT_DISPLAY_PREFIX,
  WORLD_NATURE_DISPLAY_PREFIX,
  glbImportReceiptSchema,
  glbLodDescriptor,
  glbPurposeFromDisplayName,
  glbRuntimeCatalogSchema,
  type GlbImportPurpose,
  type GlbImportReceipt,
} from "../shared/glbImportContract";
import { buildGlbImportPlan } from "./glbImportPlan";
import { persistGlbBytes, readStoredGlb } from "./glbFileStore";
import type { GlbAssetClassification } from "./glbAssetClassifier";
import { groupGlbCatalogRows } from "./glbCatalogFamilies";

const PURPOSE_PREFIXES = [
  NPC_FALLBACK_DISPLAY_PREFIX,
  WORLD_ENVIRONMENT_DISPLAY_PREFIX,
  WORLD_NATURE_DISPLAY_PREFIX,
  PUBLIC_PLAYER_DISPLAY_PREFIX,
  EQUIPMENT_DISPLAY_PREFIX,
] as const;

const MAX_LOGICAL_CATALOG_MODELS = 500;
// Keep the existing admission ceiling until a separate quota migration is
// explicitly designed. LOD families reduce visible catalog rows without
// silently expanding how many approved physical GLBs production accepts.
const MAX_PHYSICAL_CATALOG_GLBS = MAX_LOGICAL_CATALOG_MODELS;

function stripPurposePrefix(displayName: string): string {
  const trimmed = displayName.trim();
  for (const prefix of PURPOSE_PREFIXES) {
    if (!trimmed.startsWith(prefix)) continue;
    const remainder = trimmed.slice(prefix.length).trim();
    if (prefix === EQUIPMENT_DISPLAY_PREFIX || prefix === WORLD_ENVIRONMENT_DISPLAY_PREFIX || prefix === WORLD_NATURE_DISPLAY_PREFIX) {
      const parts = remainder.split(" · ");
      return parts.length > 1 ? parts.slice(1).join(" · ").trim() : remainder;
    }
    return remainder;
  }
  return trimmed;
}

function canonicalDisplayName(displayName: string, purpose: GlbImportPurpose, classification: GlbAssetClassification): string {
  const base = stripPurposePrefix(displayName);
  const prefix = purpose === "npc-fallback"
    ? NPC_FALLBACK_DISPLAY_PREFIX
    : purpose === "world-environment"
      ? `${WORLD_ENVIRONMENT_DISPLAY_PREFIX}${classification.subcategory} · `
      : purpose === "world-nature"
        ? `${WORLD_NATURE_DISPLAY_PREFIX}${classification.subcategory} · `
        : purpose === "player-public"
          ? PUBLIC_PLAYER_DISPLAY_PREFIX
          : purpose === "equipment"
            ? `${EQUIPMENT_DISPLAY_PREFIX}${classification.equipmentSlot} · `
            : "";
  const result = `${prefix}${base}`.slice(0, 120).trim();
  if (result.length < 3 || result.length > 120 || /[<>]/.test(result)) throw new Error("GLB_NAME_INVALID");
  return result;
}

export class GlbImportStore {
  private readonly pool: Pool;
  private readonly lockName: string;
  constructor(databaseUrl: string, private readonly storageRoot?: string) {
    this.pool = createPool({ uri: databaseUrl, connectionLimit: 3, waitForConnections: true, queueLimit: 12, connectTimeout: 8000 });
    this.lockName = `aurion-glb-${createHash("sha256").update(new URL(databaseUrl).pathname).digest("hex").slice(0, 32)}`;
  }
  async close() { await this.pool.end(); }

  private async locked<T>(actorUserId: number, operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
    const connection = await this.pool.getConnection(); let acquired = false;
    try {
      const [lock] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(?, 8) AS acquired", [this.lockName]);
      if (lock[0]?.acquired !== 1) throw new Error("GLB_IMPORT_BUSY");
      acquired = true;
      await connection.beginTransaction();
      const [users] = await connection.query<RowDataPacket[]>("SELECT id, role FROM users WHERE id = ? FOR UPDATE", [actorUserId]);
      if (users[0]?.role !== "admin") throw new Error("GLB_ADMIN_REQUIRED");
      const result = await operation(connection);
      await connection.commit(); return result;
    } catch (error) { await connection.rollback(); throw error; }
    finally {
      if (acquired) await connection.query("SELECT RELEASE_LOCK(?)", [this.lockName]).catch(() => undefined);
      connection.release();
    }
  }

  async ingest(actorUserId: number, input: { displayName: string; contentBase64: string; purpose?: GlbImportPurpose; fileName?: string; expectedPlanSha256?: string }): Promise<GlbImportReceipt> {
    const purpose = input.purpose ?? "auto";
    const plan = buildGlbImportPlan(input.contentBase64, purpose, input.fileName ?? input.displayName);
    if (input.expectedPlanSha256 && plan.planSha256 !== input.expectedPlanSha256) throw new Error("GLB_IMPORT_PLAN_CHANGED");
    const displayName = canonicalDisplayName(input.displayName, purpose, plan.classification);
    return this.locked(actorUserId, async connection => {
      const [existing] = await connection.query<RowDataPacket[]>("SELECT * FROM glbAssets WHERE sha256 = ? FOR UPDATE", [plan.sha256]);
      const storageKey = `local-glb/${plan.sha256}.glb`;
      if (existing[0] && existing[0].storageKey !== storageKey) throw new Error("GLB_EXISTING_ASSET_REQUIRES_REVIEW");
      if (existing[0] && (existing[0].assetType !== plan.assetType || existing[0].bytes !== plan.bytes)) throw new Error("GLB_METADATA_DRIFT");
      if (existing[0] && glbPurposeFromDisplayName(String(existing[0].displayName)) !== purpose) throw new Error("GLB_IMPORT_PURPOSE_CHANGED");
      const stored = { key: storageKey, url: `/api/assets/glb/${plan.sha256}.glb` };
      const assetId = existing[0]?.id ?? plan.assetId;
      if (!existing.length) {
        const [count] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM glbAssets WHERE storageKey LIKE 'local-glb/%' AND status = 'approved'");
        if (Number(count[0]?.count) >= MAX_PHYSICAL_CATALOG_GLBS) throw new Error("GLB_CATALOG_LIMIT");
        await persistGlbBytes(Buffer.from(input.contentBase64, "base64"), plan.sha256, this.storageRoot);
        await connection.execute("INSERT INTO glbAssets (id, displayName, assetType, storageKey, storageUrl, sha256, bytes, status, createdByUserId, reviewedByUserId, reviewedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?)", [assetId, displayName, plan.assetType, stored.key, stored.url, plan.sha256, plan.bytes, actorUserId, actorUserId, operationalDate()]);
      } else {
        await persistGlbBytes(Buffer.from(input.contentBase64, "base64"), plan.sha256, this.storageRoot);
      }
      const archived = existing[0] && existing[0].status !== "approved";
      let activeAssetId: string | null = null;
      let status: GlbImportReceipt["status"] = archived ? "archived" : "catalog";
      if (plan.targetKey && !archived) {
        const [active] = await connection.query<RowDataPacket[]>("SELECT a.assetId FROM glbAssignments a INNER JOIN glbAssets g ON g.id = a.assetId WHERE a.targetType = ? AND a.targetKey = ? AND a.active = 1 AND g.status = 'approved' ORDER BY a.id FOR UPDATE", [plan.assetType, plan.targetKey]);
        if (active.length > 1) throw new Error("GLB_ASSIGNMENT_DRIFT");
        activeAssetId = active[0]?.assetId ?? null;
        if (activeAssetId && activeAssetId !== assetId) status = "conflict";
        else {
          if (!activeAssetId) {
            await connection.execute("UPDATE glbAssignments SET active = 0 WHERE targetType = ? AND targetKey = ? AND active = 1", [plan.assetType, plan.targetKey]);
            const assignmentId = `assign_${createHash("sha256").update(`${plan.assetType}:${plan.targetKey}:${plan.sha256}`).digest("hex").slice(0, 48)}`;
            await connection.execute("INSERT INTO glbAssignments (id, assetId, targetType, targetKey, active, assignedByUserId) VALUES (?, ?, ?, ?, 1, ?) ON DUPLICATE KEY UPDATE active = 1", [assignmentId, assetId, plan.assetType, plan.targetKey, actorUserId]);
          }
          activeAssetId = assetId; status = "assigned";
        }
      }
      const [readback] = await connection.query<RowDataPacket[]>("SELECT id, sha256, bytes, storageUrl, displayName FROM glbAssets WHERE id = ?", [assetId]);
      const row = readback[0];
      if (!row || row.sha256 !== plan.sha256 || row.bytes !== plan.bytes || row.storageUrl !== stored.url || glbPurposeFromDisplayName(String(row.displayName)) !== purpose) throw new Error("GLB_IMPORT_READBACK_FAILED");
      return glbImportReceiptSchema.parse({ version: GLB_IMPORT_VERSION, assetId, sha256: row.sha256, bytes: row.bytes, storageUrl: row.storageUrl, assetType: plan.assetType, targetKey: plan.targetKey, planSha256: plan.planSha256, status, activeAssetId, deduplicated: Boolean(existing.length) });
    });
  }

  async catalog() {
    const [rows] = await this.pool.query<RowDataPacket[]>(`SELECT g.id AS assetId, g.sha256, g.bytes, g.displayName, g.assetType, g.storageUrl, a.targetKey
      FROM glbAssets g
      LEFT JOIN glbAssignments a ON a.assetId = g.id AND a.active = 1
      WHERE g.status = 'approved' AND g.storageKey LIKE 'local-glb/%'
      ORDER BY g.sha256, a.targetKey
      LIMIT ${MAX_PHYSICAL_CATALOG_GLBS + 1}`);
    if (rows.length > MAX_PHYSICAL_CATALOG_GLBS) throw new Error("GLB_CATALOG_LIMIT");
    const entries = groupGlbCatalogRows(rows.map(row => ({
      assetId: String(row.assetId),
      sha256: String(row.sha256),
      bytes: Number(row.bytes),
      displayName: String(row.displayName),
      assetType: row.assetType,
      storageUrl: String(row.storageUrl),
      targetKey: row.targetKey === null || row.targetKey === undefined ? null : String(row.targetKey),
    })));
    return glbRuntimeCatalogSchema.parse({ version: GLB_IMPORT_VERSION, revision: createHash("sha256").update(JSON.stringify(entries)).digest("hex"), entries });
  }

  /** Marks one existing approved physical GLB as the immutable LOD0 member of a
   * logical family. Bytes, SHA, assignment and asset identity stay untouched. */
  async enableLodFamily(actorUserId: number, assetId: string) {
    return this.locked(actorUserId, async connection => {
      const [rows] = await connection.query<RowDataPacket[]>("SELECT id, displayName, status, storageKey, sha256 FROM glbAssets WHERE id = ? FOR UPDATE", [assetId]);
      const asset = rows[0];
      if (!asset || asset.status !== "approved" || !String(asset.storageKey).startsWith("local-glb/")) throw new Error("GLB_APPROVED_LOCAL_ASSET_REQUIRED");
      const descriptor = glbLodDescriptor(String(asset.displayName));
      if (descriptor.lodLevel !== null) {
        if (descriptor.lodLevel !== 0) throw new Error("GLB_LOD0_REQUIRED");
        return Object.freeze({ assetId: String(asset.id), sha256: String(asset.sha256), displayName: String(asset.displayName), lodLevel: 0 as const, changed: false });
      }
      const displayName = `${String(asset.displayName)} LOD0`;
      if (displayName.length > 120) throw new Error("GLB_LOD_FAMILY_NAME_TOO_LONG");
      await connection.execute("UPDATE glbAssets SET displayName = ? WHERE id = ?", [displayName, assetId]);
      const [readback] = await connection.query<RowDataPacket[]>("SELECT id, displayName, sha256 FROM glbAssets WHERE id = ?", [assetId]);
      if (readback[0]?.displayName !== displayName || readback[0]?.sha256 !== asset.sha256) throw new Error("GLB_LOD_FAMILY_READBACK_FAILED");
      return Object.freeze({ assetId: String(asset.id), sha256: String(asset.sha256), displayName, lodLevel: 0 as const, changed: true });
    });
  }

  async assign(actorUserId: number, input: { assetId: string; targetType: string; targetKey: string; expectedActiveAssetId: string | null }) {
    return this.locked(actorUserId, async connection => {
      const [assets] = await connection.query<RowDataPacket[]>("SELECT * FROM glbAssets WHERE id = ? FOR UPDATE", [input.assetId]);
      const asset = assets[0];
      if (!asset || asset.status !== "approved" || asset.assetType !== input.targetType) throw new Error("GLB_APPROVED_MATCHING_ASSET_REQUIRED");
      if (glbPurposeFromDisplayName(String(asset.displayName)) !== "auto") throw new Error("GLB_PURPOSE_ASSIGNMENT_FORBIDDEN");
      if (!/^[A-Za-z0-9_-]{2,120}$/.test(input.targetKey)) throw new Error("GLB_TARGET_INVALID");
      if (asset.storageKey.startsWith("local-glb/")) {
        const bytes = await readStoredGlb(asset.sha256, this.storageRoot);
        if (buildGlbImportPlan(bytes.toString("base64")).targetKey !== input.targetKey) throw new Error("GLB_TARGET_MISMATCH");
      }
      const [active] = await connection.query<RowDataPacket[]>("SELECT id, assetId FROM glbAssignments WHERE targetType = ? AND targetKey = ? AND active = 1 ORDER BY id FOR UPDATE", [input.targetType, input.targetKey]);
      if (active.length > 1) throw new Error("GLB_ASSIGNMENT_DRIFT");
      const previous = active[0];
      if ((previous?.assetId ?? null) !== input.expectedActiveAssetId) throw new Error("GLB_ASSIGNMENT_CHANGED");
      if (previous?.assetId === asset.id) return { assetId: asset.id, targetKey: input.targetKey, active: 1 };
      const id = `assign_${createHash("sha256").update(`${previous?.id ?? "empty"}:${input.targetType}:${input.targetKey}:${asset.sha256}`).digest("hex").slice(0, 48)}`;
      await connection.execute("UPDATE glbAssignments SET active = 0 WHERE targetType = ? AND targetKey = ? AND active = 1", [input.targetType, input.targetKey]);
      await connection.execute("INSERT INTO glbAssignments (id, assetId, targetType, targetKey, active, assignedByUserId) VALUES (?, ?, ?, ?, 1, ?)", [id, asset.id, input.targetType, input.targetKey, actorUserId]);
      return { assetId: asset.id, targetKey: input.targetKey, active: 1 };
    });
  }

  async review(actorUserId: number, input: { assetId: string; status: "approved" | "rejected" | "archived" }) {
    return this.locked(actorUserId, async connection => {
      const [assets] = await connection.query<RowDataPacket[]>("SELECT * FROM glbAssets WHERE id = ? FOR UPDATE", [input.assetId]);
      if (!assets[0]) throw new Error("GLB_ASSET_MISSING");
      if (input.status === "approved" && assets[0].storageKey.startsWith("local-glb/")) {
        await readStoredGlb(assets[0].sha256, this.storageRoot);
        if (assets[0].status !== "approved") {
          const [count] = await connection.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM glbAssets WHERE storageKey LIKE 'local-glb/%' AND status = 'approved'");
          if (Number(count[0]?.count) >= MAX_PHYSICAL_CATALOG_GLBS) throw new Error("GLB_CATALOG_LIMIT");
        }
      }
      await connection.execute("UPDATE glbAssets SET status = ?, reviewedByUserId = ?, reviewedAt = ? WHERE id = ?", [input.status, actorUserId, operationalDate(), input.assetId]);
      if (input.status !== "approved") await connection.execute("UPDATE glbAssignments SET active = 0 WHERE assetId = ?", [input.assetId]);
      const [rows] = await connection.query<RowDataPacket[]>("SELECT * FROM glbAssets WHERE id = ?", [input.assetId]);
      return rows[0];
    });
  }

  async approvedBytes(sha256: string): Promise<Buffer | null> {
    if (!/^[a-f0-9]{64}$/.test(sha256)) return null;
    const [rows] = await this.pool.query<RowDataPacket[]>("SELECT id FROM glbAssets WHERE sha256 = ? AND storageKey = ? AND status = 'approved' LIMIT 1", [sha256, `local-glb/${sha256}.glb`]);
    if (!rows.length) return null;
    return readStoredGlb(sha256, this.storageRoot);
  }
}

let singleton: GlbImportStore | undefined;
export function glbImportStore(): GlbImportStore {
  if (!process.env.DATABASE_URL) throw new Error("GLB_DATABASE_UNAVAILABLE");
  return singleton ??= new GlbImportStore(process.env.DATABASE_URL);
}
