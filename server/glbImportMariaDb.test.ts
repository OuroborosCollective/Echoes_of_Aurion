import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { GlbImportStore } from "./glbImportStore";
import { buildGlbImportPlan } from "./glbImportPlan";
import { testAnimatedPlayerGlb, testGlb } from "./glbImportFixtures";

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
  it("binds an approved npc-fallback asset to a named Aurion NPC with CAS readback", async () => {
    const bytes = testAnimatedPlayerGlb("Lyra_character_questgiver", true);
    const contentBase64 = bytes.toString("base64");
    const receipt = await store.ingest(admin, {
      displayName: "Lyra Keeper of the Observatory",
      fileName: "Lyra_character_questgiver.glb",
      contentBase64,
      purpose: "npc-fallback",
      expectedPlanSha256: buildGlbImportPlan(contentBase64, "npc-fallback", "Lyra_character_questgiver.glb").planSha256,
    });
    expect(receipt.status).toBe("catalog");
    expect(receipt.targetKey).toBeNull();

    await expect(store.assignNamedNpcVisual(member, {
      assetId: receipt.assetId,
      npcId: "lyra",
      expectedActiveAssetId: null,
    })).rejects.toThrow("GLB_ADMIN_REQUIRED");

    const assigned = await store.assignNamedNpcVisual(admin, {
      assetId: receipt.assetId,
      npcId: "lyra",
      expectedActiveAssetId: null,
    });
    expect(assigned).toMatchObject({ assetId: receipt.assetId, targetKey: "npc_lyra", active: 1, changed: true });

    const catalog = await store.catalog();
    expect(catalog.entries.find(entry => entry.targetKey === "npc_lyra")).toMatchObject({
      assetId: receipt.assetId,
      sha256: receipt.sha256,
      purpose: "npc-fallback",
      assetType: "character",
    });

    await expect(store.assignNamedNpcVisual(admin, {
      assetId: receipt.assetId,
      npcId: "lyra",
      expectedActiveAssetId: "glb_wrong000",
    })).rejects.toThrow("GLB_ASSIGNMENT_CHANGED");
  }, 45_000);

  it("persists immutable external fallback provenance atomically with the admitted local GLB", async () => {
    const bytes = testGlb("Aurion_Barrel_Prop");
    const contentBase64 = bytes.toString("base64");
    const plan = buildGlbImportPlan(contentBase64, "world-environment", "Aurion_Barrel_Prop.glb");
    const externalProvenance = {
      version: "aurion.glb-external-provenance.v1" as const,
      sourceKind: "os3a-cc0" as const,
      registryRepository: "ToxSam/open-source-3D-assets" as const,
      registryRevision: "c0496c867dfa232ee5dc7ee631133d2753cf6285",
      modelRepository: "ToxSam/cc0-models-Polygonal-Mind" as const,
      modelRevision: "56db2d4088512531a070d0bf3eb9d284d077528d",
      licensePath: "License.md" as const,
      projectId: "pm-medieval-fair",
      sourceAssetId: "medieval-fair-test-barrel",
      sourcePath: "projects/medieval-fair/Aurion_Barrel_Prop.glb",
      license: "CC0-1.0" as const,
      sourceSha256: plan.sha256,
      sourceBytes: bytes.length,
      sourceMetadataSha256: "b".repeat(64),
      fallbackPlanSha256: "c".repeat(64),
    };
    const receipt = await store.ingest(admin, {
      displayName: "OS3A test barrel",
      fileName: "Aurion_Barrel_Prop.glb",
      contentBase64,
      purpose: "world-environment",
      expectedPlanSha256: plan.planSha256,
      externalProvenance,
    });
    const firstReadback = await store.externalProvenance(receipt.assetId);
    expect(firstReadback).toMatchObject({
      assetId: receipt.assetId,
      sourceKind: "os3a-cc0",
      registryRevision: externalProvenance.registryRevision,
      modelRevision: externalProvenance.modelRevision,
      sourceSha256: receipt.sha256,
      sourceBytes: bytes.length,
      fallbackPlanSha256: externalProvenance.fallbackPlanSha256,
    });
    expect(firstReadback?.receiptSha256).toMatch(/^[a-f0-9]{64}$/);

    await store.close();
    store = new GlbImportStore(process.env.DATABASE_URL!, root);
    expect(await store.externalProvenance(receipt.assetId)).toEqual(firstReadback);

    await expect(store.ingest(admin, {
      displayName: "OS3A test barrel",
      fileName: "Aurion_Barrel_Prop.glb",
      contentBase64,
      purpose: "world-environment",
      expectedPlanSha256: plan.planSha256,
      externalProvenance: { ...externalProvenance, fallbackPlanSha256: "d".repeat(64) },
    })).rejects.toThrow("GLB_EXTERNAL_PROVENANCE_READBACK_FAILED");
    expect(await store.externalProvenance(receipt.assetId)).toEqual(firstReadback);
  }, 45_000);

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
