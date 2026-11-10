import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { GlbCatalogEntry } from "@shared/glbImportContract";
import { AURION_STARTER_CITY_WALL_HEADROOM_KEY, AURION_STARTER_CITY_WALL_LODS, starterCityWallAllocation } from "@shared/aurionStarterCityWallContract";
import { MAX_AUTHORED_RENDERED, UploadedWorldCatalogProjection } from "./UploadedWorldCatalogProjection";
import { authoredPlacementRef, shippedPlacementRef, WORLD_VISUAL_REMOVED_ASSET_ID } from "@shared/worldVisualOverrideContract";
import { GLOBAL_WORLD_SEED } from "@shared/worldIdentity";
import { worldAssetsForChunk } from "@shared/worldAssetProtocol";
import { glbManager, selectStaticWorldLodVariants } from "../core/GLBModelManager";
import { glbResourcePool } from "../core/GlbResourceBudget";

afterEach(() => vi.restoreAllMocks());
describe("authored city wall selection", () => {
  it("keeps the wall rendered at its east edge when nearer authored props fill their budget", async () => {
    const sha = AURION_STARTER_CITY_WALL_LODS[0].sha256;
    const wall = { assetId: "glb_citywall", sha256: sha, displayName: "Wall", purpose: "world-environment", assetType: "arena",
      targetKey: null, subcategory: "structure", equipmentSlot: null, storageUrl: `/api/assets/glb/${sha}.glb` } as GlbCatalogEntry;
    const ordinary = { ...wall, assetId: "glb_other", sha256: "f".repeat(64) };
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => {
      const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
      return { scene, animations: [], lodLevels: [0] };
    });
    const projection = new UploadedWorldCatalogProjection({ scene: new THREE.Scene(), player: { position: new THREE.Vector3(50, 0, 0) },
      landscape: { chunkManager: { getElevationAt: () => 0 } } } as never);
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [wall, ordinary] });
    projection.setWorldDesign({ schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64), designs: [{
      designKey: "city", version: 1, title: "City", designHash: "c".repeat(64), expectedCatalogRevision: "a".repeat(64),
      placements: [{ placementKey: "perimeter", assetId: wall.assetId, chunkX: 0, chunkZ: 0, xMm: 32000, zMm: 32000,
        rotationQuarterTurns: 0, scalePermille: 1000 }, ...Array.from({ length: MAX_AUTHORED_RENDERED + 5 }, (_, i) => ({ placementKey: `prop-${i}`,
        assetId: ordinary.assetId, chunkX: 1, chunkZ: 0, xMm: 18000 + i, zMm: 32000, rotationQuarterTurns: 0 as const, scalePermille: 1000 }))],
    }] });
    projection.update();
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    // The wall keeps its dedicated slot; authored props fill exactly their own budget.
    expect(projection.evidence().assets.some(asset => asset.sha256 === sha)).toBe(true);
    expect(projection.evidence().assets.filter(asset => asset.id.startsWith("authored:") && asset.sha256 !== sha)).toHaveLength(MAX_AUTHORED_RENDERED);
    projection.dispose();
  });

  // Placement stage A: an admin placing more than 18 objects near each other saw the
  // newest ones vanish, because authored placements shared the 18-slot automatic cap.
  it("renders every nearby admin placement beyond the automatic 18-slot cap", async () => {
    const prop = { assetId: "glb_crate", sha256: "e".repeat(64), displayName: "Kiste", purpose: "world-environment", assetType: "arena",
      targetKey: null, subcategory: "street-prop", equipmentSlot: null, storageUrl: `/api/assets/glb/${"e".repeat(64)}.glb` } as GlbCatalogEntry;
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => {
      const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
      return { scene, animations: [], lodLevels: [0] };
    });
    const projection = new UploadedWorldCatalogProjection({ scene: new THREE.Scene(), player: { position: new THREE.Vector3(0, 0, 0) },
      landscape: { chunkManager: { getElevationAt: () => 0 } } } as never);
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [prop] });
    projection.setWorldDesign({ schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64), designs: [{
      designKey: "admin.placements.1a2b3c4d", version: 30, title: "Admin-Platzierungen", designHash: "c".repeat(64), expectedCatalogRevision: "a".repeat(64),
      placements: Array.from({ length: 30 }, (_, i) => ({ placementKey: `p.${String(i).padStart(12, "0")}`, assetId: prop.assetId, chunkX: 0, chunkZ: 0,
        xMm: 30_000 + i * 250, zMm: 32_000, rotationQuarterTurns: 0 as const, scalePermille: 1000 })),
    }] });
    projection.update();
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    const refs: string[] = [];
    projection.root.traverse(node => { const target = node.userData.worldVisualTarget; if (target?.targetKind === "authored_placement") refs.push(target.placementRef); });
    expect(refs).toHaveLength(30);
    expect(refs).toContain("authored:admin.placements.1a2b3c4d:p.000000000029");
    projection.dispose();
  });
});

