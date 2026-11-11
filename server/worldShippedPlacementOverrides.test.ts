import { beforeEach, describe, expect, it, vi } from "vitest";

// Only the database handle is a fixture: absent (no DATABASE_URL) or failing.
const database = vi.hoisted(() => ({ mode: "absent" as "absent" | "failing" }));
vi.mock("./db", () => ({ getDb: async () => {
  if (database.mode === "absent") return null;
  return { select: () => { throw new Error("ER_CONNECTION_LOST"); } };
} }));
vi.mock("./glbImportStore", () => ({ glbImportStore: () => ({ catalog: async () => ({ revision: "r".repeat(64), entries: [] }) }) }));

const { GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED } = await import("../shared/worldIdentity");
const { worldAssetRegion, legacyWorldAssetRegion, worldAssetsForChunk, findProceduralPlacement, proceduralPlacementChunk } = await import("../shared/worldAssetProtocol");
const contract = await import("../shared/worldVisualOverrideContract");
const index = await import("./worldShippedPlacementOverrides");
const { confirmedWorldAssetRegion, confirmedLegacyWorldAssetRegion, ensureShippedPlacementOverridesLoaded } = await import("./worldAssetRegionReadback");
const { WorldNatureCollision, worldNatureCollision } = await import("./worldNatureCollision");
const { setWorldVisualOverride } = await import("./worldVisualOverridePersistence");

const { WORLD_VISUAL_REMOVED_ASSET_ID, shippedPlacementRef, shippedPlacementIdOf, WorldVisualOverrideSetInput } = contract;
const NATURE = { x: 3, z: 3 };
const plan = worldAssetsForChunk(GLOBAL_WORLD_SEED, NATURE);
const readbackOf = (worldId: string, entries: Array<[string, string]>) => ({
  worldId,
  overrides: entries.map(([placementRef, assetId]) => ({ placementRef, targetKind: contract.worldVisualTargetKind(placementRef)!, assetId, revision: 1 })),
});

beforeEach(() => { database.mode = "absent"; index.resetShippedPlacementOverridesForTest(); });

// Owner brief 2026-11-10: every deterministic world model must be removable and
// replaceable by the admin, not only uploaded anchors and World Design placements.
describe("shipped placement reference and removal contract", () => {
  it("addresses every procedural placement and nothing of the authored starter village", () => {
    expect(plan.length).toBeGreaterThan(0);
    for (const placement of plan) {
      const ref = shippedPlacementRef(placement.id);
      expect(contract.worldVisualTargetKind(ref)).toBe("shipped_placement");
      expect(shippedPlacementIdOf(ref)).toBe(placement.id);
      expect(findProceduralPlacement(GLOBAL_WORLD_SEED, placement.id)).toEqual(placement);
    }
    for (const fixed of worldAssetsForChunk(GLOBAL_WORLD_SEED, { x: 0, z: 0 })) {
      expect(proceduralPlacementChunk(fixed.id)).toBeNull();
      expect(findProceduralPlacement(GLOBAL_WORLD_SEED, fixed.id)).toBeUndefined();
    }
    expect(shippedPlacementIdOf("uploaded:0:0:2")).toBeNull();
    expect(() => shippedPlacementRef("not a placement")).toThrow("WORLD_VISUAL_PLACEMENT_INVALID");
  });

  it("accepts a catalog asset, the removal sentinel or null, and nothing else", () => {
    const placementRef = shippedPlacementRef(plan[0]!.id);
    for (const assetId of ["glb_house_new", WORLD_VISUAL_REMOVED_ASSET_ID, null])
      expect(WorldVisualOverrideSetInput.safeParse({ placementRef, assetId, expectedRevision: 0 }).success).toBe(true);
    for (const assetId of ["", "removed", "aurion.world-visual.removed.x", "nature-tree-01", "../../etc/passwd"])
      expect(WorldVisualOverrideSetInput.safeParse({ placementRef, assetId, expectedRevision: 0 }).success).toBe(false);
    expect(contract.isWorldVisualRemoval(WORLD_VISUAL_REMOVED_ASSET_ID)).toBe(true);
    expect(contract.isWorldVisualRemoval("glb_house_new")).toBe(false);
    expect(["uploaded_anchor", "authored_placement", "shipped_placement", "surface_texture"].map(kind => contract.worldVisualTargetIsRemovable(kind as never))).toEqual([true, true, true, false]);
  });

  it("refuses unknown procedural placements and removing a ground material before any database access", async () => {
    const unknown = "shipped:aurion-world-assets.v1:3:3:99";
    const village = `shipped:${worldAssetsForChunk(GLOBAL_WORLD_SEED, { x: 0, z: 0 })[0]!.id}`;
    for (const placementRef of [unknown, village]) {
      expect(contract.worldVisualTargetKind(placementRef)).toBe("shipped_placement");
      await expect(setWorldVisualOverride(1, { placementRef, assetId: WORLD_VISUAL_REMOVED_ASSET_ID, expectedRevision: 0 })).rejects.toThrow("WORLD_VISUAL_PLACEMENT_UNKNOWN");
      await expect(setWorldVisualOverride(1, { placementRef, assetId: "glb_house_new", expectedRevision: 0 })).rejects.toThrow("WORLD_VISUAL_PLACEMENT_UNKNOWN");
    }
    await expect(setWorldVisualOverride(1, { placementRef: "surface:grass", assetId: WORLD_VISUAL_REMOVED_ASSET_ID, expectedRevision: 0 })).rejects.toThrow("WORLD_VISUAL_REMOVAL_UNSUPPORTED");
    // A known placement passes the rules and only then needs the database.
    await expect(setWorldVisualOverride(1, { placementRef: shippedPlacementRef(plan[0]!.id), assetId: WORLD_VISUAL_REMOVED_ASSET_ID, expectedRevision: 0 })).rejects.toThrow("WORLD_VISUAL_DATABASE_REQUIRED");
    // Restoring stays possible for a placement a later plan no longer emits.
    await expect(setWorldVisualOverride(1, { placementRef: unknown, assetId: null, expectedRevision: 1 })).rejects.toThrow("WORLD_VISUAL_DATABASE_REQUIRED");
  });
});

