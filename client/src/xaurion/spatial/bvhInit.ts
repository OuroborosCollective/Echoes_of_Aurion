import * as THREE from 'three';
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
  MeshBVH,
  BVHHelper,
  MeshBVHHelper,
} from 'three-mesh-bvh';

let isBVHInitialized = false;

/**
 * Initializes global THREE.js prototypes with three-mesh-bvh acceleration methods.
 * Safe to call multiple times.
 */
export function initBVH(): void {
  if (isBVHInitialized) return;

  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;

  const originalDispose = THREE.BufferGeometry.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function(this: THREE.BufferGeometry) {
    if (typeof (this as any).disposeBoundsTree === 'function') {
      try {
        (this as any).disposeBoundsTree();
      } catch (_err) {
        // Safe catch-all for any three-mesh-bvh internal state issues during disposal
      }
    }
    originalDispose.call(this);
  };

  isBVHInitialized = true;
}

// Auto-initialize BVH bindings when this module is imported
initBVH();

/**
 * Backwards-compatible alias for BVHHelper / MeshBVHHelper
 */
export const MeshBVHVisualizer = BVHHelper || MeshBVHHelper;

/**
 * Helper to perform an accelerated raycast using three-mesh-bvh with firstHitOnly = true
 * for maximum mouse/touch picking performance against complex environment geometry.
 */
export function raycastFirst(
  raycaster: THREE.Raycaster,
  objects: THREE.Object3D[],
  recursive: boolean = true
): THREE.Intersection | null {
  initBVH();
  (raycaster as any).firstHitOnly = true;
  const intersects = raycaster.intersectObjects(objects, recursive);
  return intersects.length > 0 ? intersects[0] : null;
}

/**
 * Helper to perform accelerated raycasting against scene objects, returning all hits sorted by distance.
 */
export function raycastAccelerated(
  raycaster: THREE.Raycaster,
  objects: THREE.Object3D[],
  recursive: boolean = true,
  firstHitOnly: boolean = true
): THREE.Intersection[] {
  initBVH();
  (raycaster as any).firstHitOnly = firstHitOnly;
  return raycaster.intersectObjects(objects, recursive);
}

export { MeshBVH, BVHHelper, MeshBVHHelper, acceleratedRaycast, computeBoundsTree, disposeBoundsTree };

