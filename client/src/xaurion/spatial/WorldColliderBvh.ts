import * as THREE from 'three';
import { initBVH, MeshBVH, raycastFirst, raycastAccelerated } from './bvhInit';
import { computeBoundsTreeAsync } from './bvhWorkerHelper';

/**
 * WorldColliderBvh
 * Highly optimized, deterministic spatial acceleration layer for AX1 Three.js scene geometry.
 * 
 * Primary Scope:
 * - Static world / terrain / building / rock collider meshes
 * - Raycast interaction / administrative picking / Line-of-Sight occlusion queries
 * 
 * Strict Boundary:
 * - BVH is exclusively used to accelerate presentation, rendering, picking, and LOS queries.
 * - Under no circumstances does BVH derive, override, or alter gameplay, collision authority,
 *   or server-validated WASD world state.
 */
export class WorldColliderBvh {
  private static registeredGeometries = new WeakSet<THREE.BufferGeometry>();

  /**
   * Builds the acceleration structure for a buffer geometry.
   * Ensures the build happens once per geometry generation lifecycle.
   */
  public static async build(geometry: THREE.BufferGeometry, useWorker: boolean = true): Promise<void> {
    if (!geometry) return;
    if (!geometry.attributes.position) {
      throw new Error('WorldColliderBvh: Geometry lacks position attributes.');
    }

    if (this.registeredGeometries.has(geometry)) {
      return; // Already built for this generation
    }

    if (useWorker) {
      await computeBoundsTreeAsync(geometry);
    } else {
      initBVH();
      (geometry as any).computeBoundsTree();
    }

    this.registeredGeometries.add(geometry);
  }

  /**
   * Explicitly disposes of the geometry bounds tree when the chunk/mesh is evicted.
   * Prevents stale memory and tree leaks.
   */
  public static dispose(geometry: THREE.BufferGeometry): void {
    if (!geometry) return;
    
    if ((geometry as any).disposeBoundsTree) {
      (geometry as any).disposeBoundsTree();
    }
    
    if ((geometry as any).boundsTree) {
      delete (geometry as any).boundsTree;
    }

    this.registeredGeometries.delete(geometry);
  }

  /**
   * Performs accelerated picking/occlusion query against specified objects.
   * Leverages firstHitOnly optimizations where only the closest point is needed.
   */
  public static raycast(
    raycaster: THREE.Raycaster,
    objects: THREE.Object3D[],
    recursive: boolean = true,
    firstHitOnly: boolean = true
  ): THREE.Intersection[] {
    if (!objects || objects.length === 0) return [];

    if (firstHitOnly) {
      const hit = raycastFirst(raycaster, objects, recursive);
      return hit ? [hit] : [];
    }

    return raycastAccelerated(raycaster, objects, recursive, false);
  }

  /**
   * Checks if the geometry has a valid BVH bounds tree.
   */
  public static isAccelerated(geometry: THREE.BufferGeometry): boolean {
    return Boolean(geometry && (geometry as any).boundsTree);
  }
}