describe("derived index of removed and replaced procedural placements", () => {
  it("hides removed and replaced shipped placements and only those", () => {
    const [removed, replaced, untouched] = plan;
    index.applyShippedPlacementReadback(readbackOf(GLOBAL_WORLD_ID, [
      [shippedPlacementRef(removed!.id), WORLD_VISUAL_REMOVED_ASSET_ID],
      [shippedPlacementRef(replaced!.id), "glb_house_new"],
      ["uploaded:3:3:1", WORLD_VISUAL_REMOVED_ASSET_ID],
      ["authored:design:placement", "glb_house_new"],
    ]));
    expect(index.shippedPlacementOverridesLoaded()).toBe(true);
    expect(index.hiddenShippedPlacementCount()).toBe(2);
    expect([removed, replaced, untouched].map(placement => index.isShippedPlacementHidden(placement!.id))).toEqual([true, true, false]);
  });

  it("ignores other worlds and notifies listeners only when the hidden set really changes", () => {
    const changed = vi.fn();
    const off = index.onShippedPlacementOverridesChanged(changed);
    const ref = shippedPlacementRef(plan[0]!.id);
    index.applyShippedPlacementReadback(readbackOf("some-other-world", [[ref, WORLD_VISUAL_REMOVED_ASSET_ID]]));
    expect(index.shippedPlacementOverridesLoaded()).toBe(false);
    expect(index.isShippedPlacementHidden(plan[0]!.id)).toBe(false);
    // Before the first confirmed readback a single write cannot stand in for the whole state.
    index.applyShippedPlacementWrite(GLOBAL_WORLD_ID, ref, WORLD_VISUAL_REMOVED_ASSET_ID);
    expect(index.isShippedPlacementHidden(plan[0]!.id)).toBe(false);
    expect(changed).not.toHaveBeenCalled();

    index.applyShippedPlacementReadback(readbackOf(GLOBAL_WORLD_ID, []));
    expect(changed).not.toHaveBeenCalled();
    index.applyShippedPlacementWrite(GLOBAL_WORLD_ID, ref, WORLD_VISUAL_REMOVED_ASSET_ID);
    index.applyShippedPlacementWrite(GLOBAL_WORLD_ID, ref, "glb_house_new");
    index.applyShippedPlacementWrite("some-other-world", shippedPlacementRef(plan[1]!.id), WORLD_VISUAL_REMOVED_ASSET_ID);
    index.applyShippedPlacementWrite(GLOBAL_WORLD_ID, "uploaded:3:3:1", WORLD_VISUAL_REMOVED_ASSET_ID);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(index.hiddenShippedPlacementCount()).toBe(1);
    index.applyShippedPlacementWrite(GLOBAL_WORLD_ID, ref, null);
    expect(changed).toHaveBeenCalledTimes(2);
    expect(index.isShippedPlacementHidden(plan[0]!.id)).toBe(false);
    off();
    index.applyShippedPlacementWrite(GLOBAL_WORLD_ID, ref, WORLD_VISUAL_REMOVED_ASSET_ID);
    expect(changed).toHaveBeenCalledTimes(2);
  });
});

