import * as THREE from "three";
import type { GlbRuntimeCatalog } from "@shared/glbImportContract";
import { splitWorldChunkPositionMm, type WorldChunkCoordinate } from "@shared/worldChunkProtocol";
import type { MMOEngine } from "../core/MMOEngine";
import { glbManager } from "../core/GLBModelManager";
import { uploadedWorldVisualsForChunk, type UploadedWorldVisualPlacement } from "../core/UploadedAssetRuntime";

type Rendered = Readonly<{ sha256: string; root: THREE.Group }>;
const MAX_RENDERED = 18;

function targetSizeMeters(subcategory: string | null): number {
  if (subcategory === "building") return 9;
  if (subcategory === "structure") return 5;
  if (subcategory === "teleporter") return 3.2;
  if (subcategory === "fountain") return 2.4;
  if (subcategory === "street-prop") return 1.8;
  if (subcategory === "tree") return 7;
  if (subcategory === "plant") return 1.2;
  if (subcategory === "rock") return 2.6;
  return 2.5;
}

function staticRenderable(scene: THREE.Group): boolean {
  let valid = true;
  scene.traverse(node => {
    if ((node as THREE.SkinnedMesh).isSkinnedMesh || (node as THREE.Bone).isBone) valid = false;
  });
  return valid;
}

/**
 * Presentation-only overlay for admin-approved uploaded environment/nature GLBs.
 * Placement is deterministic from the confirmed catalog + chunk identity. This
 * class never registers colliders, teleports, interactions or gameplay objects.
 */
export class UploadedWorldCatalogProjection {
  readonly root = new THREE.Group();
  private catalog: GlbRuntimeCatalog | null = null;
  private readonly rendered = new Map<string, Rendered>();
  private readonly pending = new Set<string>();
  private signature = "";
  private disposed = false;

  constructor(private readonly engine: MMOEngine) {
    this.root.name = "aurion-uploaded-world-catalog-visuals";
    engine.scene.add(this.root);
  }

  setCatalog(catalog: GlbRuntimeCatalog | null): void {
    if (this.disposed) return;
    if (this.catalog?.revision === catalog?.revision) return;
    this.catalog = catalog;
    this.signature = "";
  }

  private desired(position: { x: number; z: number }): { center: WorldChunkCoordinate; placements: UploadedWorldVisualPlacement[] } {
    if (!this.catalog) return { center: { x: 0, z: 0 }, placements: [] };
    const center = splitWorldChunkPositionMm({ x: Math.round(position.x * 1000), z: Math.round(position.z * 1000) }).coordinate;
    const placements: UploadedWorldVisualPlacement[] = [];
    for (let z = center.z - 1; z <= center.z + 1; z += 1) for (let x = center.x - 1; x <= center.x + 1; x += 1) {
      placements.push(...uploadedWorldVisualsForChunk(this.catalog, { x, z }));
    }
    placements.sort((left, right) => {
      const ld = Math.hypot(left.xMm / 1000 - position.x, left.zMm / 1000 - position.z);
      const rd = Math.hypot(right.xMm / 1000 - position.x, right.zMm / 1000 - position.z);
      return ld - rd || left.id.localeCompare(right.id);
    });
    return { center, placements: placements.slice(0, MAX_RENDERED) };
  }

  private remove(id: string): void {
    const current = this.rendered.get(id);
    if (!current) return;
    current.root.removeFromParent();
    this.rendered.delete(id);
  }

  private async project(placement: UploadedWorldVisualPlacement, originX: number, originZ: number): Promise<void> {
    if (this.disposed || this.pending.has(placement.id)) return;
    const current = this.rendered.get(placement.id);
    if (current?.sha256 === placement.asset.sha256) return;
    this.pending.add(placement.id);
    try {
      const loaded = await glbManager.loadModel(placement.asset.storageUrl);
      if (this.disposed || !staticRenderable(loaded.scene)) return;
      const stillAllowed = this.catalog?.entries.some(entry => entry.assetId === placement.asset.assetId && entry.sha256 === placement.asset.sha256 && entry.purpose === placement.asset.purpose);
      if (!stillAllowed) return;

      loaded.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(loaded.scene, true);
      if (bounds.isEmpty()) return;
      const size = bounds.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(maxDimension) || maxDimension <= 0.0001) return;
      const scale = THREE.MathUtils.clamp(targetSizeMeters(placement.asset.subcategory) / maxDimension, 0.05, 12);
      const center = bounds.getCenter(new THREE.Vector3());
      const worldX = placement.xMm / 1000;
      const worldZ = placement.zMm / 1000;
      const terrainY = this.engine.landscape.chunkManager.getElevationAt(worldX, worldZ);
      if (!Number.isFinite(terrainY)) return;

      const holder = new THREE.Group();
      holder.name = `uploaded-world:${placement.id}`;
      holder.userData.uploadedWorldCatalog = Object.freeze({ assetId: placement.asset.assetId, sha256: placement.asset.sha256, purpose: placement.asset.purpose });
      holder.position.set(worldX - originX, terrainY, worldZ - originZ);
      holder.rotation.y = placement.rotationQuarterTurns * Math.PI / 2;
      loaded.scene.scale.setScalar(scale);
      loaded.scene.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      loaded.scene.traverse(node => {
        if (!(node as THREE.Mesh).isMesh) return;
        const mesh = node as THREE.Mesh;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
      });
      holder.add(loaded.scene);
      this.remove(placement.id);
      this.root.add(holder);
      this.rendered.set(placement.id, Object.freeze({ sha256: placement.asset.sha256, root: holder }));
    } catch {
      // Existing world visuals remain authoritative when an uploaded render fails.
    } finally {
      this.pending.delete(placement.id);
    }
  }

  update(position = { x: this.engine.player.position.x, z: this.engine.player.position.z }): void {
    if (this.disposed) return;
    const { center, placements } = this.desired(position);
    const originX = center.x * 64;
    const originZ = center.z * 64;
    const nextSignature = `${this.catalog?.revision ?? "none"}:${center.x}:${center.z}:${placements.map(value => `${value.id}:${value.asset.sha256}`).join("|")}`;
    if (nextSignature === this.signature) return;
    this.signature = nextSignature;
    this.root.position.set(originX, 0, originZ);
    const ids = new Set(placements.map(placement => placement.id));
    for (const id of [...this.rendered.keys()]) if (!ids.has(id)) this.remove(id);
    for (const placement of placements) void this.project(placement, originX, originZ);
  }

  evidence() {
    return Object.freeze({ catalogRevision: this.catalog?.revision ?? null, rendered: this.rendered.size, pending: this.pending.size, maxRendered: MAX_RENDERED,
      assets: Object.freeze([...this.rendered.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, value]) => Object.freeze({ id, sha256: value.sha256 }))) });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending.clear();
    for (const id of [...this.rendered.keys()]) this.remove(id);
    this.root.removeFromParent();
  }
}
