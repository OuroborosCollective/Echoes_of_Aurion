import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { GLOBAL_WORLD_SEED } from "@shared/worldIdentity";
import { worldAssetById, worldAssetsForChunk } from "@shared/worldAssetProtocol";
import { shippedPlacementIdOf, worldVisualTargetIsRemovable, worldVisualTargetKind } from "@shared/worldVisualOverrideContract";
import { shippedWorldVisualTarget } from "./shippedWorldVisualTarget";

/**
 * Live 2026-11-10: procedural world models (trees, rocks, houses of the Aurion plan)
 * are drawn as instanced batches and carried no target data, so the admin cursor
 * could not address them. Isolated client test; not production evidence.
 */
const placements = worldAssetsForChunk(GLOBAL_WORLD_SEED, { x: 3, z: -2 });

describe("admin target of a procedural world model", () => {
  it("resolves the hit instance of a batch to that placement's removable reference", () => {
    const batch = placements.filter(placement => placement.assetId === placements[0].assetId);
    const data = { worldPlacementIds: batch.map(placement => placement.id), worldPlacementAssetId: batch[0].assetId };
    batch.forEach((placement, instanceId) => {
      const target = shippedWorldVisualTarget(data, instanceId)!;
      expect(shippedPlacementIdOf(target.placementRef)).toBe(placement.id);
      expect(worldVisualTargetKind(target.placementRef)).toBe("shipped_placement");
      expect(target).toMatchObject({ targetKind: "shipped_placement", assetId: null, displayName: worldAssetById.get(placement.assetId)!.name });
      expect(worldVisualTargetIsRemovable(target.targetKind)).toBe(true);
    });
  });

  it("does not invent a target for anything that is not a procedural placement", () => {
    const ids = [placements[0].id];
    expect(shippedWorldVisualTarget({ worldPlacementIds: ids }, undefined)).toBeNull(); // plain mesh hit
    expect(shippedWorldVisualTarget({ worldPlacementIds: ids }, 1)).toBeNull(); // instance outside the batch
    expect(shippedWorldVisualTarget({ worldPlacementIds: ids }, -1)).toBeNull();
    expect(shippedWorldVisualTarget({ worldPlacementIds: ids }, 0.5)).toBeNull();
    expect(shippedWorldVisualTarget({}, 0)).toBeNull();
    expect(shippedWorldVisualTarget(undefined, 0)).toBeNull();
    // The fixed starter-village pieces (walls, gates) are authored, not procedural.
    expect(shippedWorldVisualTarget({ worldPlacementIds: ["aurion.starter-village.v1:starter-village-gate-north"] }, 0)).toBeNull();
    expect(shippedWorldVisualTarget({ worldPlacementIds: ["something else"] }, 0)).toBeNull();
  });

  it("is what the engine's admin raycast returns for the instance under the cursor", async () => {
    const { MMOEngine } = await import("../core/MMOEngine");
    const scene = new THREE.Scene();
    const two = placements.slice(0, 2);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial(), 2);
    mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-20, 1, 0));
    mesh.setMatrixAt(1, new THREE.Matrix4().makeTranslation(20, 1, 0));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.worldPlacementIds = two.map(placement => placement.id);
    mesh.userData.worldPlacementAssetId = two[0].assetId;
    const root = new THREE.Group(); root.add(mesh); scene.add(root);
    scene.updateMatrixWorld(true);
    const aimAt = (x: number) => {
      const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
      camera.position.set(x, 4, 15); camera.lookAt(x, 1, 0); camera.updateMatrixWorld(true);
      return MMOEngine.prototype.performAdminRaycast.call({ container: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 200 }) }, camera, scene } as never, 100, 100);
    };
    const left = aimAt(-20), right = aimAt(20);
    expect(left?.entityData).toMatchObject({ worldVisualTarget: true, targetKind: "shipped_placement", assetId: null });
    expect(shippedPlacementIdOf(left.entityData.placementRef)).toBe(two[0].id);
    expect(shippedPlacementIdOf(right.entityData.placementRef)).toBe(two[1].id);
    // A batch without placement ids (foreign instanced geometry) is not a world visual target.
    delete mesh.userData.worldPlacementIds;
    expect(aimAt(-20)?.entityData?.worldVisualTarget).toBeUndefined();
  });
});