describe("confirmed world plan read", () => {
  it("is the complete deterministic plan when no database is configured", async () => {
    expect(await confirmedWorldAssetRegion(NATURE)).toEqual(worldAssetRegion(GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED, NATURE));
    expect(await confirmedLegacyWorldAssetRegion(NATURE)).toEqual(legacyWorldAssetRegion(GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED, NATURE));
    expect(index.shippedPlacementOverridesLoaded()).toBe(true);
  });

  it("omits exactly the removed and replaced placements, in both protocol versions, and brings them back on restore", async () => {
    await ensureShippedPlacementOverridesLoaded();
    const full = worldAssetRegion(GLOBAL_WORLD_ID, GLOBAL_WORLD_SEED, NATURE);
    const [removed, replaced] = plan;
    index.applyShippedPlacementWrite(GLOBAL_WORLD_ID, shippedPlacementRef(removed!.id), WORLD_VISUAL_REMOVED_ASSET_ID);
    index.applyShippedPlacementWrite(GLOBAL_WORLD_ID, shippedPlacementRef(replaced!.id), "glb_house_new");
    const expected = full.placements.filter(placement => placement.id !== removed!.id && placement.id !== replaced!.id);
    expect(expected).toHaveLength(full.placements.length - 2);
    const region = await confirmedWorldAssetRegion(NATURE);
    expect(region.placements).toEqual(expected);
    expect({ ...region, placements: full.placements }).toEqual(full);
    expect((await confirmedLegacyWorldAssetRegion(NATURE)).placements).toEqual(expected);
    // A neighbouring centre sees the same chunk without them, too.
    expect((await confirmedWorldAssetRegion({ x: NATURE.x + 1, z: NATURE.z })).placements.map(placement => placement.id)).not.toContain(removed!.id);
    index.applyShippedPlacementWrite(GLOBAL_WORLD_ID, shippedPlacementRef(removed!.id), null);
    index.applyShippedPlacementWrite(GLOBAL_WORLD_ID, shippedPlacementRef(replaced!.id), null);
    expect(await confirmedWorldAssetRegion(NATURE)).toEqual(full);
  });

  it("fails instead of serving removed placements when the configured database cannot be read", async () => {
    database.mode = "failing";
    await expect(confirmedWorldAssetRegion(NATURE)).rejects.toThrow();
    expect(index.shippedPlacementOverridesLoaded()).toBe(false);
    // The next read tries again and succeeds once the state is known.
    database.mode = "absent";
    await expect(confirmedWorldAssetRegion(NATURE)).resolves.toMatchObject({ center: NATURE });
  });
});

describe("movement collision follows the confirmed world plan", () => {
  const blocking = (() => {
    const reference = new WorldNatureCollision(GLOBAL_WORLD_SEED);
    for (let z = 2; z <= 5; z++) for (let x = 2; x <= 5; x++) {
      const obstacle = reference.obstaclesForChunk({ x, z })[0];
      if (obstacle) return { coordinate: { x, z }, count: reference.obstaclesForChunk({ x, z }).length, ids: worldAssetsForChunk(GLOBAL_WORLD_SEED, { x, z }).map(placement => placement.id) };
    }
    throw new Error("NO_BLOCKING_PLACEMENT_IN_PROBE_AREA");
  })();

  it("drops the hull of a hidden placement and keeps every other hull", () => {
    const all = new WorldNatureCollision(GLOBAL_WORLD_SEED).obstaclesForChunk(blocking.coordinate);
    const counts = blocking.ids.map(id => new WorldNatureCollision(GLOBAL_WORLD_SEED, placementId => placementId === id).obstaclesForChunk(blocking.coordinate).length);
    // Each blocking placement carries exactly one hull; non-blocking ones none.
    expect(counts.filter(count => count === all.length - 1)).toHaveLength(all.length);
    expect(counts.filter(count => count === all.length)).toHaveLength(blocking.ids.length - all.length);
    expect(new WorldNatureCollision(GLOBAL_WORLD_SEED, () => true).obstaclesForChunk(blocking.coordinate)).toEqual([]);
  });

  it("the runtime collision singleton forgets a removed placement immediately and restores it on restore", async () => {
    await ensureShippedPlacementOverridesLoaded();
    const before = worldNatureCollision.obstaclesForChunk(blocking.coordinate).length;
    expect(before).toBe(blocking.count);
    const blockingId = blocking.ids.find(id => new WorldNatureCollision(GLOBAL_WORLD_SEED, placementId => placementId === id).obstaclesForChunk(blocking.coordinate).length === before - 1)!;
    index.applyShippedPlacementWrite(GLOBAL_WORLD_ID, shippedPlacementRef(blockingId), WORLD_VISUAL_REMOVED_ASSET_ID);
    expect(worldNatureCollision.obstaclesForChunk(blocking.coordinate)).toHaveLength(before - 1);
    index.applyShippedPlacementWrite(GLOBAL_WORLD_ID, shippedPlacementRef(blockingId), null);
    expect(worldNatureCollision.obstaclesForChunk(blocking.coordinate)).toHaveLength(before);
  });
});

it("advances the readback guard for every committed global override", () => {
 const before=index.shippedPlacementIndexGeneration();
 index.applyShippedPlacementWrite(GLOBAL_WORLD_ID,shippedPlacementRef(plan[0]!.id),WORLD_VISUAL_REMOVED_ASSET_ID);
 expect(index.shippedPlacementIndexGeneration()).toBe(before+1);
 index.applyShippedPlacementReadback(readbackOf(GLOBAL_WORLD_ID,[]));
 const frozen=index.snapshotHiddenShippedPlacementIds();
 expect(index.snapshotHiddenShippedPlacementIds()).toBe(frozen);
 index.applyShippedPlacementWrite(GLOBAL_WORLD_ID,shippedPlacementRef(plan[0]!.id),WORLD_VISUAL_REMOVED_ASSET_ID);
 expect(index.snapshotHiddenShippedPlacementIds()).not.toBe(frozen);
 expect(frozen).toEqual([]);
});
