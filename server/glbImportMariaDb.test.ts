import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GlbImportStore } from "./glbImportStore";
import { buildGlbImportPlan } from "./glbImportPlan";
import { testGlb } from "./glbImportFixtures";

const enabled = process.env.AURION_GLB_DB_TEST === "1";
describe.skipIf(!enabled)("GLB import with real MariaDB and durable files", () => {
  let pool: Pool, store: GlbImportStore, root: string, admin: number, member: number;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/aurion_glb_test") throw new Error("ISOLATED_GLB_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    expect(rows[0].name).toBe("aurion_glb_test");
    const [a] = await pool.execute<ResultSetHeader>("INSERT INTO users (openId, role) VALUES ('isolated-glb-admin', 'admin')"); admin = a.insertId;
    const [m] = await pool.execute<ResultSetHeader>("INSERT INTO users (openId, role) VALUES ('isolated-glb-member', 'user')"); member = m.insertId;
    root = await mkdtemp(path.join(tmpdir(), "aurion-glb-db-"));
    store = new GlbImportStore(process.env.DATABASE_URL!, root);
  });
  afterAll(async () => {
    if (store) await store.close();
    if (pool) {
      await pool.execute("DELETE FROM glbAssignments WHERE assignedByUserId = ?", [admin]);
      await pool.execute("DELETE FROM glbAssets WHERE createdByUserId = ?", [admin]);
      await pool.execute("DELETE FROM users WHERE id IN (?, ?)", [admin, member]);
      await pool.end();
    }
    if (root) await rm(root, { recursive: true, force: true });
  });
  it("serializes duplicate intake, preserves occupied slots, checks CAS and survives a new store instance", async () => {
    const bytes = testGlb(); const contentBase64 = bytes.toString("base64");
    const input = { displayName: "Isolated spear", contentBase64, expectedPlanSha256: buildGlbImportPlan(contentBase64).planSha256 };
    await expect(store.ingest(member, input)).rejects.toThrow("GLB_ADMIN_REQUIRED");
    await expect(store.ingest(admin, { ...input, expectedPlanSha256: "0".repeat(64) })).rejects.toThrow("GLB_IMPORT_PLAN_CHANGED");
    const receipts = await Promise.all([store.ingest(admin, input), store.ingest(admin, input), store.ingest(admin, input)]);
    expect(new Set(receipts.map(value => value.assetId)).size).toBe(1);
    expect(receipts.filter(value => !value.deduplicated)).toHaveLength(1);
    expect(receipts.every(value => value.status === "assigned")).toBe(true);
    const [persisted] = await pool.query<RowDataPacket[]>("SELECT g.sha256, g.bytes, a.active FROM glbAssets g JOIN glbAssignments a ON a.assetId=g.id WHERE g.id=?", [receipts[0].assetId]);
    expect(persisted).toEqual([expect.objectContaining({ sha256: receipts[0].sha256, bytes: bytes.length, active: 1 })]);
    await store.close(); store = new GlbImportStore(process.env.DATABASE_URL!, root);
    expect(await store.approvedBytes(receipts[0].sha256)).toEqual(bytes);
    const second = await store.ingest(admin, { displayName: "Other spear", contentBase64: testGlb("Other_Spear_Weapon").toString("base64") });
    expect(second.status).toBe("conflict"); expect(second.activeAssetId).toBe(receipts[0].assetId);
    const assignment = { assetId: second.assetId, targetType: "weapon", targetKey: "weapon_spear", expectedActiveAssetId: receipts[0].assetId };
    await expect(store.assign(member, assignment)).rejects.toThrow("GLB_ADMIN_REQUIRED");
    await expect(store.assign(admin, { ...assignment, expectedActiveAssetId: null })).rejects.toThrow("GLB_ASSIGNMENT_CHANGED");
    await store.assign(admin, assignment);
    const catalog = await store.catalog();
    expect(catalog.entries.find(entry => entry.targetKey === "weapon_spear")?.assetId).toBe(second.assetId);
    expect((await store.catalog()).revision).toBe(catalog.revision);
    await store.review(admin, { assetId: second.assetId, status: "archived" });
    expect(await store.approvedBytes(second.sha256)).toBeNull();
    expect((await store.catalog()).entries.some(entry => entry.assetId === second.assetId)).toBe(false);
    expect((await store.ingest(admin, { displayName: "Other spear", contentBase64: testGlb("Other_Spear_Weapon").toString("base64") })).status).toBe("archived");
    const [active] = await pool.query<RowDataPacket[]>("SELECT COUNT(*) AS count FROM glbAssignments WHERE assetId=? AND active=1", [second.assetId]);
    expect(Number(active[0].count)).toBe(0);
  }, 45_000);
});