describe("addressable and persistently replaceable world visuals", () => {
  // Production 2026-11-06: no rendered world object carried target data, so the admin
  // cursor never addressed a house. Overrides address a stable location.
  const house = (assetId: string, sha: string) => ({ assetId, sha256: sha, displayName: assetId, purpose: "world-environment", assetType: "arena",
    targetKey: null, subcategory: "building", equipmentSlot: null, storageUrl: `/api/assets/glb/${sha}.glb` }) as GlbCatalogEntry;
  const targets = (projection: UploadedWorldCatalogProjection) => {
    const found: Record<string, string> = {};
    projection.root.traverse(node => { const target = node.userData.worldVisualTarget; if (target) found[target.placementRef] = target.assetId; });
    return found;
  };
  function make() {
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => {
      const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
      return { scene, animations: [], lodLevels: [0] };
    });
    return new UploadedWorldCatalogProjection({ scene: new THREE.Scene(), player: { position: new THREE.Vector3(10, 0, 10) },
      landscape: { chunkManager: { getElevationAt: () => 0 } } } as never);
  }

  it("tags every rendered placement and applies a persisted replacement at its location", async () => {
    const projection = make();
    const original = house("glb_house_a", "1".repeat(64)), replacement = house("glb_house_b", "2".repeat(64));
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [original, replacement] });
    projection.update();
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    const before = targets(projection);
    expect(Object.keys(before).length).toBeGreaterThan(0);
    expect(Object.keys(before).every(ref => /^uploaded:-?\d+:-?\d+:\d+$/.test(ref))).toBe(true);
    const ref = Object.keys(before).find(key => before[key] === "glb_house_a")!;
    expect(ref).toBeDefined();

    projection.setVisualOverrides({ schemaVersion: "aurion.world-visual-overrides.v1", worldId: "w", overrides: [{ placementRef: ref, targetKind: "uploaded_anchor", assetId: "glb_house_b", revision: 1 }], revisions: { [ref]: 1 }, readbackHash: "h1" });
    projection.update();
    await vi.waitFor(() => expect(targets(projection)[ref]).toBe("glb_house_b"));

    // A new catalog revision may change the automatic choice; the replacement stays at its location.
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "f".repeat(64), entries: [original, replacement, house("glb_house_c", "3".repeat(64))] });
    projection.update();
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    await vi.waitFor(() => expect(targets(projection)[ref]).toBe("glb_house_b"));
    projection.dispose();
  });

  it("addresses World Design placements by design and placement key", async () => {
    const projection = make();
    const wellAsset = house("glb_well", "4".repeat(64));
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [wellAsset] });
    projection.setWorldDesign({ schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64), designs: [{
      designKey: "village", version: 1, title: "Village", designHash: "c".repeat(64), expectedCatalogRevision: "a".repeat(64),
      placements: [{ placementKey: "well", assetId: wellAsset.assetId, chunkX: 0, chunkZ: 0, xMm: 12000, zMm: 12000, rotationQuarterTurns: 0, scalePermille: 1000 }],
    }] });
    projection.update();
    await vi.waitFor(() => expect(targets(projection)["authored:village:well"]).toBe("glb_well"));
    projection.dispose();
  });

  // Review (Devin, CodeRabbit): an 80+80-character key pair made authoredPlacementRef
  // throw inside update(), which runs on the world frame loop and stopped the game.
  it("keeps rendering and addressing a placement with very long design keys", async () => {
    const projection = make();
    const wellAsset = house("glb_well", "4".repeat(64)), replacement = house("glb_well_new", "5".repeat(64));
    const designKey = `d${"a".repeat(79)}`, placementKey = `p${"b".repeat(79)}`;
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [wellAsset, replacement] });
    projection.setWorldDesign({ schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64), designs: [{
      designKey, version: 1, title: "Long keys", designHash: "c".repeat(64), expectedCatalogRevision: "a".repeat(64),
      placements: [{ placementKey, assetId: wellAsset.assetId, chunkX: 0, chunkZ: 0, xMm: 12000, zMm: 12000, rotationQuarterTurns: 0, scalePermille: 1000 }],
    }] });
    expect(() => projection.update()).not.toThrow();
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    const ref = authoredPlacementRef(designKey, placementKey);
    expect(targets(projection)[ref]).toBe("glb_well");
    projection.setVisualOverrides({ schemaVersion: "aurion.world-visual-overrides.v1", worldId: "w", overrides: [{ placementRef: ref, targetKind: "authored_placement", assetId: "glb_well_new", revision: 1 }], revisions: { [ref]: 1 }, readbackHash: "h-long" });
    projection.update();
    await vi.waitFor(() => expect(targets(projection)[ref]).toBe("glb_well_new"));
    projection.dispose();
  });

  // Review (Devin): the replacement lookup accepted any unassigned arena, unlike the server rule.
  it("never displays a replacement that is not an approved world model", async () => {
    const projection = make();
    const original = house("glb_house_a", "1".repeat(64));
    const autoArena = { ...house("glb_auto_arena", "6".repeat(64)), purpose: "auto" } as GlbCatalogEntry;
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [original, autoArena] });
    projection.update();
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    const before = targets(projection);
    const ref = Object.keys(before).find(key => before[key] === "glb_house_a")!;
    projection.setVisualOverrides({ schemaVersion: "aurion.world-visual-overrides.v1", worldId: "w", overrides: [{ placementRef: ref, targetKind: "uploaded_anchor", assetId: "glb_auto_arena", revision: 1 }], revisions: { [ref]: 1 }, readbackHash: "h-auto" });
    projection.update();
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    expect(targets(projection)[ref]).toBe("glb_house_a");
    projection.dispose();
  });

  // Design brief 2026-11-10: the admin must be able to remove a world object, not only swap it.
  it("stops drawing a placement the admin removed and draws it again once restored", async () => {
    const projection = make();
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [house("glb_house_a", "1".repeat(64))] });
    projection.update();
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    const before = Object.keys(targets(projection));
    const ref = before[0]!;
    const removed = { schemaVersion: "aurion.world-visual-overrides.v1" as const, worldId: "w", overrides: [{ placementRef: ref, targetKind: "uploaded_anchor" as const, assetId: WORLD_VISUAL_REMOVED_ASSET_ID, revision: 1 }], revisions: { [ref]: 1 }, readbackHash: "removed" };
    expect(projection.setVisualOverrides(removed)).toBe(true);
    expect(projection.setVisualOverrides(removed)).toBe(false); // same confirmed readback: nothing to re-read
    projection.update();
    await vi.waitFor(() => expect(Object.keys(targets(projection)).sort()).toEqual(before.filter(key => key !== ref).sort()));
    expect(projection.setVisualOverrides({ ...removed, overrides: [], revisions: { [ref]: 2 }, readbackHash: "restored" })).toBe(true);
    projection.update();
    await vi.waitFor(() => expect(Object.keys(targets(projection)).sort()).toEqual([...before].sort()));
    projection.dispose();
  });

  it("draws the admin's replacement of a procedural Aurion model at that model's spot, addressable for restore", async () => {
    const original = [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 1, z: 1 }].flatMap(chunk => worldAssetsForChunk(GLOBAL_WORLD_SEED, chunk))[0]!;
    const ref = shippedPlacementRef(original.id);
    const projection = make();
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [house("glb_house_b", "2".repeat(64))] });
    const readback = (assetId: string, readbackHash: string) => ({ schemaVersion: "aurion.world-visual-overrides.v1" as const, worldId: "w",
      overrides: [{ placementRef: ref, targetKind: "shipped_placement" as const, assetId, revision: 1 }], revisions: { [ref]: 1 }, readbackHash });
    const holderOf = () => { let found: THREE.Object3D | undefined; projection.root.traverse(node => { if (node.userData.worldVisualTarget?.placementRef === ref) found = node; }); return found; };

    // Removed: Aurion no longer plans it and the client draws nothing in its place.
    projection.setVisualOverrides(readback(WORLD_VISUAL_REMOVED_ASSET_ID, "h-removed"));
    projection.update();
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    expect(holderOf()).toBeUndefined();

    projection.setVisualOverrides(readback("glb_house_b", "h-replaced"));
    projection.update();
    await vi.waitFor(() => expect(holderOf()).toBeDefined());
    const holder = holderOf()!;
    expect(holder.userData.worldVisualTarget).toMatchObject({ placementRef: ref, targetKind: "shipped_placement", assetId: "glb_house_b" });
    projection.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder).getCenter(new THREE.Vector3());
    expect(Math.abs(box.x - original.xMm / 1000)).toBeLessThan(1);
    expect(Math.abs(box.z - original.zMm / 1000)).toBeLessThan(1);

    // A replacement that is not an approved world model is never shown.
    projection.setVisualOverrides(readback("glb_not_in_catalog", "h-unknown"));
    projection.update();
    await vi.waitFor(() => expect(holderOf()).toBeUndefined());
    projection.dispose();
  });
});

