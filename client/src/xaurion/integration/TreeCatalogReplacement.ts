import * as THREE from "three";
import type { GlbRuntimeCatalog } from "@shared/glbImportContract";
import type { MMOEngine } from "../core/MMOEngine";
import { glbManager } from "../core/GLBModelManager";
import { releaseGlbTree } from "../core/GlbModelLease";

type LoadedTree = Awaited<ReturnType<typeof glbManager.loadModel>>;
type Target = { group: THREE.Object3D; position: THREE.Vector3; height: number; distance: number };
const CAPACITY = 32;

/** Replaces explicitly tagged AX1 tree visuals; never registers or edits colliders.
 * One leased mesh/material is instanced for nearby trees. The procedural tree
 * remains visible until the approved replacement has loaded successfully.
 */
export class TreeCatalogReplacement {
  private catalog: GlbRuntimeCatalog | null = null;
  private source: LoadedTree | null = null;
  private instances: THREE.InstancedMesh | null = null;
  private hidden = new Map<THREE.Object3D, boolean>();
  private sha: string | null = null;
  private selectedSha: string | null = null;
  private generation = 0;
  private pending = false;
  private failures = 0;
  private elapsed = 1;
  private retryElapsed = 5;
  private disposed = false;
  private readonly anchor = new THREE.Matrix4();
  private sourceHeight = 1;
  private triangles = 0;

  constructor(
    private readonly engine: Pick<MMOEngine, "scene" | "player" | "landscape">,
    private readonly load: (url: string) => Promise<LoadedTree> = url => glbManager.loadModel(url),
  ) {}

  setCatalog(catalog: GlbRuntimeCatalog): void {
    if (this.disposed) return;
    this.catalog = catalog;
    const selected = this.select();
    if (selected?.sha256 === this.selectedSha) return;
    this.generation++;
    this.pending = false;
    this.failures = 0;
    this.selectedSha = selected?.sha256 ?? null;
    this.retryElapsed = 5;
    if (this.sha && !catalog.entries.some(e => e.sha256 === this.sha && e.purpose === "world-nature" && e.subcategory === "tree")) this.clear();
    if (!selected) this.clear();
  }

  private select() {
    return this.catalog?.entries.filter(e => e.purpose === "world-nature" && e.assetType === "arena" && e.subcategory === "tree" && e.targetKey === null)
      .sort((a, b) => a.assetId.localeCompare(b.assetId))[0];
  }

  private async acquire(): Promise<void> {
    const selected = this.select();
    if (!selected || this.pending || this.sha === selected.sha256 || this.failures >= 3) return;
    const generation = this.generation;
    this.pending = true;
    let loaded: LoadedTree | null = null;
    try {
      loaded = await this.load(selected.storageUrl);
      if (this.disposed || generation !== this.generation) return;
      loaded.scene.updateMatrixWorld(true);
      const meshes: THREE.Mesh[] = [];
      let rigged = false;
      loaded.scene.traverse(node => {
        if ((node as THREE.SkinnedMesh).isSkinnedMesh || (node as THREE.Bone).isBone) rigged = true;
        if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
      });
      // A predictable single draw call, no hidden animated/compound payload.
      if (rigged || meshes.length !== 1 || loaded.animations.length || Array.isArray(meshes[0]!.material)) throw Error("TREE_STATIC_SINGLE_MESH_REQUIRED");
      const mesh = meshes[0]!;
      const triangles = (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position")?.count ?? 0) / 3;
      const bounds = new THREE.Box3().setFromObject(loaded.scene, true);
      const height = bounds.max.y - bounds.min.y;
      if (!Number.isInteger(triangles) || triangles < 1 || triangles > 1600 || bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite) || height < .1) throw Error("TREE_GEOMETRY_BUDGET");
      const center = bounds.getCenter(new THREE.Vector3());
      this.clear();
      this.source = loaded;
      loaded = null;
      this.sha = selected.sha256;
      this.sourceHeight = height;
      this.triangles = triangles;
      this.anchor.makeTranslation(-center.x, -bounds.min.y, -center.z).multiply(mesh.matrixWorld);
      this.instances = new THREE.InstancedMesh(mesh.geometry, mesh.material, CAPACITY);
      this.instances.name = "aurion-catalog-tree-replacements";
      this.instances.castShadow = false;
      this.instances.receiveShadow = true;
      this.instances.count = 0;
      this.engine.scene.add(this.instances);
      this.elapsed = 1;
    } catch {
      if (generation === this.generation) this.failures++;
    } finally {
      if (loaded) releaseGlbTree(loaded.scene);
      if (generation === this.generation) this.pending = false;
    }
  }

  update(delta: number): void {
    if (this.disposed || !Number.isFinite(delta) || delta < 0) return;
    this.elapsed += delta;
    this.retryElapsed += delta;
    if (this.retryElapsed >= 5) { this.retryElapsed = 0; void this.acquire(); }
    if (!this.instances || this.elapsed < .5) return;
    this.elapsed = 0;
    const targets: Target[] = [];
    this.engine.scene.updateMatrixWorld(true);
    const player = this.engine.player.position;
    this.engine.scene.traverse(group => {
      const height = group.userData.aurionTreeHeightMeters;
      if (group.userData.aurionVisualKind !== "tree" || !Number.isFinite(height) || height <= 0) return;
      if (!group.visible && !this.hidden.has(group)) return;
      for (let parent = group.parent; parent; parent = parent.parent) if (!parent.visible) return;
      const position = group.getWorldPosition(new THREE.Vector3());
      const distance = Math.hypot(position.x - player.x, position.z - player.z);
      if (distance <= 85) targets.push({ group, position, height, distance });
    });
    targets.sort((a, b) => a.distance - b.distance || a.group.name.localeCompare(b.group.name));
    const limit = typeof window !== "undefined" && window.innerWidth < 768 ? 16 : CAPACITY;
    const desired = targets.slice(0, limit);
    const kept = new Set(desired.map(t => t.group));
    for (const [group, visible] of this.hidden) if (!kept.has(group)) { group.visible = visible; this.hidden.delete(group); }
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    let count = 0;
    for (const target of desired) {
      const y = this.engine.landscape.chunkManager.getElevationAt(target.position.x, target.position.z);
      if (!Number.isFinite(y)) {
        if (this.hidden.has(target.group)) { target.group.visible = this.hidden.get(target.group)!; this.hidden.delete(target.group); }
        continue;
      }
      target.position.y = y;
      target.group.getWorldQuaternion(rotation);
      const scale = target.height / this.sourceHeight;
      matrix.compose(target.position, rotation, new THREE.Vector3(scale, scale, scale)).multiply(this.anchor);
      this.instances.setMatrixAt(count++, matrix);
      if (!this.hidden.has(target.group)) this.hidden.set(target.group, target.group.visible);
      target.group.visible = false;
    }
    this.instances.count = count;
    this.instances.instanceMatrix.needsUpdate = true;
    this.instances.computeBoundingSphere();
  }

  evidence() { return { sha256: this.sha, replaced: this.instances?.count ?? 0, trianglesPerModel: this.triangles, drawCalls: this.instances?.count ? 1 : 0, capacity: CAPACITY, pending: this.pending, failures: this.failures }; }

  private clear(): void {
    for (const [group, visible] of this.hidden) group.visible = visible;
    this.hidden.clear();
    this.instances?.removeFromParent();
    this.instances?.dispose();
    this.instances = null;
    if (this.source) releaseGlbTree(this.source.scene);
    this.source = null;
    this.sha = null;
    this.triangles = 0;
  }

  dispose(): void { this.disposed = true; this.generation++; this.clear(); }
}
