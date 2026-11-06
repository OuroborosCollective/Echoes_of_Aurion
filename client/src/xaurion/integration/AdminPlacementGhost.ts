import * as THREE from "three";
import type { GlbCatalogEntry } from "@shared/glbImportContract";
import { snapToPlacementGrid, type AdminPlacementInput } from "@shared/adminPlacementPlan";
import { glbManager } from "../core/GLBModelManager";
import { releaseGlbTree } from "../core/GlbModelLease";
import { fitWorldVisual } from "./UploadedWorldCatalogProjection";

/** Farthest placement from the player (the authored projection renders around the player). */
export const ADMIN_PLACEMENT_MAX_DISTANCE_M = 40;
/** Fallback distance in front of the player when the view does not meet the ground. */
export const ADMIN_PLACEMENT_FALLBACK_DISTANCE_M = 5;

type EngineLike = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  player: { position: THREE.Vector3 };
  landscape: { chunkManager: { getElevationAt(x: number, z: number): number } };
  /** Ground point under a screen position (mouse placement). */
  projectTouchDestination?(screenX: number, screenY: number): { x: number; y: number; z: number } | null;
};

/**
 * Block-game style placement preview for administrators: the selected catalog model
 * floats translucently under the mouse pointer, or (touch, no pointer) where the view
 * meets the ground in front of the player, snapped to the placement grid.
 * Presentation only — it never registers colliders or writes world state.
 */
export class AdminPlacementGhost {
  readonly root = new THREE.Group();
  private asset: GlbCatalogEntry | null = null;
  private model: THREE.Object3D | null = null;
  private readonly ghostMaterials: THREE.Material[] = [];
  private rotationQuarterTurns: 0 | 1 | 2 | 3 = 0;
  private scalePermille = 1_000;
  private target: { x: number; z: number } | null = null;
  private pointer: { x: number; y: number } | null = null;
  private generation = 0;
  private disposed = false;

  constructor(private readonly engine: EngineLike) {
    this.root.name = "aurion-admin-placement-ghost";
    this.root.visible = false;
    engine.scene.add(this.root);
  }

  get rotation(): 0 | 1 | 2 | 3 { return this.rotationQuarterTurns; }
  get scale(): number { return this.scalePermille; }
  get ready(): boolean { return this.model !== null; }

  async setAsset(asset: GlbCatalogEntry | null): Promise<void> {
    const generation = ++this.generation;
    this.clearModel();
    this.asset = asset;
    if (!asset || this.disposed) return;
    const loaded = await glbManager.loadStaticLodFamily(asset);
    if (this.disposed || generation !== this.generation) { releaseGlbTree(loaded.scene); return; }
    loaded.scene.traverse(node => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const ghostify = (material: THREE.Material) => {
        const ghost = material.clone();
        ghost.transparent = true;
        ghost.opacity = 0.55;
        ghost.depthWrite = false;
        this.ghostMaterials.push(ghost);
        return ghost;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(ghostify) : ghostify(mesh.material);
      mesh.castShadow = false;
      mesh.raycast = () => undefined; // never a raycast target, including for the admin cursor
    });
    this.model = loaded.scene;
    this.root.add(loaded.scene);
    this.layout();
    this.update();
  }

  rotate(): void { this.rotationQuarterTurns = ((this.rotationQuarterTurns + 1) % 4) as 0 | 1 | 2 | 3; this.update(); }

  setScalePermille(scalePermille: number): void {
    this.scalePermille = Math.min(4_000, Math.max(250, Math.round(scalePermille)));
    this.layout();
    this.update();
  }

  /** Same scale and anchor as the persisted projection, so the placement looks as previewed. */
  private layout(): void {
    if (!this.model || !this.asset) return;
    this.model.scale.setScalar(1);
    this.model.position.set(0, 0, 0);
    const fit = fitWorldVisual(this.model, this.asset, this.scalePermille);
    if (!fit) return;
    this.model.scale.setScalar(fit.scale);
    this.model.position.set(-fit.center.x * fit.scale, -fit.bounds.min.y * fit.scale, -fit.center.z * fit.scale);
  }

  /** Mouse position over the viewport (client pixels), or null for view-direction aiming. */
  setPointer(pointer: { x: number; y: number } | null): void { this.pointer = pointer; }