describe("admin cursor on a rendered house", () => {
  it("returns the house's world visual target through the engine raycast instead of an unknown terrain hit", async () => {
    const { MMOEngine } = await import("../core/MMOEngine");
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => {
      const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
      return { scene, animations: [], lodLevels: [0] };
    });
    const scene = new THREE.Scene();
    const projection = new UploadedWorldCatalogProjection({ scene, player: { position: new THREE.Vector3(10, 0, 10) },
      landscape: { chunkManager: { getElevationAt: () => 0 } } } as never);
    const sha = "5".repeat(64);
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [{ assetId: "glb_house", sha256: sha, displayName: "Fachwerkhaus",
      purpose: "world-environment", assetType: "arena", targetKey: null, subcategory: "building", equipmentSlot: null, storageUrl: `/api/assets/glb/${sha}.glb` } as GlbCatalogEntry] });
    projection.update();
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    let holder: THREE.Object3D | undefined;
    projection.root.traverse(node => { if (!holder && node.userData.worldVisualTarget) holder = node; });
    expect(holder).toBeDefined();
    scene.updateMatrixWorld(true);
    const target = new THREE.Box3().setFromObject(holder!).getCenter(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    camera.position.set(target.x, target.y + 3, target.z + 20); camera.lookAt(target); camera.updateMatrixWorld(true);
    const hit = MMOEngine.prototype.performAdminRaycast.call({ container: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) }, camera, scene } as never, 100, 100);
    expect(hit?.entityData).toMatchObject({ worldVisualTarget: true, targetKind: "uploaded_anchor", assetId: "glb_house", displayName: "Fachwerkhaus" });
    expect(hit.entityData.placementRef).toMatch(/^uploaded:-?\d+:-?\d+:\d+$/);
    projection.dispose();
  });
});

