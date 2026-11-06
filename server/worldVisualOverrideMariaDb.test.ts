import { createPool, type Pool, type RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Only the runtime catalog is a fixture; persistence runs against isolated MariaDB.
const catalog = vi.hoisted(() => ({ entries: [] as Array<{ assetId: string; assetType: string; targetKey: string | null; purpose: string }> }));
vi.mock("./glbImportStore", () => ({ glbImportStore: () => ({ catalog: async () => ({ revision: "r".repeat(64), entries: catalog.entries }) }) }));

const { readWorldVisualOverrides, setWorldVisualOverride, MAX_WORLD_VISUAL_PLACEMENTS } = await import("./worldVisualOverridePersistence");
const { authoredPlacementRef } = await import("../shared/worldVisualOverrideContract");

// Production 2026-11-06: the GLB Core Admin could not persist a world replacement at all.
const suite = process.env.AURION_WORLD_AUTHORING_DB_TEST === "1" && process.env.DATABASE_URL ? describe : describe.skip;
const world = "world-visual-test-world";
const house = "uploaded:0:0:2";

suite("world visual overrides on isolated MariaDB", () => {
  let pool: Pool;
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (url.hostname !== "127.0.0.1" || !url.pathname.endsWith("_test")) throw new Error("ISOLATED_TEST_DATABASE_REQUIRED");
    pool = createPool(process.env.DATABASE_URL!);
  });
  beforeEach(async () => {
    await pool.query("DELETE FROM aurionWorldVisualOverrides WHERE worldId=?", [world]);
    catalog.entries = [
      { assetId: "glb_house_new", assetType: "arena", targetKey: null, purpose: "world-environment" },
      { assetId: "glb_house_other", assetType: "arena", targetKey: null, purpose: "world-nature" },
      { assetId: "glb_sword", assetType: "weapon", targetKey: null, purpose: "auto" },
      { assetId: "glb_hero_slot", assetType: "arena", targetKey: "hero", purpose: "world-environment" },
      { assetId: "glb_auto_arena", assetType: "arena", targetKey: null, purpose: "auto" },
    ];
  });
  afterAll(async () => { if (pool) { await pool.query("DELETE FROM aurionWorldVisualOverrides WHERE worldId=?", [world]); await pool.end(); } });

  it("persists a replacement as an append-only revision and reads it back fresh", async () => {
    const first = await setWorldVisualOverride(1, { placementRef: house, assetId: "glb_house_new", expectedRevision: 0 }, world);
    expect(first).toMatchObject({ revision: 1, assetId: "glb_house_new", previousAssetId: null, targetKind: "uploaded_anchor" });
    const second = await setWorldVisualOverride(1, { placementRef: house, assetId: "glb_house_other", expectedRevision: 1 }, world);
    expect(second).toMatchObject({ revision: 2, previousAssetId: "glb_house_new" });
    const readback = await readWorldVisualOverrides(world);
    expect(readback.overrides).toEqual([{ placementRef: house, targetKind: "uploaded_anchor", assetId: "glb_house_other", revision: 2 }]);
    expect(readback.revisions).toEqual({ [house]: 2 });
    const [rows] = await pool.query<RowDataPacket[]>("SELECT revision, assetId FROM aurionWorldVisualOverrides WHERE worldId=? ORDER BY revision", [world]);
    expect(rows.map(row => [row.revision, row.assetId])).toEqual([[1, "glb_house_new"], [2, "glb_house_other"]]);
  });

  it("restores the original with a null asset and keeps the revision for later writes", async () => {
    await setWorldVisualOverride(1, { placementRef: house, assetId: "glb_house_new", expectedRevision: 0 }, world);
    await setWorldVisualOverride(1, { placementRef: house, assetId: null, expectedRevision: 1 }, world);
    const readback = await readWorldVisualOverrides(world);
    expect(readback.overrides).toEqual([]);
    expect(readback.revisions).toEqual({ [house]: 2 });
  });

  it("rejects stale revisions, concurrent writers, unchanged writes and non-world or unloadable assets", async () => {
    await setWorldVisualOverride(1, { placementRef: house, assetId: "glb_house_new", expectedRevision: 0 }, world);
    await expect(setWorldVisualOverride(1, { placementRef: house, assetId: "glb_house_other", expectedRevision: 0 }, world)).rejects.toThrow("WORLD_VISUAL_REVISION_CONFLICT");
    await expect(setWorldVisualOverride(1, { placementRef: house, assetId: "glb_house_new", expectedRevision: 1 }, world)).rejects.toThrow("WORLD_VISUAL_UNCHANGED");
    await expect(setWorldVisualOverride(1, { placementRef: house, assetId: "glb_sword", expectedRevision: 1 }, world)).rejects.toThrow("WORLD_VISUAL_ASSET_NOT_A_WORLD_ASSET");
    await expect(setWorldVisualOverride(1, { placementRef: house, assetId: "glb_hero_slot", expectedRevision: 1 }, world)).rejects.toThrow("WORLD_VISUAL_ASSET_NOT_A_WORLD_ASSET");
    // Review (Devin): an approved, unassigned arena without a world purpose is not a world model.
    await expect(setWorldVisualOverride(1, { placementRef: house, assetId: "glb_auto_arena", expectedRevision: 1 }, world)).rejects.toThrow("WORLD_VISUAL_ASSET_NOT_A_WORLD_ASSET");
    await expect(setWorldVisualOverride(1, { placementRef: house, assetId: "glb_unknown", expectedRevision: 1 }, world)).rejects.toThrow("WORLD_VISUAL_ASSET_NOT_IN_RUNTIME_CATALOG");
    await expect(setWorldVisualOverride(1, { placementRef: "nonsense", assetId: "glb_house_new", expectedRevision: 1 }, world)).rejects.toThrow("WORLD_VISUAL_PLACEMENT_INVALID");
    // Two admins writing the same expected revision: exactly one wins.
    const results = await Promise.allSettled([
      setWorldVisualOverride(1, { placementRef: house, assetId: "glb_house_other", expectedRevision: 1 }, world),
      setWorldVisualOverride(2, { placementRef: house, assetId: null, expectedRevision: 1 }, world),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((await readWorldVisualOverrides(world)).revisions[house]).toBe(2);
  });

  // Raw history rows, as many admin edits would leave them (Sequence engine of MariaDB).
  async function insertHistory(placementRefSql: string, revisionSql: string, count: number, tag: string) {
    await pool.query(
      `INSERT INTO aurionWorldVisualOverrides (id, worldId, targetKind, placementRef, revision, assetId, previousAssetId, actorUserId, receiptHash)
       SELECT CONCAT('wvo_${tag}_', seq), ?, 'uploaded_anchor', ${placementRefSql}, ${revisionSql}, IF(seq % 2 = 0, 'glb_house_new', 'glb_house_other'), NULL, 1, SHA2(CONCAT(?, '${tag}', seq), 256)
       FROM seq_1_to_${count}`, [world, world]);
  }

  // Review (Devin, CodeRabbit): the readback windowed all history rows before grouping,
  // so 20,000 edits of one house made another house's persisted replacement vanish.
  it("reads every placement's head no matter how long another placement's history is", async () => {
    await setWorldVisualOverride(1, { placementRef: house, assetId: "glb_house_new", expectedRevision: 0 }, world);
    await insertHistory("'uploaded:1:1:1'", "seq", MAX_WORLD_VISUAL_PLACEMENTS + 1, "long");
    const readback = await readWorldVisualOverrides(world);
    expect(readback.revisions).toEqual({ [house]: 1, "uploaded:1:1:1": MAX_WORLD_VISUAL_PLACEMENTS + 1 });
    expect(readback.overrides.map(entry => entry.placementRef)).toEqual([house, "uploaded:1:1:1"]);
    // The untouched house stays writable with its real revision.
    await expect(setWorldVisualOverride(1, { placementRef: house, assetId: "glb_house_other", expectedRevision: 1 }, world)).resolves.toMatchObject({ revision: 2 });
  }, 60_000);

  it("refuses a new placement at the bound and fails the readback explicitly instead of truncating", async () => {
    await insertHistory("CONCAT('uploaded:9:9:', seq)", "1", MAX_WORLD_VISUAL_PLACEMENTS, "bound");
    await expect(setWorldVisualOverride(1, { placementRef: house, assetId: "glb_house_new", expectedRevision: 0 }, world)).rejects.toThrow("WORLD_VISUAL_PLACEMENT_LIMIT");
    await expect(setWorldVisualOverride(1, { placementRef: "uploaded:9:9:7", assetId: "glb_house_new", expectedRevision: 1 }, world)).resolves.toMatchObject({ revision: 2 });
    expect(Object.keys((await readWorldVisualOverrides(world)).revisions)).toHaveLength(MAX_WORLD_VISUAL_PLACEMENTS);
    await insertHistory("CONCAT('uploaded:8:8:', seq)", "1", 65, "over");
    await expect(readWorldVisualOverrides(world)).rejects.toThrow("WORLD_VISUAL_READBACK_OVERFLOW");
  }, 60_000);

  // Review (Devin): two valid 96-character World Design keys exceeded the reference bound.
  it("writes and reads back a replacement for a placement with maximum-length design keys", async () => {
    const ref = authoredPlacementRef(`d${"a".repeat(95)}`, `p${"b".repeat(95)}`);
    expect(ref.length).toBeLessThanOrEqual(160);
    await expect(setWorldVisualOverride(1, { placementRef: ref, assetId: "glb_house_new", expectedRevision: 0 }, world)).resolves.toMatchObject({ targetKind: "authored_placement", revision: 1 });
    expect((await readWorldVisualOverrides(world)).overrides).toEqual([{ placementRef: ref, targetKind: "authored_placement", assetId: "glb_house_new", revision: 1 }]);
  });
});