  private withinReach(point: { x: number; z: number }): boolean {
    const player = this.engine.player.position;
    return Math.hypot(point.x - player.x, point.z - player.z) <= ADMIN_PLACEMENT_MAX_DISTANCE_M;
  }

  /**
   * Ground point under the mouse pointer; otherwise where the camera view meets the
   * ground beyond the player (third-person camera: tilt the view to aim farther);
   * otherwise a point in front of the player.
   */
  aimPoint(): { x: number; z: number } | null {
    if (this.pointer && this.engine.projectTouchDestination) {
      const hit = this.engine.projectTouchDestination(this.pointer.x, this.pointer.y);
      // An active mouse cursor must never silently select a different location
      // through camera aiming. Touch has no pointer and uses the camera below.
      if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.z)) return null;
      return this.withinReach(hit) ? { x: hit.x, z: hit.z } : null;
    }
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3();
    this.engine.camera.getWorldPosition(origin);
    this.engine.camera.getWorldDirection(direction);
    const ground = this.engine.landscape.chunkManager;
    // Start past the player so a camera behind the character never aims at its feet.
    const start = origin.distanceTo(this.engine.player.position) + 1.5;
    const below = (distance: number) => {
      const height = ground.getElevationAt(origin.x + direction.x * distance, origin.z + direction.z * distance);
      return Number.isFinite(height) && origin.y + direction.y * distance <= height;
    };
    // Coarse 1 m march, then bisection: ~45 terrain samples per frame instead of ~160.
    for (let distance = start, previous = start; distance <= start + ADMIN_PLACEMENT_MAX_DISTANCE_M; previous = distance, distance += 1) {
      if (!below(distance)) continue;
      let low = Math.min(previous, distance), high = distance;
      for (let step = 0; step < 6 && distance !== start; step += 1) {
        const middle = (low + high) / 2;
        if (below(middle)) high = middle; else low = middle;
      }
      const point = { x: origin.x + direction.x * high, z: origin.z + direction.z * high };
      return this.withinReach(point) ? point : null;
    }
    const flat = new THREE.Vector3(direction.x, 0, direction.z);
    if (flat.lengthSq() < 1e-6) flat.set(0, 0, -1);
    flat.normalize().multiplyScalar(ADMIN_PLACEMENT_FALLBACK_DISTANCE_M);
    return { x: this.engine.player.position.x + flat.x, z: this.engine.player.position.z + flat.z };
  }

  update(): void {
    if (this.disposed || !this.model) { this.root.visible = false; return; }
    const aim = this.aimPoint();
    if (!aim) { this.root.visible = false; this.target = null; return; }
    const x = snapToPlacementGrid(Math.round(aim.x * 1000)) / 1000;
    const z = snapToPlacementGrid(Math.round(aim.z * 1000)) / 1000;
    // Enforce the reach bound on the persisted snapped location, not only the raw hit.
    if (!this.withinReach({ x, z })) { this.root.visible = false; this.target = null; return; }
    const y = this.engine.landscape.chunkManager.getElevationAt(x, z);
    if (!Number.isFinite(y)) { this.root.visible = false; this.target = null; return; }
    this.target = { x, z };
    this.root.position.set(x, y, z);
    this.root.rotation.y = this.rotationQuarterTurns * Math.PI / 2;
    this.root.visible = true;
  }

  /** The exact persisted placement of the current preview, or null while nothing is aimed. */
  placementInput(): AdminPlacementInput | null {
    if (!this.asset || !this.model || !this.target) return null;
    return {
      assetId: this.asset.assetId,
      worldXMm: snapToPlacementGrid(Math.round(this.target.x * 1000)),
      worldZMm: snapToPlacementGrid(Math.round(this.target.z * 1000)),
      rotationQuarterTurns: this.rotationQuarterTurns,
      scalePermille: this.scalePermille,
    };
  }

  private clearModel(): void {
    if (this.model) {
      this.model.removeFromParent();
      releaseGlbTree(this.model);
      this.model = null;
    }
    for (const material of this.ghostMaterials.splice(0)) material.dispose();
    this.target = null;
    this.root.visible = false;
  }

  dispose(): void {
    this.disposed = true;
    this.generation += 1;
    this.clearModel();
    this.root.removeFromParent();
  }
}