describe("authored placement render robustness", () => {
  const crate = { assetId: "glb_crate", sha256: "9".repeat(64), displayName: "Kiste", purpose: "world-environment", assetType: "arena",
    targetKey: null, subcategory: "street-prop", equipmentSlot: null, storageUrl: `/api/assets/glb/${"9".repeat(64)}.glb` } as GlbCatalogEntry;
  const box = () => { const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial())); return { scene, animations: [], lodLevels: [0] }; };
  const worldDesign = (revision: string, placements: number) => ({ schemaVersion: "aurion.world-design.v1" as const, revision: revision.repeat(64), designs: placements ? [{
    designKey: "admin.placements.1a2b3c4d", version: 1, title: "Admin-Platzierungen", designHash: "c".repeat(64), expectedCatalogRevision: "a".repeat(64),
    placements: [{ placementKey: "p.000000000001", assetId: crate.assetId, chunkX: 0, chunkZ: 0, xMm: 33_000, zMm: 32_000, rotationQuarterTurns: 0 as const, scalePermille: 1000 }] }] : [] });
  const authored = (projection: UploadedWorldCatalogProjection) => projection.evidence().assets.filter(asset => asset.id.startsWith("authored:")).length;

  // Derived from the #1328 review: same families as the NPC shell projection.
  it("never draws an object that was removed while its model was still loading", async () => {
    const waiting: Array<(value: ReturnType<typeof box>) => void> = [];
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(() => new Promise(resolve => { waiting.push(resolve); }));
    const projection = new UploadedWorldCatalogProjection({ scene: new THREE.Scene(), player: { position: new THREE.Vector3() }, landscape: { chunkManager: { getElevationAt: () => 0 } } } as never);
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [crate] });
    projection.setWorldDesign(worldDesign("b", 1));
    projection.update();
    projection.setWorldDesign(worldDesign("d", 0));
    projection.update();
    for (const resolve of waiting.splice(0)) resolve(box());
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    expect(authored(projection)).toBe(0);
    projection.dispose();
  });

  it("retries an object whose terrain was not ready yet", async () => {
    let now = 1_000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async () => box());
    let terrainReady = false;
    const projection = new UploadedWorldCatalogProjection({ scene: new THREE.Scene(), player: { position: new THREE.Vector3() }, landscape: { chunkManager: { getElevationAt: () => (terrainReady ? 0 : Number.NaN) } } } as never);
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [crate] });
    projection.setWorldDesign(worldDesign("b", 1));
    projection.update();
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    expect(authored(projection)).toBe(0);
    terrainReady = true;
    now += 2_500;
    projection.update();
    await vi.waitFor(() => expect(authored(projection)).toBe(1));
    projection.dispose();
  });
});

