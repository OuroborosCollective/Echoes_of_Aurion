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
