import * as THREE from 'three';
import { initBVH, MeshBVH } from './bvhInit';

export interface BVHWorkerOptions {
  maxDepth?: number;
  maxLeafTris?: number;
  strategy?: number;
  verbose?: boolean;
}

/**
 * Inline WebWorker source code for three-mesh-bvh tree generation.
 * Offloads BVH tree building from the main UI thread during environment asset loading.
 */
const WORKER_SCRIPT = `
importScripts('https://unpkg.com/three@0.185.1/build/three.min.js');
importScripts('https://unpkg.com/three-mesh-bvh@0.9.15/build/index.umd.cjs');

self.onmessage = function(e) {
  var data = e.data;
  var id = data.id;
  var positions = data.positions;
  var index = data.index;
  var options = data.options || {};

  try {
    var geo = new self.THREE.BufferGeometry();
    geo.setAttribute('position', new self.THREE.BufferAttribute(positions, 3));
    if (index) {
      geo.setIndex(new self.THREE.BufferAttribute(index, 1));
    }

    var bvh = new self.MeshBVH.MeshBVH(geo, options);
    var serialized = self.MeshBVH.MeshBVH.serialize(bvh);

    var transferables = [];
    if (serialized.roots) {
      for (var i = 0; i < serialized.roots.length; i++) {
        if (serialized.roots[i]) transferables.push(serialized.roots[i]);
      }
    }
    if (serialized.index) transferables.push(serialized.index);
    if (serialized.indirectBuffer) transferables.push(serialized.indirectBuffer);

    self.postMessage({ id: id, success: true, serialized: serialized }, transferables);
  } catch (err) {
    self.postMessage({ id: id, success: false, error: err ? err.message : String(err) });
  }
};
`;

class BVHWorkerPool {
  private static instance: BVHWorkerPool | null = null;
  private worker: Worker | null = null;
  private pendingCallbacks = new Map<
    string,
    { resolve: (data: any) => void; reject: (err: Error) => void }
  >();
  private messageCounter = 0;

  private constructor() {
    this.initWorker();
  }

  public static getInstance(): BVHWorkerPool {
    if (!BVHWorkerPool.instance) {
      BVHWorkerPool.instance = new BVHWorkerPool();
    }
    return BVHWorkerPool.instance;
  }

  private initWorker(): void {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return; // SSR or environment without Worker support
    }

    try {
      // Create inline blob worker
      const blob = new Blob([WORKER_SCRIPT], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);

      this.worker.onmessage = (e: MessageEvent) => {
        const { id, success, serialized, error } = e.data || {};
        const callback = this.pendingCallbacks.get(id);
        if (callback) {
          this.pendingCallbacks.delete(id);
          if (success) {
            callback.resolve(serialized);
          } else {
            callback.reject(new Error(error || 'Worker BVH generation failed'));
          }
        }
      };

      this.worker.onerror = (err) => {
        console.warn('[BVHWorker] Worker error, falling back to main thread:', err.message);
      };
    } catch (err) {
      console.warn('[BVHWorker] Unable to initialize WebWorker for BVH, using main thread fallback.');
      this.worker = null;
    }
  }

  public generateBVH(
    positions: Float32Array,
    index: Uint32Array | Uint16Array | null,
    options?: BVHWorkerOptions
  ): Promise<any> {
    if (!this.worker) {
      return Promise.reject(new Error('Worker not available'));
    }

    const id = `bvh_req_${++this.messageCounter}`;
    return new Promise((resolve, reject) => {
      this.pendingCallbacks.set(id, { resolve, reject });

      const posBuffer = positions.slice(0);
      const idxBuffer = index ? index.slice(0) : null;

      const transferables: Transferable[] = [posBuffer.buffer];
      if (idxBuffer) {
        transferables.push(idxBuffer.buffer);
      }

      this.worker!.postMessage(
        {
          id,
          positions: posBuffer,
          index: idxBuffer,
          options,
        },
        transferables
      );
    });
  }
}

/**
 * Offloads three-mesh-bvh tree generation to a WebWorker.
 * Deserializes the output and attaches `boundsTree` to the geometry on completion.
 * Falls back to main thread synchronous computation if Worker is unavailable or fails.
 */
export async function computeBoundsTreeAsync(
  geometry: THREE.BufferGeometry,
  options?: BVHWorkerOptions
): Promise<MeshBVH> {
  initBVH();

  if (!geometry || !geometry.attributes.position) {
    throw new Error('Invalid geometry for BVH computation');
  }

  const posAttr = geometry.attributes.position;
  const posArray = posAttr.array as Float32Array;
  const indexArray = geometry.index ? (geometry.index.array as Uint32Array | Uint16Array) : null;

  try {
    const pool = BVHWorkerPool.getInstance();
    const serialized = await pool.generateBVH(posArray, indexArray, options);

    if (serialized && serialized.index) {
      const IndexTypedArray = posAttr.count > 65535 ? Uint32Array : Uint16Array;
      geometry.setIndex(new THREE.BufferAttribute(new IndexTypedArray(serialized.index), 1));
    }

    const boundsTree = MeshBVH.deserialize(serialized, geometry);
    (geometry as any).boundsTree = boundsTree;
    return boundsTree;
  } catch (_workerError) {
    // Graceful fallback to main-thread computeBoundsTree
    (geometry as any).computeBoundsTree(options);
    return (geometry as any).boundsTree as MeshBVH;
  }
}

/**
 * Helper to compute and attach BVH to a single Mesh's geometry.
 */
export async function attachMeshBVH(
  mesh: THREE.Mesh,
  options?: BVHWorkerOptions & { useWorker?: boolean }
): Promise<MeshBVH | null> {
  if (!mesh || !mesh.isMesh || !mesh.geometry) return null;

  const useWorker = options?.useWorker !== false;
  if (useWorker) {
    return computeBoundsTreeAsync(mesh.geometry, options);
  } else {
    initBVH();
    (mesh.geometry as any).computeBoundsTree(options);
    return (mesh.geometry as any).boundsTree as MeshBVH;
  }
}

/**
 * Helper to traverse a group/scene and compute BVH for all descendant meshes.
 */
export async function attachMeshBVHToGroup(
  root: THREE.Object3D,
  options?: BVHWorkerOptions & { useWorker?: boolean }
): Promise<number> {
  let count = 0;
  const promises: Promise<any>[] = [];

  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry && mesh.geometry.attributes.position) {
      count++;
      promises.push(attachMeshBVH(mesh, options));
    }
  });

  await Promise.all(promises);
  return count;
}
