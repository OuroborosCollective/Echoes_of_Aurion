/// <reference lib="webworker" />

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

type BVHBuildRequest = {
  id: string;
  positions: Float32Array;
  index: Uint32Array | Uint16Array | null;
  options?: Record<string, unknown>;
};

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

function transferableBuffer(value: unknown): ArrayBuffer | null {
  if (value instanceof ArrayBuffer) return value;
  if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) return value.buffer;
  return null;
}

workerScope.onmessage = (event: MessageEvent<BVHBuildRequest>) => {
  const { id, positions, index, options = {} } = event.data;

  try {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (index) geometry.setIndex(new THREE.BufferAttribute(index, 1));

    const bvh = new MeshBVH(geometry, options as any);
    const serialized = MeshBVH.serialize(bvh);
    const transferables: Transferable[] = [];

    for (const root of serialized.roots ?? []) {
      const buffer = transferableBuffer(root);
      if (buffer) transferables.push(buffer);
    }
    for (const value of [serialized.index, (serialized as any).indirectBuffer]) {
      const buffer = transferableBuffer(value);
      if (buffer) transferables.push(buffer);
    }

    workerScope.postMessage({ id, success: true, serialized }, transferables);
  } catch (error) {
    workerScope.postMessage({
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export {};
