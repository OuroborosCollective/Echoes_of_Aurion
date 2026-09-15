import * as THREE from 'three';
import { initBVH, MeshBVH } from './bvhInit';

export interface BVHWorkerOptions {
  maxDepth?: number;
  maxLeafTris?: number;
  strategy?: number;
  verbose?: boolean;
}

/**
 * Offloads three-mesh-bvh tree generation to a locally bundled module worker.
 * Deserializes the output and attaches `boundsTree` to the geometry on completion.
 * Falls back to main-thread computation if Worker is unavailable or fails.
 */
export async function computeBoundsTreeAsync(
  geometry: THREE.BufferGeometry,
  options?: BVHWorkerOptions
): Promise<MeshBVH> {
  initBVH();

  if (!geometry || !geometry.attributes.position) {
    throw new Error('Invalid geometry for BVH computation');
  }

  // Fallback to main-thread computation since worker was removed
  (geometry as any).computeBoundsTree(options);
  return (geometry as any).boundsTree as MeshBVH;
}

export async function attachMeshBVH(
  mesh: THREE.Mesh,
  options?: BVHWorkerOptions & { useWorker?: boolean }
): Promise<MeshBVH | null> {
  if (!mesh || !mesh.isMesh || !mesh.geometry) return null;

  if (options?.useWorker !== false) return computeBoundsTreeAsync(mesh.geometry, options);

  initBVH();
  (mesh.geometry as any).computeBoundsTree(options);
  return (mesh.geometry as any).boundsTree as MeshBVH;
}

export async function attachMeshBVHToGroup(
  root: THREE.Object3D,
  options?: BVHWorkerOptions & { useWorker?: boolean }
): Promise<number> {
  let count = 0;
  const promises: Promise<any>[] = [];

  root.traverse(child => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry && mesh.geometry.attributes.position) {
      count++;
      promises.push(attachMeshBVH(mesh, options));
    }
  });

  await Promise.all(promises);
  return count;
}
