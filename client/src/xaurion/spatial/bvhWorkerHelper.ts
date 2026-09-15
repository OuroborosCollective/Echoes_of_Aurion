import * as THREE from 'three';
import { initBVH, MeshBVH } from './bvhInit';

export interface BVHWorkerOptions {
  maxDepth?: number;
  maxLeafTris?: number;
  strategy?: number;
  verbose?: boolean;
}

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

  private failWorker(message: string): void {
    const error = new Error(message);
    for (const callback of this.pendingCallbacks.values()) callback.reject(error);
    this.pendingCallbacks.clear();
    this.worker?.terminate();
    this.worker = null;
  }

  private initWorker(): void {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    try {
      this.worker = new Worker(new URL('./bvhBuildWorker.ts', import.meta.url), {
        type: 'module',
        name: 'aurion-bvh-builder',
      });

      this.worker.onmessage = (event: MessageEvent) => {
        const { id, success, serialized, error } = event.data || {};
        const callback = this.pendingCallbacks.get(id);
        if (!callback) return;

        this.pendingCallbacks.delete(id);
        if (success) callback.resolve(serialized);
        else callback.reject(new Error(error || 'Worker BVH generation failed'));
      };

      this.worker.onerror = event => {
        const message = event.message || 'BVH worker runtime failure';
        console.warn('[BVHWorker] Worker error, falling back to main thread:', message);
        this.failWorker(message);
      };

      this.worker.onmessageerror = () => {
        const message = 'BVH worker message decoding failed';
        console.warn('[BVHWorker] Message error, falling back to main thread.');
        this.failWorker(message);
      };
    } catch (error) {
      console.warn('[BVHWorker] Unable to initialize local module worker, using main thread fallback.');
      this.failWorker(error instanceof Error ? error.message : String(error));
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
      if (idxBuffer) transferables.push(idxBuffer.buffer);

      this.worker!.postMessage(
        { id, positions: posBuffer, index: idxBuffer, options },
        transferables
      );
    });
  }
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

  const posAttr = geometry.attributes.position;
  const posArray = posAttr.array as Float32Array;
  const indexArray = geometry.index ? (geometry.index.array as Uint32Array | Uint16Array) : null;

  try {
    const pool = BVHWorkerPool.getInstance();
    const serialized = await pool.generateBVH(posArray, indexArray, options);

    if (serialized?.index) {
      const IndexTypedArray = posAttr.count > 65535 ? Uint32Array : Uint16Array;
      const source = serialized.index as ArrayLike<number>;
      geometry.setIndex(new THREE.BufferAttribute(new IndexTypedArray(source), 1));
    }

    const boundsTree = MeshBVH.deserialize(serialized, geometry);
    (geometry as any).boundsTree = boundsTree;
    return boundsTree;
  } catch (_workerError) {
    (geometry as any).computeBoundsTree(options);
    return (geometry as any).boundsTree as MeshBVH;
  }
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
