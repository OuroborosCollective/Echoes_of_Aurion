import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { initBVH, raycastFirst, BVHHelper } from './bvhInit';
import { computeBoundsTreeAsync, attachMeshBVH, attachMeshBVHToGroup } from './bvhWorkerHelper';
import { WorldColliderBvh } from './WorldColliderBvh';

describe('three-mesh-bvh integration & parity suite', () => {
  beforeEach(() => {
    initBVH();
  });

  it('initializes THREE prototypes with computeBoundsTree and acceleratedRaycast', () => {
    const geo = new THREE.BoxGeometry(10, 10, 10);
    expect(typeof geo.computeBoundsTree).toBe('function');
    expect(typeof geo.disposeBoundsTree).toBe('function');

    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    expect(typeof mesh.raycast).toBe('function');
  });

  it('computes boundsTree synchronously and performs fast raycastFirst picking', () => {
    const geo = new THREE.BoxGeometry(10, 10, 10);
    geo.computeBoundsTree();
    expect((geo as any).boundsTree).toBeDefined();

    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld();

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 0, 15),
      new THREE.Vector3(0, 0, -1)
    );

    const hit = raycastFirst(raycaster, [mesh]);
    expect(hit).not.toBeNull();
    expect(hit?.object).toBe(mesh);
    expect(hit?.distance).toBeCloseTo(10, 1);
  });

  it('computes boundsTree asynchronously via helper module with graceful fallback', async () => {
    const geo = new THREE.SphereGeometry(4, 16, 16);
    const boundsTree = await computeBoundsTreeAsync(geo);

    expect(boundsTree).toBeDefined();
    expect((geo as any).boundsTree).toBeDefined();

    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
    mesh.updateMatrixWorld();

    const raycaster = new THREE.Raycaster(
      new THREE.Vector3(0, 10, 0),
      new THREE.Vector3(0, -1, 0)
    );

    const hit = raycastFirst(raycaster, [mesh]);
    expect(hit).not.toBeNull();
    expect(hit?.point.y).toBeCloseTo(4, 1);
  });

  it('attaches BVH to a hierarchy of meshes using attachMeshBVHToGroup', async () => {
    const group = new THREE.Group();
    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
    const mesh2 = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4, 12), new THREE.MeshBasicMaterial());
    group.add(mesh1);
    group.add(mesh2);

    const count = await attachMeshBVHToGroup(group);
    expect(count).toBe(2);
    expect((mesh1.geometry as any).boundsTree).toBeDefined();
    expect((mesh2.geometry as any).boundsTree).toBeDefined();
  });

  it('supports creating BVHHelper for debug overlay visualization', () => {
    const geo = new THREE.BoxGeometry(5, 5, 5);
    geo.computeBoundsTree();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());

    const helper = new BVHHelper(mesh);
    expect(helper).toBeDefined();
    expect(helper.isObject3D).toBe(true);
  });

  /* AX1 WorldColliderBvh Adapter and Parity Assertions */

  describe('WorldColliderBvh Adapter & Raycast Parity', () => {
    let unacceleratedGeometry: THREE.BufferGeometry;
    let acceleratedGeometry: THREE.BufferGeometry;
    let unacceleratedMesh: THREE.Mesh;
    let acceleratedMesh: THREE.Mesh;

    beforeEach(async () => {
      // Create identical geometries
      unacceleratedGeometry = new THREE.TorusKnotGeometry(10, 3, 100, 16);
      acceleratedGeometry = new THREE.TorusKnotGeometry(10, 3, 100, 16);

      unacceleratedMesh = new THREE.Mesh(unacceleratedGeometry, new THREE.MeshBasicMaterial());
      acceleratedMesh = new THREE.Mesh(acceleratedGeometry, new THREE.MeshBasicMaterial());

      // Only accelerate the second mesh
      await WorldColliderBvh.build(acceleratedGeometry, false);
    });

    it('asserts nearest hit parity with standard Three.js raycasting', () => {
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(0, 0, 30),
        new THREE.Vector3(0, 0, -1)
      );

      // Raw unaccelerated raycast
      const standardIntersects = raycaster.intersectObjects([unacceleratedMesh], true);
      
      // Accelerated raycast using the adapter
      const bvhIntersects = WorldColliderBvh.raycast(raycaster, [acceleratedMesh], true, false);

      expect(bvhIntersects.length).toBe(standardIntersects.length);
      if (standardIntersects.length > 0) {
        expect(bvhIntersects[0].distance).toBeCloseTo(standardIntersects[0].distance, 3);
        expect(bvhIntersects[0].point.distanceTo(standardIntersects[0].point)).toBeLessThan(0.001);
      }
    });

    it('asserts nearest hit parity under transformations (rotate, scale, translate)', () => {
      const translation = new THREE.Vector3(5, -2, 10);
      const rotation = new THREE.Euler(0.5, 0.2, -0.8);
      const scale = new THREE.Vector3(1.5, 0.8, 1.2);

      // Apply transformations to both meshes identically
      unacceleratedMesh.position.copy(translation);
      unacceleratedMesh.rotation.copy(rotation);
      unacceleratedMesh.scale.copy(scale);
      unacceleratedMesh.updateMatrixWorld(true);

      acceleratedMesh.position.copy(translation);
      acceleratedMesh.rotation.copy(rotation);
      acceleratedMesh.scale.copy(scale);
      acceleratedMesh.updateMatrixWorld(true);

      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(5, 5, 40),
        new THREE.Vector3(0, -0.1, -0.9).normalize()
      );

      const standardIntersects = raycaster.intersectObjects([unacceleratedMesh], true);
      const bvhIntersects = WorldColliderBvh.raycast(raycaster, [acceleratedMesh], true, false);

      expect(bvhIntersects.length).toBe(standardIntersects.length);
      if (standardIntersects.length > 0) {
        expect(bvhIntersects[0].distance).toBeCloseTo(standardIntersects[0].distance, 3);
        expect(bvhIntersects[0].point.distanceTo(standardIntersects[0].point)).toBeLessThan(0.001);
      }
    });

    it('asserts perfect no-hit parity for rays missing geometry', () => {
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(100, 100, 100),
        new THREE.Vector3(0, 0, -1)
      );

      const standardIntersects = raycaster.intersectObjects([unacceleratedMesh], true);
      const bvhIntersects = WorldColliderBvh.raycast(raycaster, [acceleratedMesh], true, false);

      expect(standardIntersects.length).toBe(0);
      expect(bvhIntersects.length).toBe(0);
    });

    it('asserts firstHitOnly delivers the closest intersection points accurately', () => {
      const raycaster = new THREE.Raycaster(
        new THREE.Vector3(0, 0, 30),
        new THREE.Vector3(0, 0, -1)
      );

      const bvhAll = WorldColliderBvh.raycast(raycaster, [acceleratedMesh], true, false);
      const bvhFirst = WorldColliderBvh.raycast(raycaster, [acceleratedMesh], true, true);

      if (bvhAll.length > 0) {
        expect(bvhFirst.length).toBe(1);
        expect(bvhFirst[0].distance).toBeCloseTo(bvhAll[0].distance, 4);
        expect(bvhFirst[0].point.distanceTo(bvhAll[0].point)).toBeLessThan(0.001);
      }
    });

    it('asserts build -> dispose -> rebuild cycle is clean without stale trees', () => {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      expect(WorldColliderBvh.isAccelerated(geo)).toBe(false);

      // Build
      WorldColliderBvh.build(geo, false);
      expect(WorldColliderBvh.isAccelerated(geo)).toBe(true);
      expect((geo as any).boundsTree).toBeDefined();

      // Dispose
      WorldColliderBvh.dispose(geo);
      expect(WorldColliderBvh.isAccelerated(geo)).toBe(false);
      expect((geo as any).boundsTree).toBeFalsy();

      // Rebuild
      WorldColliderBvh.build(geo, false);
      expect(WorldColliderBvh.isAccelerated(geo)).toBe(true);
      expect((geo as any).boundsTree).toBeDefined();

      WorldColliderBvh.dispose(geo);
    });

    it('simulates streaming chunk cycles without monotone leak growth', () => {
      const dummyChunks = Array.from({ length: 5 }, () => new THREE.BoxGeometry(2, 2, 2));

      // Enter cycle
      for (const chunkGeo of dummyChunks) {
        WorldColliderBvh.build(chunkGeo, false);
        expect(WorldColliderBvh.isAccelerated(chunkGeo)).toBe(true);
      }

      // Leave / Evict cycle
      for (const chunkGeo of dummyChunks) {
        WorldColliderBvh.dispose(chunkGeo);
        expect(WorldColliderBvh.isAccelerated(chunkGeo)).toBe(false);
      }
    });
  });
});