describe("city wall admission under device memory contention", () => {
  // Production 2026-11-07: the wall was visible on PC and missing on Android phones.
  // Earlier tests mocked the model load without the shared memory budget, so the
  // race below (fast small models fill the budget, the 9 MB wall arrives last) was
  // never exercised. This test runs the real pool with the real wall headroom.
  it("renders the wall although faster-loading scenery would exhaust the device budget first", async () => {
    const wallLods = AURION_STARTER_CITY_WALL_LODS.map(lod => ({ level: lod.level, sha256: lod.sha256, bytes: lod.bytes,
      assetId: `glb_${lod.sha256.slice(0, 48)}`, storageUrl: `/api/assets/glb/${lod.sha256}.glb`, targetKey: null,
      normalization: { lod: { level: lod.level } } }));
    const wall = { assetId: wallLods[0]!.assetId, sha256: wallLods[0]!.sha256, displayName: "Wall", purpose: "world-environment", assetType: "arena",
      targetKey: null, subcategory: "structure", equipmentSlot: null, storageUrl: wallLods[0]!.storageUrl, lods: wallLods } as unknown as GlbCatalogEntry;
    const house = { ...wall, assetId: "glb_house", sha256: "d".repeat(64), subcategory: "building", storageUrl: `/api/assets/glb/${"d".repeat(64)}.glb`, lods: undefined } as GlbCatalogEntry;
    const limits = glbResourcePool.limits;
    const reservations: Array<() => void> = [];
    const holdsSeenByScenery: boolean[] = [];
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(async entry => {
      const isWall = entry.sha256 === wall.sha256;
      // Scenery finishes downloading at once; the wall's 9 MB LODs arrive last.
      await new Promise(resolve => setTimeout(resolve, isWall ? 30 : 0));
      if (!isWall) holdsSeenByScenery.push(AURION_STARTER_CITY_WALL_HEADROOM_KEY in glbResourcePool.evidence().heldHeadroom);
      const parts = isWall
        ? selectStaticWorldLodVariants(entry).map(variant => starterCityWallAllocation(variant.sha256)!)
        : [{ decodedBytes: Math.floor(limits.decodedBytes / 4), textureBytes: Math.floor(limits.textureBytes / 4) }];
      for (const part of parts) {
        // Same admission as GLBModelManager.decode, including the wall's headroom key.
        const release = glbResourcePool.reserve({ ...part, animations: 0 }, isWall ? AURION_STARTER_CITY_WALL_HEADROOM_KEY : undefined);
        if (!release) throw Error("GLB_DECODED_BUDGET");
        reservations.push(release);
      }
      const scene = new THREE.Group(); scene.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
      return { scene, animations: [], lodLevels: [0] };
    });
    const projection = new UploadedWorldCatalogProjection({ scene: new THREE.Scene(), player: { position: new THREE.Vector3(5, 0, 5) },
      landscape: { chunkManager: { getElevationAt: () => 0 } } } as never);
    try {
      projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [wall, house] });
      projection.setWorldDesign({ schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64), designs: [{
        designKey: "starter-city-wall", version: 1, title: "City", designHash: "c".repeat(64), expectedCatalogRevision: "a".repeat(64),
        placements: [{ placementKey: "city-perimeter", assetId: wall.assetId, chunkX: 0, chunkZ: 0, xMm: 32000, zMm: 32000, rotationQuarterTurns: 0, scalePermille: 1000 },
          // Six houses would need 150 % of the device budget on their own.
          ...Array.from({ length: 6 }, (_, i) => ({ placementKey: `house-${i}`, assetId: house.assetId, chunkX: 0, chunkZ: 0,
            xMm: 20_000 + i * 2_000, zMm: 20_000, rotationQuarterTurns: 0 as const, scalePermille: 1000 }))],
      }] });
      projection.update();
      expect(projection.evidence().wallHeadroomHeld).toBe(true);
      await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
      expect(projection.evidence().assets.some(asset => asset.sha256 === wall.sha256)).toBe(true);
      // The hold was in place before any scenery reserved memory, and is gone once the wall is drawn.
      expect(holdsSeenByScenery.length).toBeGreaterThan(0);
      expect(holdsSeenByScenery.every(Boolean)).toBe(true);
      expect(projection.evidence().wallHeadroomHeld).toBe(false);
      expect(glbResourcePool.evidence().heldHeadroom).toEqual({});
      // Scenery got only what was left; nothing exceeded the profile.
      expect(glbResourcePool.evidence().reservedDecodedBytes).toBeLessThanOrEqual(limits.decodedBytes);
      expect(glbResourcePool.evidence().reservedTextureBytes).toBeLessThanOrEqual(limits.textureBytes);
    } finally {
      projection.dispose();
      reservations.forEach(release => release());
    }
    expect(glbResourcePool.evidence().heldHeadroom).toEqual({});
  });

  it("releases the wall headroom when the wall leaves the projected area or the projection is disposed", () => {
    const sha = AURION_STARTER_CITY_WALL_LODS[0].sha256;
    const wall = { assetId: "glb_citywall", sha256: sha, displayName: "Wall", purpose: "world-environment", assetType: "arena",
      targetKey: null, subcategory: "structure", equipmentSlot: null, storageUrl: `/api/assets/glb/${sha}.glb` } as GlbCatalogEntry;
    vi.spyOn(glbManager, "loadStaticLodFamily").mockImplementation(() => new Promise(() => {}));
    const engine = { scene: new THREE.Scene(), player: { position: new THREE.Vector3(5, 0, 5) }, landscape: { chunkManager: { getElevationAt: () => 0 } } };
    const projection = new UploadedWorldCatalogProjection(engine as never);
    projection.setCatalog({ version: "aurion.glb-import.v1", revision: "a".repeat(64), entries: [wall] });
    projection.setWorldDesign({ schemaVersion: "aurion.world-design.v1", revision: "b".repeat(64), designs: [{
      designKey: "starter-city-wall", version: 1, title: "City", designHash: "c".repeat(64), expectedCatalogRevision: "a".repeat(64),
      placements: [{ placementKey: "city-perimeter", assetId: wall.assetId, chunkX: 0, chunkZ: 0, xMm: 32000, zMm: 32000, rotationQuarterTurns: 0, scalePermille: 1000 }],
    }] });
    projection.update();
    expect(AURION_STARTER_CITY_WALL_HEADROOM_KEY in glbResourcePool.evidence().heldHeadroom).toBe(true);
    // Far outside the city: the wall is not wanted, its headroom returns to other models.
    projection.update({ x: 64 * 10, z: 64 * 10 });
    expect(glbResourcePool.evidence().heldHeadroom).toEqual({});
    projection.update({ x: 5, z: 5 });
    expect(AURION_STARTER_CITY_WALL_HEADROOM_KEY in glbResourcePool.evidence().heldHeadroom).toBe(true);
    projection.dispose();
    expect(glbResourcePool.evidence().heldHeadroom).toEqual({});
  });
});
