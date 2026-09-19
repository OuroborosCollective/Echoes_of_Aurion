import * as THREE from "three";
import type { GlbRuntimeCatalog, GlbRuntimeEntry } from "@shared/glbImportContract";
import type { MMOEngine } from "../core/MMOEngine";
import { glbManager } from "../core/GLBModelManager";

const INSTANCED_MESH_NAME = "aurion-catalog-tree-replacements";
const MAX_TRIANGLES = 1200;
const NEAR_RANGE = 150;

export class TreeCatalogReplacement {
  private catalog: GlbRuntimeCatalog | null = null;
  private currentEntry: GlbRuntimeEntry | null = null;
  private model: THREE.Group | null = null;
  private mesh: THREE.Mesh | null = null;
  private instancedMesh: THREE.InstancedMesh | null = null;
  private loading = false;
  private loadRetries = 0;
  private failures = 0;
  private disposed = false;
  private replacedCount = 0;
  private trianglesPerModel = 0;
  private hiddenOriginals = new Set<THREE.Object3D>();

  constructor(
    private readonly engine: MMOEngine,
    private readonly loadModel?: (url: string) => Promise<{ scene: THREE.Group; animations: any[] }>
  ) {}

  public setCatalog(catalog: GlbRuntimeCatalog | null): void {
    if (this.disposed) return;
    this.catalog = catalog;

    const entry = catalog?.entries.find(
      e => e.purpose === "world-nature" && (e.subcategory === "tree" || e.assetType === "arena")
    ) ?? null;

    if (entry?.sha256 !== this.currentEntry?.sha256) {
      this.restoreOriginals();
      this.currentEntry = entry;
      this.model = null;
      this.mesh = null;
      this.loadRetries = 0;
    }
  }

  public update(_delta: number): void {
    if (this.disposed) return;

    if (!this.currentEntry) {
      this.restoreOriginals();
      return;
    }

    if (!this.model && !this.loading && this.loadRetries < 3) {
      this.loadTreeModel();
      return;
    }

    if (!this.model || !this.mesh) return;

    this.updateInstances();
  }

  private loadTreeModel(): void {
    if (!this.currentEntry || this.loading) return;
    this.loading = true;
    const url = this.currentEntry.storageUrl;

    const loader = this.loadModel
      ? this.loadModel(url)
      : glbManager.loadModelLease(url).then(lease => ({ scene: lease.model, animations: lease.animations }));

    loader
      .then(res => {
        this.loading = false;
        if (this.disposed || !this.currentEntry) return;

        let foundMesh: THREE.Mesh | null = null;
        res.scene.traverse(child => {
          if (!foundMesh && (child as THREE.Mesh).isMesh) {
            foundMesh = child as THREE.Mesh;
          }
        });

        if (!foundMesh) {
          this.failures++;
          this.loadRetries = 3;
          return;
        }

        const geometry = (foundMesh as THREE.Mesh).geometry;
        const tris = geometry.index
          ? geometry.index.count / 3
          : geometry.attributes.position
          ? geometry.attributes.position.count / 3
          : 0;

        if (tris > MAX_TRIANGLES) {
          this.failures++;
          this.loadRetries = 3;
          return;
        }

        this.trianglesPerModel = tris;
        this.mesh = foundMesh;
        this.model = res.scene;
        this.updateInstances();
      })
      .catch(() => {
        this.loading = false;
        this.loadRetries++;
        if (this.loadRetries >= 3) {
          this.failures++;
        }
      });
  }

  private updateInstances(): void {
    if (!this.mesh || !this.engine.scene) return;

    const originalTrees: THREE.Object3D[] = [];
    this.engine.scene.traverse(child => {
      if (child.userData?.aurionVisualKind === "tree") {
        originalTrees.push(child);
      }
    });

    const isPhone = typeof window !== "undefined" && window.innerWidth <= 600;
    const maxCapacity = isPhone ? 16 : 64;

    const playerPos = (this.engine.player as any)?.position ?? new THREE.Vector3();
    const nearTrees = originalTrees
      .filter(t => t.position.distanceTo(playerPos) <= NEAR_RANGE)
      .slice(0, maxCapacity);

    // Restore any previously hidden trees that are no longer in near range
    for (const tree of this.hiddenOriginals) {
      if (!nearTrees.includes(tree)) {
        tree.visible = true;
        this.hiddenOriginals.delete(tree);
      }
    }

    if (nearTrees.length === 0) {
      this.restoreOriginals();
      if (this.instancedMesh) {
        this.instancedMesh.count = 0;
      }
      this.replacedCount = 0;
      return;
    }

    if (!this.instancedMesh || this.instancedMesh.geometry !== this.mesh.geometry) {
      if (this.instancedMesh) {
        this.engine.scene.remove(this.instancedMesh);
        this.instancedMesh.dispose();
      }
      this.instancedMesh = new THREE.InstancedMesh(
        this.mesh.geometry,
        this.mesh.material,
        Math.max(nearTrees.length, 64)
      );
      this.instancedMesh.name = INSTANCED_MESH_NAME;
      this.engine.scene.add(this.instancedMesh);
    }

    this.mesh.geometry.computeBoundingBox();
    const box = this.mesh.geometry.boundingBox ?? new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 1, 1));
    const rawHeight = Math.max(box.max.y - box.min.y, 0.001);

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (let i = 0; i < nearTrees.length; i++) {
      const tree = nearTrees[i];
      tree.visible = false;
      this.hiddenOriginals.add(tree);

      const targetHeight = tree.userData.aurionTreeHeightMeters ?? 7;
      const s = targetHeight / rawHeight;
      scale.set(s, s, s);

      const elevation = (this.engine.landscape as any)?.chunkManager?.getElevationAt?.(tree.position.x, tree.position.z) ?? tree.position.y;
      position.set(tree.position.x, elevation - box.min.y * s, tree.position.z);
      quaternion.copy(tree.quaternion);

      matrix.compose(position, quaternion, scale);
      this.instancedMesh.setMatrixAt(i, matrix);
    }

    this.instancedMesh.count = nearTrees.length;
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    this.replacedCount = nearTrees.length;
  }

  private restoreOriginals(): void {
    for (const tree of this.hiddenOriginals) {
      tree.visible = true;
    }
    this.hiddenOriginals.clear();
    if (this.instancedMesh) {
      this.instancedMesh.count = 0;
      this.instancedMesh.instanceMatrix.needsUpdate = true;
    }
    this.replacedCount = 0;
  }

  public evidence(): {
    replaced: number;
    drawCalls: number;
    trianglesPerModel: number;
    sha256: string | null;
    failures: number;
  } {
    return {
      replaced: this.replacedCount,
      drawCalls: this.replacedCount > 0 ? 1 : 0,
      trianglesPerModel: this.trianglesPerModel,
      sha256: this.currentEntry?.sha256 ?? null,
      failures: this.failures,
    };
  }

  public dispose(): void {
    this.disposed = true;
    this.restoreOriginals();
    if (this.instancedMesh && this.engine.scene) {
      this.engine.scene.remove(this.instancedMesh);
      this.instancedMesh.dispose();
      this.instancedMesh = null;
    }
  }
}
