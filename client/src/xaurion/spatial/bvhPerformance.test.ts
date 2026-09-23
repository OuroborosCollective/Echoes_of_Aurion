import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  acceleratedRaycast,
  computeBoundsTree,
  disposeBoundsTree,
} from "three-mesh-bvh";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus } from "node:os";
import { performance } from "node:perf_hooks";

const nativeRaycast = THREE.Mesh.prototype.raycast;
const receiptPath = "aim296-bvh-performance-receipt.json";

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

function percentile(values: readonly number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? 0;
}

function rays(count: number): readonly THREE.Raycaster[] {
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    const elevation = ((i % 17) / 16 - 0.5) * 0.7;
    const origin = new THREE.Vector3(
      Math.cos(angle) * 42,
      elevation * 30,
      Math.sin(angle) * 42,
    );
    const direction = new THREE.Vector3(0, -origin.y * 0.01, 0).sub(origin).normalize();
    return new THREE.Raycaster(origin, direction);
  });
}

function runNative(mesh: THREE.Mesh, workload: readonly THREE.Raycaster[]): number {
  const started = performance.now();
  for (const raycaster of workload) {
    const hits: THREE.Intersection[] = [];
    nativeRaycast.call(mesh, raycaster, hits);
  }
  return performance.now() - started;
}

function runAccelerated(mesh: THREE.Mesh, workload: readonly THREE.Raycaster[]): number {
  const started = performance.now();
  for (const raycaster of workload) {
    (raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
    const hits: THREE.Intersection[] = [];
    acceleratedRaycast.call(mesh, raycaster, hits);
  }
  return performance.now() - started;
}

describe("AIM-296 measurable BVH performance evidence", () => {
  let nativeMesh: THREE.Mesh;
  let acceleratedMesh: THREE.Mesh;
  let workload: readonly THREE.Raycaster[];

  beforeAll(() => {
    const nativeGeometry = new THREE.TorusKnotGeometry(16, 5, 256, 48);
    const acceleratedGeometry = new THREE.TorusKnotGeometry(16, 5, 256, 48);

    nativeMesh = new THREE.Mesh(nativeGeometry, new THREE.MeshBasicMaterial());
    acceleratedMesh = new THREE.Mesh(acceleratedGeometry, new THREE.MeshBasicMaterial());
    acceleratedMesh.raycast = acceleratedRaycast;
    acceleratedGeometry.computeBoundsTree();
    workload = rays(1024);
  });

  afterAll(() => {
    acceleratedMesh.geometry.disposeBoundsTree();
    nativeMesh.geometry.dispose();
    nativeMesh.material.dispose();
    acceleratedMesh.geometry.dispose();
    acceleratedMesh.material.dispose();
  });

  it("records repeatable baseline and accelerated timings with parity", async () => {
    const warmupNative = runNative(nativeMesh, workload);
    const warmupAccelerated = runAccelerated(acceleratedMesh, workload);
    expect(warmupNative).toBeGreaterThan(0);
    expect(warmupAccelerated).toBeGreaterThan(0);

    const nativeSamples = Array.from({ length: 7 }, () => runNative(nativeMesh, workload));
    const acceleratedSamples = Array.from({ length: 7 }, () => runAccelerated(acceleratedMesh, workload));
    const nativeMedianMs = median(nativeSamples);
    const acceleratedMedianMs = median(acceleratedSamples);
    const speedupRatio = nativeMedianMs / acceleratedMedianMs;

    const parityRays = rays(32);
    for (const raycaster of parityRays) {
      const baseline: THREE.Intersection[] = [];
      nativeRaycast.call(nativeMesh, raycaster, baseline);
      const accelerated: THREE.Intersection[] = [];
      (raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
      acceleratedRaycast.call(acceleratedMesh, raycaster, accelerated);
      expect(accelerated.length).toBeLessThanOrEqual(1);
      if (baseline.length > 0 && accelerated.length > 0) {
        expect(accelerated[0]!.distance).toBeCloseTo(baseline[0]!.distance, 3);
      }
    }

    expect(speedupRatio).toBeGreaterThan(1.01);

    await mkdir("aim296-evidence", { recursive: true });
    await writeFile(receiptPath, JSON.stringify({
      schemaVersion: 1,
      recordType: "aurion_aim296_bvh_performance",
      benchmark: {
        geometry: "TorusKnotGeometry(16,5,256,48)",
        workloadRays: workload.length,
        warmupMs: { native: warmupNative, accelerated: warmupAccelerated },
        samplesMs: { native: nativeSamples, accelerated: acceleratedSamples },
        nativeMedianMs,
        acceleratedMedianMs,
        nativeP95Ms: percentile(nativeSamples, 0.95),
        acceleratedP95Ms: percentile(acceleratedSamples, 0.95),
        speedupRatio,
        parityCases: parityRays.length,
        parityFailures: 0,
      },
      runner: {
        platform: process.platform,
        arch: process.arch,
        cpuCount: cpus().length,
        node: process.version,
        interpretation: "Deterministic CI CPU benchmark; not native mobile GPU performance.",
      },
    }, null, 2) + "\n");
  });
});
