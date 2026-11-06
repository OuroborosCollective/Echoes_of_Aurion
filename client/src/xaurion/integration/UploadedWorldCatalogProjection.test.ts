import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import type { GlbCatalogEntry } from "@shared/glbImportContract";
import { AURION_STARTER_CITY_WALL_LODS } from "@shared/aurionStarterCityWallContract";
import { UploadedWorldCatalogProjection } from "./UploadedWorldCatalogProjection";
import { glbManager } from "../core/GLBModelManager";

afterEach(() => vi.restoreAllMocks());
describe("authored city wall selection", () => {
  it("keeps the wall rendered at its east edge when nearer generic props fill the cap", async () => {
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
        rotationQuarterTurns: 0, scalePermille: 1000 }, ...Array.from({ length: 20 }, (_, i) => ({ placementKey: `prop-${i}`,
        assetId: ordinary.assetId, chunkX: 1, chunkZ: 0, xMm: 18000 + i, zMm: 32000, rotationQuarterTurns: 0 as const, scalePermille: 1000 }))],
    }] });
    projection.update();
    await vi.waitFor(() => expect(projection.evidence().pending).toBe(0));
    expect(projection.evidence().rendered).toBe(18);
    expect(projection.evidence().assets.some(asset => asset.sha256 === sha)).toBe(true);
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
