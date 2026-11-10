import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Only the runtime catalog is a fixture; persistence, plan read and collision are real.
vi.mock("./glbImportStore", () => ({ glbImportStore: () => ({ catalog: async () => ({ revision: "r".repeat(64), entries: [
  { assetId: "glb_house_new", assetType: "arena", targetKey: null, purpose: "world-environment" },
] }) }) }));

const { GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED } = await import("../shared/worldIdentity");
const { worldAssetsForChunk } = await import("../shared/worldAssetProtocol");
const { WORLD_VISUAL_REMOVED_ASSET_ID, shippedPlacementRef } = await import("../shared/worldVisualOverrideContract");
const { readWorldVisualOverrides, setWorldVisualOverride } = await import("./worldVisualOverridePersistence");
const { confirmedWorldAssetRegion } = await import("./worldAssetRegionReadback");
const { WorldNatureCollision, worldNatureCollision } = await import("./worldNatureCollision");
const index = await import("./worldShippedPlacementOverrides");

// Owner brief 2026-11-10: the admin removes, replaces and restores any procedural world
// model; the confirmed plan and the movement collision follow, also after a restart.
const suite = process.env.AURION_WORLD_AUTHORING_DB_TEST === "1" && process.env.DATABASE_URL ? describe : describe.skip;

