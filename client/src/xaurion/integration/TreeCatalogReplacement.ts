import * as THREE from "three";
import { glbCatalogLods, type GlbLodLevel, type GlbRuntimeCatalog } from "@shared/glbImportContract";
import type { MMOEngine } from "../core/MMOEngine";
import { glbManager } from "../core/GLBModelManager";
import { releaseGlbTree } from "../core/GlbModelLease";
import { ACTOR_LOD_FAR_MAX_METERS, ACTOR_LOD_MID_MAX_METERS, ACTOR_LOD_NEAR_MAX_METERS } from "../core/actorLod";

type LoadedTree = Awaited<ReturnType<typeof glbManager.loadModel>>;
type Target = { group: THREE.Object3D; position: THREE.Vector3; height: number; distance: number };
type LodSource = {
  level: GlbLodLevel;
  loaded: LoadedTree;
  instances: THREE.InstancedMesh;
  anchor: THREE.Matrix4;
  sourceHeight: number;
  triangles: number;
};
const CAPACITY = 32;
const MAX_DISTANCE_METERS = 160;

function preferredLevel(distance: number): GlbLodLevel {
  if (distance < ACTOR_LOD_NEAR_MAX_METERS) return 0;
  if (distance < ACTOR_LOD_MID_MAX_METERS) return 1;
  if (distance < ACTOR_LOD_FAR_MAX_METERS) return 2;
  return 3;
}
function nearestAvailable(preferred: GlbLodLevel, levels: readonly GlbLodLevel[]): GlbLodLevel {
  return levels.slice().sort((left, right) => Math.abs(left - preferred) - Math.abs(right - preferred) || right - left)[0]!;
}

/** Replaces explicitly tagged AX1 tree visuals; never registers or edits colliders.
 * Each approved physical LOD is instanced independently, so a logical four-LOD
 * tree family costs at most four draw calls while retaining the existing cap.
 */
export class TreeCatalogReplacement {
  private catalog: GlbRuntimeCatalog | null = null;
  private readonly sources = new Map<GlbLodLevel, LodSource>();
  private hidden = new Map<THREE.Object3D, boolean>();
  private sha: string | null = null;
  private selectedSignature: string | null = null;
  private generation = 0;
  private pending = false;
  private failures = 0;
  private elapsed = 1;
  private retryElapsed = 5;
  private disposed = false;

  constructor(
    private readonly engine: Pick<MMOEngine, "scene" | "player" | "landscape">,
    private readonly load: (url: string) => Promise<LoadedTree> = url => glbManager.loadModel(url),
  ) {}

  private select() {
    return this.catalog?.entries.filter(e => e.purpose === "world-nature" && e.assetType === "arena" && e.subcategory === "tree" && e.targetKey === null)
      .sort((a, b) => a.assetId.localeCompare(b.assetId))[0];
  }

  private signature() {
    const selected = this.select();
    if (!selected) return null;
    return `${selected.assetId}:${glbCatalogLods(selected).map(lod => `${lod.level}:${lod.sha256}`).join("|")}`;
  }

  setCatalog(catalog: GlbRuntimeCatalog): void {
    if (this.disposed) return;
    this.catalog = catalog;
    const signature = this.signature();
    if (signature === this.selectedSignature) return;
    this.generation++;
    this.pending = false;
    this.failures = 0;
    this.selectedSignature = signature;
    this.retryElapsed = 5;
    this.clear();
  }

