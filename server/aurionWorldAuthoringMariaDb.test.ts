import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createPool, type Pool, type ResultSetHeader, type RowDataPacket } from "mysql2/promise";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WorldDesignDraftSchema, WorldDesignPlanSchema, type WorldDesignDraft } from "../shared/aurionAuthoringContract";
import { GLOBAL_WORLD_ID } from "../shared/worldIdentity";
import { stableCatalogStringify } from "./aurionAx1ContentCatalog";
import { applyWorldDesign, authoringHash, planWorldDesign, readActiveWorldDesign } from "./aurionAuthoringPersistence";
import { buildGlbImportPlan } from "./glbImportPlan";
import { testGlb } from "./glbImportFixtures";
import { glbImportStore } from "./glbImportStore";
import { reviewPlayerGlbSubmission } from "./db";
import * as storage from "./storage";

vi.mock("./storage", async importOriginal => ({
  ...await importOriginal<typeof import("./storage")>(),
  storageGetSignedUrl: vi.fn(),
}));

const enabled = process.env.AURION_WORLD_AUTHORING_DB_TEST === "1";
describe.skipIf(!enabled)("world authoring against isolated MariaDB", () => {
  let pool: Pool;
  let admin = 0;
  let otherAdmin = 0;
  let assetId = "";
  let assetHash = "";
  let catalogRevision = "";
  let root = "";
  let store: ReturnType<typeof glbImportStore>;

  function draft(designKey: string, version = 1): WorldDesignDraft {
    return WorldDesignDraftSchema.parse({
      schemaVersion: "aurion.world-design.v1", designKey, version,
      title: "Isolated world design", expectedCatalogRevision: catalogRevision,
      placements: [{ placementKey: "fixture-barrel", assetId, chunkX: 0, chunkZ: 0,
        xMm: 32000, zMm: 32000, rotationQuarterTurns: 0, scalePermille: 1000 }],
    });
  }

  async function seedLegacy(designKey: string) {
    const identity = { ...draft(designKey), referencedAssetHashes: [assetHash], requiresHumanConfirmation: true as const };
    const plan = { ...identity, planHash: authoringHash(identity) };
    // Historical plans have no predecessor field and their stored hashes must remain valid.
    expect(WorldDesignPlanSchema.parse(plan)).toEqual(plan);
    const designHash = authoringHash({ schemaVersion: "aurion.world-design.v1", plan });
    await pool.execute(
      "INSERT INTO aurionWorldDesignVersions (id, designKey, version, worldId, title, expectedCatalogRevision, designJson, designHash, active, createdByUserId) VALUES (?, ?, 1, ?, ?, ?, ?, ?, 1, ?)",
      [`${designKey}:v1`, designKey, GLOBAL_WORLD_ID, plan.title, catalogRevision, stableCatalogStringify(plan), designHash, admin],
    );
    return designHash;
  }

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || url.pathname !== "/aurion_authoring_test") throw new Error("ISOLATED_WORLD_AUTHORING_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
    const [database] = await pool.query<RowDataPacket[]>("SELECT DATABASE() AS name");
    expect(database[0]?.name).toBe("aurion_authoring_test");
    const [user] = await pool.execute<ResultSetHeader>("INSERT INTO users (openId, role) VALUES ('isolated-world-authoring-admin', 'admin')");
    admin = user.insertId;
    const [other] = await pool.execute<ResultSetHeader>("INSERT INTO users (openId, role) VALUES ('isolated-world-authoring-other-admin', 'admin')");
    otherAdmin = other.insertId;
    root = await mkdtemp(path.join(tmpdir(), "aurion-world-authoring-"));
    process.env.AURION_GLB_STORAGE_DIR = root;
    store = glbImportStore();
    const contentBase64 = testGlb("Aurion_Barrel_Prop").toString("base64");
    const upload = await buildGlbImportPlan(contentBase64, "world-environment", "Aurion_Barrel_Prop.glb");
    const asset = await store.ingest(admin, { displayName: "Isolated barrel", fileName: "Aurion_Barrel_Prop.glb", contentBase64,
      purpose: "world-environment", expectedPlanSha256: upload.planSha256 });
    assetId = asset.assetId;
    assetHash = asset.sha256;
    catalogRevision = (await store.catalog()).revision;
  }, 45_000);

  afterEach(async () => {
    vi.restoreAllMocks();
    await pool.execute("DELETE FROM glbAssetSubmissions WHERE submittedByUserId = ?", [otherAdmin]);
    await pool.execute("DELETE FROM glbAssets WHERE createdByUserId = ?", [otherAdmin]);
    await pool.execute("DELETE FROM aurionAuthoringReceipts WHERE actorUserId IN (?, ?)", [admin, otherAdmin]);
    await pool.execute("DELETE FROM aurionWorldDesignVersions WHERE createdByUserId IN (?, ?)", [admin, otherAdmin]);
    await pool.execute("UPDATE users SET role = 'admin' WHERE id = ?", [admin]);
    await pool.execute("UPDATE users SET role = 'admin' WHERE id = ?", [otherAdmin]);
  });

  afterAll(async () => {
    if (pool) {
      await pool.execute("DELETE FROM glbAssignments WHERE assignedByUserId = ?", [admin]);
      await pool.execute("DELETE FROM glbAssets WHERE createdByUserId = ?", [admin]);
      await pool.execute("DELETE FROM users WHERE id IN (?, ?)", [admin, otherAdmin]);
      await pool.end();
    }
    if (store) await store.close();
    if (root) await rm(root, { recursive: true, force: true });
  });

  it("reads historical plans and binds new plans and receipts to the actual predecessor", async () => {
    const previous = await seedLegacy("fixture-legacy");
    expect((await readActiveWorldDesign()).designs[0]?.designHash).toBe(previous);
    const next = draft("fixture-legacy", 2);
    const plan = await planWorldDesign(next);
    expect(plan.expectedPreviousHash).toBe(previous);
    const result = await applyWorldDesign(admin, next, plan.planHash);
    expect(result.receipt.previousHash).toBe(previous);
    expect(result.readback.designs[0]).toMatchObject({ designKey: next.designKey, version: 2, designHash: result.receipt.resultHash });
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT planHash, resultHash FROM aurionAuthoringReceipts WHERE id = ?", [result.receipt.receiptId]);
    expect(rows).toEqual([expect.objectContaining({ planHash: plan.planHash, resultHash: result.receipt.resultHash })]);

    // Reactivating the identical old version keeps its original stored hash,
    // while the new operation is still bound to the latest predecessor.
    const oldDraft = draft("fixture-legacy");
    const restorePlan = await planWorldDesign(oldDraft);
    expect(restorePlan.expectedPreviousHash).toBe(result.receipt.resultHash);
    const restored = await applyWorldDesign(admin, oldDraft, restorePlan.planHash);
    expect(restored.receipt.previousHash).toBe(result.receipt.resultHash);
    expect(restored.receipt.resultHash).toBe(previous);
    expect(restored.readback.designs[0]).toMatchObject({ version: 1, designHash: previous });
    const changedSameVersion = { ...oldDraft, title: "Different immutable version" };
    await expect(planWorldDesign(changedSameVersion)).rejects.toThrow("AUTHORING_WORLD_VERSION_CONFLICT");
  });

  it("allows only one of two independently confirmed plans for the same predecessor", async () => {
    const first = draft("fixture-race", 1), second = draft("fixture-race", 2);
    const [a, b] = await Promise.all([planWorldDesign(first), planWorldDesign(second)]);
    expect(a.expectedPreviousHash).toBeNull();
    expect(b.expectedPreviousHash).toBeNull();
    const results = await Promise.allSettled([applyWorldDesign(admin, first, a.planHash), applyWorldDesign(otherAdmin, second, b.planHash)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toContain("AUTHORING_WORLD_PLAN_CHANGED");
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT COUNT(*) AS count FROM aurionWorldDesignVersions WHERE active = 1 AND designKey = ?", [first.designKey]);
    expect(Number(rows[0]?.count)).toBe(1);
  }, 30_000);

  it("reads the catalog on the lock holder even when the other pool slots wait", async () => {
    const candidate = draft("fixture-pool");
    let entered!: () => void;
    let proceed!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { proceed = resolve; });
    const holder = store.withCatalogFence(async connection => {
      entered();
      await gate;
      return planWorldDesign(candidate, connection);
    });
    await started;
    const waiters = [0, 1].map(() => store.withCatalogFence(async () => true));
    await new Promise(resolve => setTimeout(resolve, 100));
    proceed();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        holder,
        new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error("CATALOG_POOL_STARVATION")), 4_000); }),
      ]);
      expect(result.expectedPreviousHash).toBeNull();
    } finally {
      if (timeout) clearTimeout(timeout);
      await Promise.allSettled([holder, ...waiters]);
    }
  }, 20_000);

  it("keeps the active-world readback usable when two admins compete for the last slot", async () => {
    for (let i = 0; i < 63; i++) await seedLegacy(`fixture-seed-${String(i).padStart(2, "0")}`);
    const first = draft("fixture-slot-one"), second = draft("fixture-slot-two");
    const [a, b] = await Promise.all([planWorldDesign(first), planWorldDesign(second)]);
    const results = await Promise.allSettled([applyWorldDesign(admin, first, a.planHash), applyWorldDesign(otherAdmin, second, b.planHash)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toContain("AUTHORING_WORLD_ACTIVE_LIMIT");
    expect((await readActiveWorldDesign()).designs).toHaveLength(64);
    await expect(planWorldDesign(draft("fixture-slot-three"))).rejects.toThrow("AUTHORING_WORLD_ACTIVE_LIMIT");
    expect((await planWorldDesign(draft("fixture-seed-00", 2))).expectedPreviousHash).toMatch(/^[a-f0-9]{64}$/);
  }, 30_000);

  it("rejects plans that exceed the persisted TEXT byte limit before confirmation", async () => {
    const large = draft("fixture-large");
    large.placements = Array.from({ length: 256 }, (_, i) => ({
      ...large.placements[0]!, placementKey: `a${String(i).padStart(3, "0")}${"x".repeat(92)}`,
      chunkX: -100000, chunkZ: -100000, xMm: 63999, zMm: 63999, rotationQuarterTurns: 3 as const, scalePermille: 4000,
    }));
    expect(WorldDesignDraftSchema.safeParse(large).success).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(large), "utf8")).toBeGreaterThan(65_535);
    await expect(planWorldDesign(large)).rejects.toThrow("AUTHORING_WORLD_PLAN_TOO_LARGE");
  });

  it("rechecks the actor role inside the committing transaction", async () => {
    const candidate = draft("fixture-role");
    const plan = await planWorldDesign(candidate);
    await pool.execute("UPDATE users SET role = 'user' WHERE id = ?", [admin]);
    await expect(applyWorldDesign(admin, candidate, plan.planHash)).rejects.toThrow("AUTHORING_ADMIN_REQUIRED");
    expect((await readActiveWorldDesign()).designs).toHaveLength(0);
  });

  it("waits for a concurrent role revocation before deciding whether to commit", async () => {
    const candidate = draft("fixture-role-race");
    const plan = await planWorldDesign(candidate);
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute("UPDATE users SET role = 'user' WHERE id = ?", [admin]);
      let completed = false;
      const applying = applyWorldDesign(admin, candidate, plan.planHash).then(
        value => { completed = true; return { value }; },
        error => { completed = true; return { error }; },
      );
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(completed).toBe(false);
      await connection.commit();
      const outcome = await applying;
      expect(String(outcome.error)).toContain("AUTHORING_ADMIN_REQUIRED");
      expect((await readActiveWorldDesign()).designs).toHaveLength(0);
    } finally {
      await connection.rollback();
      connection.release();
    }
  }, 30_000);

  it("rejects a confirmed plan after its catalog asset is archived", async () => {
    const candidate = draft("fixture-catalog");
    const plan = await planWorldDesign(candidate);
    try {
      await store.review(admin, { assetId, status: "archived" });
      await expect(applyWorldDesign(admin, candidate, plan.planHash)).rejects.toThrow("AUTHORING_GLB_CATALOG_CHANGED");
      expect((await readActiveWorldDesign()).designs).toHaveLength(0);
    } finally {
      await store.review(admin, { assetId, status: "approved" });
      catalogRevision = (await store.catalog()).revision;
    }
  }, 30_000);

  it("does not apply against an asset archived behind the shared catalog fence", async () => {
    const candidate = draft("fixture-catalog-race");
    const plan = await planWorldDesign(candidate);
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const archive = store.withCatalogFence(async connection => {
      await connection.beginTransaction();
      try {
        await connection.execute("UPDATE glbAssets SET status = 'archived' WHERE id = ?", [assetId]);
        entered();
        await gate;
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    });
    await started;
    try {
      let completed = false;
      const applying = applyWorldDesign(admin, candidate, plan.planHash).then(
        value => { completed = true; return { value }; },
        error => { completed = true; return { error }; },
      );
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(completed).toBe(false);
      release();
      await archive;
      const outcome = await applying;
      expect(String(outcome.error)).toContain("AUTHORING_GLB_CATALOG_CHANGED");
      expect((await readActiveWorldDesign()).designs).toHaveLength(0);
    } finally {
      release();
      await archive;
      await store.review(admin, { assetId, status: "approved" });
      catalogRevision = (await store.catalog()).revision;
    }
  }, 30_000);

  async function seedSubmission(id: string) {
    const bytes = testGlb("Aurion_Statue_Prop");
    const planned = await buildGlbImportPlan(bytes.toString("base64"), "auto", "Aurion_Statue_Prop.glb");
    await pool.execute(
      "INSERT INTO glbAssetSubmissions (id, submittedByUserId, assetType, subcategory, displayName, description, visibility, storageKey, storageUrl, sha256, bytes) VALUES (?, ?, ?, ?, ?, ?, 'public', ?, ?, ?, ?)",
      [id, otherAdmin, planned.assetType, planned.subcategory, "Aurion_Statue_Prop.glb", "Isolated test asset", `fixture/${id}`, `/fixture/${id}`, planned.sha256, bytes.length],
    );
    vi.mocked(storage.storageGetSignedUrl).mockResolvedValue("https://fixture.invalid/asset.glb");
    return { bytes, sha256: planned.sha256 };
  }

  it("commits a validated player submission and its file through the catalog fence", async () => {
    const fixture = await seedSubmission("fixture-submit-good");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(fixture.bytes));
    const result = await reviewPlayerGlbSubmission({ submissionId: "fixture-submit-good", reviewedByUserId: admin, decision: "approved" });
    expect(result.approved).toBe(true);
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT status, sha256 FROM glbAssets WHERE id = ?", [result.assetId]);
    expect(rows).toEqual([expect.objectContaining({ status: "approved", sha256: fixture.sha256 })]);
    expect((await store.catalog()).entries.some(entry => entry.assetId === result.assetId)).toBe(true);
  }, 30_000);

  it("does not hold the catalog fence during download and refuses a revoked reviewer", async () => {
    const fixture = await seedSubmission("fixture-submit-role");
    let started!: () => void;
    let complete!: () => void;
    const downloading = new Promise<void>(resolve => { started = resolve; });
    const response = new Promise<Response>(resolve => { complete = () => resolve(new Response(fixture.bytes)); });
    vi.spyOn(globalThis, "fetch").mockImplementation(() => { started(); return response; });
    const operation = reviewPlayerGlbSubmission({ submissionId: "fixture-submit-role", reviewedByUserId: admin, decision: "approved" });
    await downloading;
    try {
      await pool.execute("UPDATE users SET role = 'user' WHERE id = ?", [admin]);
      expect(await store.withCatalogFence(async () => "available")).toBe("available");
    } finally {
      complete();
    }
    await expect(operation).rejects.toThrow("GLB_ADMIN_REQUIRED");
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT status, approvedAssetId FROM glbAssetSubmissions WHERE id = ?", ["fixture-submit-role"]);
    expect(rows).toEqual([expect.objectContaining({ status: "pending", approvedAssetId: null })]);
  }, 30_000);

  it("does not approve a player asset beyond the shared 500-GLB capacity", async () => {
    const fixture = await seedSubmission("fixture-submit-capacity");
    const values: unknown[] = [];
    const tuples = Array.from({ length: 499 }, (_, index) => {
      const hash = (index + 1).toString(16).padStart(64, "0");
      values.push(`glb_capacity_${index}`, `Capacity ${index}`, `local-glb/${hash}.glb`, `/api/assets/glb/${hash}.glb`, hash, otherAdmin);
      return "(?, ?, 'arena', ?, ?, ?, 12, 'approved', ?)";
    });
    await pool.execute(`INSERT INTO glbAssets (id, displayName, assetType, storageKey, storageUrl, sha256, bytes, status, createdByUserId) VALUES ${tuples.join(",")}`, values);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(fixture.bytes));
    await expect(reviewPlayerGlbSubmission({ submissionId: "fixture-submit-capacity", reviewedByUserId: admin, decision: "approved" })).rejects.toThrow("GLB_CATALOG_LIMIT");
    const [rows] = await pool.execute<RowDataPacket[]>("SELECT status, approvedAssetId FROM glbAssetSubmissions WHERE id = ?", ["fixture-submit-capacity"]);
    expect(rows).toEqual([expect.objectContaining({ status: "pending", approvedAssetId: null })]);
  }, 30_000);
});