suite("admin removal of a procedural world model on isolated MariaDB", () => {
  let pool: Pool;
  // A chunk far from every other test; the first placement there that blocks movement.
  const coordinate = { x: 41, z: -37 };
  const target = (() => {
    for (let z = coordinate.z; z < coordinate.z + 6; z++) for (let x = coordinate.x; x < coordinate.x + 6; x++) {
      const all = new WorldNatureCollision(GLOBAL_WORLD_SEED).obstaclesForChunk({ x, z }).length;
      const id = worldAssetsForChunk(GLOBAL_WORLD_SEED, { x, z }).map(placement => placement.id)
        .find(candidate => new WorldNatureCollision(GLOBAL_WORLD_SEED, placementId => placementId === candidate).obstaclesForChunk({ x, z }).length === all - 1);
      if (id) return { id, chunk: { x, z }, hulls: all };
    }
    throw new Error("NO_BLOCKING_PLACEMENT_IN_PROBE_AREA");
  })();
  const ref = shippedPlacementRef(target.id);
  const cleanup = () => pool.query("DELETE FROM aurionWorldVisualOverrides WHERE worldId=? AND placementRef=?", [GLOBAL_WORLD_ID, ref]);
  const planned = async () => (await confirmedWorldAssetRegion(target.chunk)).placements.some(placement => placement.id === target.id);
  const hulls = () => worldNatureCollision.obstaclesForChunk(target.chunk).length;
  const restart = () => index.resetShippedPlacementOverridesForTest();

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
    await cleanup();
    restart();
  });
  afterAll(async () => { if (pool) { await cleanup(); await pool.end(); } restart(); });

  it("removes, survives a restart, replaces and restores with receipts, plan readback and collision", async () => {
    expect(await planned()).toBe(true);
    expect(hulls()).toBe(target.hulls);

    const removal = await setWorldVisualOverride(7, { placementRef: ref, assetId: WORLD_VISUAL_REMOVED_ASSET_ID, expectedRevision: 0 });
    expect(removal).toMatchObject({ worldId: GLOBAL_WORLD_ID, targetKind: "shipped_placement", revision: 1, assetId: WORLD_VISUAL_REMOVED_ASSET_ID, previousAssetId: null, actorUserId: 7 });
    expect(await planned()).toBe(false);
    expect(hulls()).toBe(target.hulls - 1);
    const [rows] = await pool.query<RowDataPacket[]>("SELECT revision, targetKind, assetId, receiptHash FROM aurionWorldVisualOverrides WHERE worldId=? AND placementRef=? ORDER BY revision", [GLOBAL_WORLD_ID, ref]);
    expect(rows.map(row => [row.revision, row.targetKind, row.assetId, row.receiptHash])).toEqual([[1, "shipped_placement", WORLD_VISUAL_REMOVED_ASSET_ID, removal.receiptHash]]);
    expect((await readWorldVisualOverrides()).overrides).toContainEqual({ placementRef: ref, targetKind: "shipped_placement", assetId: WORLD_VISUAL_REMOVED_ASSET_ID, revision: 1 });

    // Process restart: the derived index is empty and is rebuilt from the database.
    restart();
    expect(index.shippedPlacementOverridesLoaded()).toBe(false);
    expect(await planned()).toBe(false);
    expect(hulls()).toBe(target.hulls - 1);

    await expect(setWorldVisualOverride(7, { placementRef: ref, assetId: WORLD_VISUAL_REMOVED_ASSET_ID, expectedRevision: 1 })).rejects.toThrow("WORLD_VISUAL_UNCHANGED");
    await expect(setWorldVisualOverride(7, { placementRef: ref, assetId: "glb_house_new", expectedRevision: 0 })).rejects.toThrow("WORLD_VISUAL_REVISION_CONFLICT");
    // Replaced: drawn by the clients as an uploaded visual, still not part of the plan.
    await expect(setWorldVisualOverride(7, { placementRef: ref, assetId: "glb_house_new", expectedRevision: 1 })).resolves.toMatchObject({ revision: 2, previousAssetId: WORLD_VISUAL_REMOVED_ASSET_ID });
    expect(await planned()).toBe(false);
    expect(hulls()).toBe(target.hulls - 1);

    await expect(setWorldVisualOverride(7, { placementRef: ref, assetId: null, expectedRevision: 2 })).resolves.toMatchObject({ revision: 3, assetId: null, previousAssetId: "glb_house_new" });
    expect(await planned()).toBe(true);
    expect(hulls()).toBe(target.hulls);
    const readback = await readWorldVisualOverrides();
    expect(readback.overrides.map(entry => entry.placementRef)).not.toContain(ref);
    expect(readback.revisions[ref]).toBe(3);
  });

  // Run in parallel with the bulk-history override test, the first write here was the
  // victim of an InnoDB gap-lock deadlock (ER_LOCK_DEADLOCK) and the admin write failed.
  it("lets several admins remove different never-touched models at the same moment", async () => {
    const others = worldAssetsForChunk(GLOBAL_WORLD_SEED, { x: 52, z: -44 }).slice(0, 4).map(placement => shippedPlacementRef(placement.id));
    const wipe = () => pool.query("DELETE FROM aurionWorldVisualOverrides WHERE worldId=? AND placementRef IN (?)", [GLOBAL_WORLD_ID, others]);
    await wipe();
    try {
      for (let round = 0; round < 5; round++) {
        const receipts = await Promise.all(others.map((placementRef, actor) => setWorldVisualOverride(actor + 1, { placementRef, assetId: WORLD_VISUAL_REMOVED_ASSET_ID, expectedRevision: 0 })));
        expect(receipts.map(receipt => receipt.revision)).toEqual([1, 1, 1, 1]);
        const hidden = (await readWorldVisualOverrides()).overrides.filter(entry => others.includes(entry.placementRef));
        expect(hidden).toHaveLength(others.length);
        await wipe();
      }
    } finally { await wipe(); }
  });

  it("refuses a placement the world plan does not emit and never writes a row for it", async () => {
    const unknown = "shipped:aurion-world-assets.v1:41:-37:99";
    await expect(setWorldVisualOverride(7, { placementRef: unknown, assetId: WORLD_VISUAL_REMOVED_ASSET_ID, expectedRevision: 0 })).rejects.toThrow("WORLD_VISUAL_PLACEMENT_UNKNOWN");
    const [rows] = await pool.query<RowDataPacket[]>("SELECT id FROM aurionWorldVisualOverrides WHERE placementRef=?", [unknown]);
    expect(rows).toHaveLength(0);
  });
});