  private async acquire(): Promise<void> {
    const selected = this.select();
    if (!selected || this.pending || this.sources.size || this.failures >= 3) return;
    const generation = this.generation;
    this.pending = true;
    const provisional: LodSource[] = [];
    try {
      const variants = glbCatalogLods(selected).slice().sort((left, right) => left.level - right.level || left.sha256.localeCompare(right.sha256));
      let previousTriangles = Number.POSITIVE_INFINITY;
      for (const variant of variants) {
        const loaded = await this.load(variant.storageUrl);
        loaded.scene.updateMatrixWorld(true);
        const meshes: THREE.Mesh[] = [];
        let rigged = false;
        loaded.scene.traverse(node => {
          if ((node as THREE.SkinnedMesh).isSkinnedMesh || (node as THREE.Bone).isBone) rigged = true;
          if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
        });
        if (rigged || meshes.length !== 1 || loaded.animations.length || Array.isArray(meshes[0]!.material)) throw Error("TREE_STATIC_SINGLE_MESH_REQUIRED");
        const mesh = meshes[0]!;
        const triangles = (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position")?.count ?? 0) / 3;
        const bounds = new THREE.Box3().setFromObject(loaded.scene, true);
        const height = bounds.max.y - bounds.min.y;
        if (!Number.isInteger(triangles) || triangles < 1 || triangles > 1600 || triangles > previousTriangles || bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite) || height < .1) throw Error("TREE_GEOMETRY_BUDGET");
        previousTriangles = triangles;
        const center = bounds.getCenter(new THREE.Vector3());
        const anchor = new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z).multiply(mesh.matrixWorld);
        const instances = new THREE.InstancedMesh(mesh.geometry, mesh.material, CAPACITY);
        instances.name = variant.level === 0 ? "aurion-catalog-tree-replacements" : `aurion-catalog-tree-replacements-lod${variant.level}`;
        instances.castShadow = false;
        instances.receiveShadow = true;
        instances.count = 0;
        provisional.push({ level: variant.level, loaded, instances, anchor, sourceHeight: height, triangles });
      }
      if (this.disposed || generation !== this.generation) return;
      this.clear();
      for (const source of provisional) {
        this.sources.set(source.level, source);
        this.engine.scene.add(source.instances);
      }
      this.sha = selected.sha256;
      provisional.length = 0;
      this.elapsed = 1;
    } catch {
      if (generation === this.generation) this.failures++;
    } finally {
      for (const source of provisional) { source.instances.dispose(); releaseGlbTree(source.loaded.scene); }
      if (generation === this.generation) this.pending = false;
    }
  }

  update(delta: number): void {
    if (this.disposed || !Number.isFinite(delta) || delta < 0) return;
    this.elapsed += delta;
    this.retryElapsed += delta;
    if (this.retryElapsed >= 5) { this.retryElapsed = 0; void this.acquire(); }
    if (!this.sources.size || this.elapsed < .5) return;
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
      if (distance <= MAX_DISTANCE_METERS) targets.push({ group, position, height, distance });
    });
    targets.sort((a, b) => a.distance - b.distance || a.group.name.localeCompare(b.group.name));
    const limit = typeof window !== "undefined" && window.innerWidth < 768 ? 16 : CAPACITY;
    const desired = targets.slice(0, limit);
    const kept = new Set(desired.map(t => t.group));
    for (const [group, visible] of this.hidden) if (!kept.has(group)) { group.visible = visible; this.hidden.delete(group); }

    const counts = new Map<GlbLodLevel, number>();
    const levels = [...this.sources.keys()].sort((a, b) => a - b);
    for (const source of this.sources.values()) source.instances.count = 0;
    const matrix = new THREE.Matrix4();
    const rotation = new THREE.Quaternion();
    for (const target of desired) {
      const y = this.engine.landscape.chunkManager.getElevationAt(target.position.x, target.position.z);
      if (!Number.isFinite(y)) {
        if (this.hidden.has(target.group)) { target.group.visible = this.hidden.get(target.group)!; this.hidden.delete(target.group); }
        continue;
      }
      const level = nearestAvailable(preferredLevel(target.distance), levels);
      const source = this.sources.get(level)!;
      const index = counts.get(level) ?? 0;
      target.position.y = y;
      target.group.getWorldQuaternion(rotation);
      const scale = target.height / source.sourceHeight;
      matrix.compose(target.position, rotation, new THREE.Vector3(scale, scale, scale)).multiply(source.anchor);
      source.instances.setMatrixAt(index, matrix);
      counts.set(level, index + 1);
      if (!this.hidden.has(target.group)) this.hidden.set(target.group, target.group.visible);
      target.group.visible = false;
    }
    for (const source of this.sources.values()) {
      source.instances.count = counts.get(source.level) ?? 0;
      source.instances.instanceMatrix.needsUpdate = true;
      if (source.instances.count) source.instances.computeBoundingSphere();
    }
  }

  evidence() {
    const lods = [...this.sources.values()].sort((a, b) => a.level - b.level).map(source => Object.freeze({ level: source.level, trianglesPerModel: source.triangles, replaced: source.instances.count }));
    const primary = this.sources.get(0) ?? [...this.sources.values()].sort((a, b) => a.level - b.level)[0];
    return { sha256: this.sha, replaced: lods.reduce((sum, lod) => sum + lod.replaced, 0), trianglesPerModel: primary?.triangles ?? 0, drawCalls: lods.filter(lod => lod.replaced > 0).length, capacity: CAPACITY, pending: this.pending, failures: this.failures, lods: Object.freeze(lods) };
  }

  private clear(): void {
    for (const [group, visible] of this.hidden) group.visible = visible;
    this.hidden.clear();
    for (const source of this.sources.values()) {
      source.instances.removeFromParent();
      source.instances.dispose();
      releaseGlbTree(source.loaded.scene);
    }
    this.sources.clear();
    this.sha = null;
  }

  dispose(): void { this.disposed = true; this.generation++; this.clear(); }
}
