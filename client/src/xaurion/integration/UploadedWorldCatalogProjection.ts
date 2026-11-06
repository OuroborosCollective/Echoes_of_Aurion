import { releaseGlbTree } from "../core/GlbModelLease";
import * as THREE from "three";
import type { GlbRuntimeCatalog } from "@shared/glbImportContract";
import type { WorldDesignReadback } from "@shared/aurionAuthoringContract";
import { joinWorldChunkPositionMm, splitWorldChunkPositionMm, type WorldChunkCoordinate } from "@shared/worldChunkProtocol";
import type { MMOEngine } from "../core/MMOEngine";
import { glbManager } from "../core/GLBModelManager";
import { returnStoneVisualPlacement, uploadedWorldVisualsForChunk, villageFountainVisualPlacement, villageStreetLampVisualPlacements, type UploadedWorldVisualPlacement } from "../core/UploadedAssetRuntime";
import { isStarterCityWallSource } from "@shared/aurionStarterCityWallContract";
import { isPlaceableWorldAsset } from "@shared/adminPlacementPlan";
import { authoredPlacementRef, uploadedAnchorRef, worldVisualTargetKind, type WorldVisualOverrideReadback, type WorldVisualTargetData } from "@shared/worldVisualOverrideContract";

/** A placement plus the stable world reference the admin cursor and overrides address. */
type ProjectedPlacement = UploadedWorldVisualPlacement & Readonly<{ placementRef: string }>;

/**
 * Stable reference of a projected placement. Uploaded-catalog anchors drop the catalog
 * revision and the automatically chosen asset, so a replacement stays at its location
 * when new models change the automatic choice.
 */
export function uploadedPlacementRef(placementId: string): string {
  const uploaded = /^uploaded:[^:]+:(-?\d+):(-?\d+):(\d+):/.exec(placementId);
  if (uploaded) return uploadedAnchorRef(Number(uploaded[1]), Number(uploaded[2]), Number(uploaded[3]));
  // Dedicated village visuals: contract version plus placement key, without revision or asset.
  const dedicated = /^(aurion\.[a-z-]+\.v\d+):[^:]+:(?:([A-Za-z0-9._-]+):)?glb_/.exec(placementId);
  if (dedicated) return `uploaded:fixed.${dedicated[1]}${dedicated[2] ? `.${dedicated[2]}` : ""}`;
  return `uploaded:other.${placementId.replace(/[^A-Za-z0-9._-]/g, "-").slice(0, 120)}`;
}

type Rendered = Readonly<{ sha256: string; root: THREE.Group; lodLevels: readonly number[] }>;
/** Back-off before re-rendering a placement whose terrain was not ready / whose model failed. */
export const WORLD_VISUAL_TERRAIN_RETRY_MS = 2_000;
export const WORLD_VISUAL_LOAD_RETRY_MS = 10_000;
/** Automatic catalog anchors and dedicated village visuals around the player. */
const MAX_RENDERED = 18;
/**
 * Intentionally authored placements (World Designs, admin placements) have their own
 * budget: an object the admin just placed must never be displaced by automatic anchors.
 */
export const MAX_AUTHORED_RENDERED = 48;

export function targetSizeMeters(subcategory: string | null): number {
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
 * Logical catalog assets may contain up to four hash-bound physical LOD GLBs.
 *
 * The exact owner-selected return-stone GLB has one dedicated visual placement
 * at the live zone origin. Its presence still grants no gameplay authority.
 */
/**
 * Scale and anchor of a world visual, shared by the projection and the admin placement
 * preview so a placed object appears exactly as previewed.
 */
export function fitWorldVisual(scene: THREE.Object3D, asset: Pick<GlbRuntimeCatalog["entries"][number], "sha256" | "subcategory">, scalePermille: number) {
  scene.updateMatrixWorld(true);
  // Bounds include every LOD level. Family members are expected to share the
  // same authored origin/scale; we normalize the logical root exactly once.
  const bounds = new THREE.Box3().setFromObject(scene, true);
  if (bounds.isEmpty()) return null;
  const size = bounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z);
  if (!Number.isFinite(maxDimension) || maxDimension <= 0.0001) return null;
  // These pinned wall bytes are authored in metres and already normalized
  // by the server manifest. Fitting a city perimeter to a 5 m prop destroys it.
  const assetScale = isStarterCityWallSource(asset.sha256) ? 1 : targetSizeMeters(asset.subcategory) / maxDimension;
  const scale = THREE.MathUtils.clamp(assetScale * (scalePermille / 1_000), 0.05, 12);
  return { scale, center: bounds.getCenter(new THREE.Vector3()), bounds };
}

export class UploadedWorldCatalogProjection {
  readonly root = new THREE.Group();
  private catalog: GlbRuntimeCatalog | null = null;
  private worldDesign: WorldDesignReadback | null = null;
  private overrides = new Map<string, string>();
  private overridesHash = "none";
  private readonly rendered = new Map<string, Rendered>();
  private readonly pending = new Set<string>();
  private signature = "";
  /** Wanted placement id -> asset hash of the current world state (checked when a load finishes). */
  private wanted = new Map<string, string>();
  /** Earliest retry time per placement after a failed render (terrain not ready, load error). */
  private readonly retryAt = new Map<string, number>();
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

  setWorldDesign(worldDesign: WorldDesignReadback | null): void {
    if (this.disposed) return;
    if (this.worldDesign?.revision === worldDesign?.revision) return;
    this.worldDesign = worldDesign;
    this.signature = "";
  }

  /** Persisted admin replacements (placement reference -> catalog asset). */
  setVisualOverrides(readback: WorldVisualOverrideReadback | null): void {
    if (this.disposed) return;
    const hash = readback?.readbackHash ?? "none";
    if (hash === this.overridesHash) return;
    this.overridesHash = hash;
    this.overrides = new Map((readback?.overrides ?? []).map(entry => [entry.placementRef, entry.assetId] as const));
    this.signature = "";
  }

  private withOverride(placement: UploadedWorldVisualPlacement, placementRef: string): ProjectedPlacement {
    const replacementId = this.overrides.get(placementRef);
    // Same rule as the server write: only approved world models (world purpose) replace world visuals.
    const replacement = replacementId ? this.catalog?.entries.find(entry => entry.assetId === replacementId && isPlaceableWorldAsset(entry)) : undefined;
    return Object.freeze({ ...placement, ...(replacement ? { asset: replacement } : {}), placementRef });
  }

  private desired(position: { x: number; z: number }): { center: WorldChunkCoordinate; placements: ProjectedPlacement[] } {
    if (!this.catalog) return { center: { x: 0, z: 0 }, placements: [] };
    const center = splitWorldChunkPositionMm({ x: Math.round(position.x * 1000), z: Math.round(position.z * 1000) }).coordinate;
    const placements: ProjectedPlacement[] = [];
    const generated: UploadedWorldVisualPlacement[] = [];
    for (let z = center.z - 1; z <= center.z + 1; z += 1) for (let x = center.x - 1; x <= center.x + 1; x += 1) {
      generated.push(...uploadedWorldVisualsForChunk(this.catalog, { x, z }));
    }
    const returnStone = returnStoneVisualPlacement(this.catalog);
    if (returnStone && Math.abs(center.x) <= 1 && Math.abs(center.z) <= 1) generated.push(returnStone);
    const fountain = villageFountainVisualPlacement(this.catalog);
    if (fountain && Math.abs(center.x) <= 1 && Math.abs(center.z) <= 1) generated.push(fountain);
    if (Math.abs(center.x) <= 1 && Math.abs(center.z) <= 1) {
      generated.push(...villageStreetLampVisualPlacements(this.catalog));
    }
    for (const placement of generated) placements.push(this.withOverride(placement, uploadedPlacementRef(placement.id)));

    for (const design of this.worldDesign?.designs ?? []) {
      for (const placement of design.placements) {
        if (Math.abs(placement.chunkX - center.x) > 1 || Math.abs(placement.chunkZ - center.z) > 1) continue;
        const asset = this.catalog.entries.find(entry => entry.assetId === placement.assetId && isPlaceableWorldAsset(entry));
        if (!asset) continue;
        const worldPosition = joinWorldChunkPositionMm({
          coordinate: { x: placement.chunkX, z: placement.chunkZ },
          localPositionMm: { x: placement.xMm, z: placement.zMm },
        });
        placements.push(this.withOverride(Object.freeze({
          id: `authored:${design.designHash.slice(0, 12)}:${placement.placementKey}`,
          asset,
          xMm: worldPosition.x,
          zMm: worldPosition.z,
          rotationQuarterTurns: placement.rotationQuarterTurns,
          scalePermille: placement.scalePermille,
        }), authoredPlacementRef(design.designKey, placement.placementKey)));
      }
    }
    // Dedicated village visuals first, then intentionally authored placements (World
    // Design, admin placements), then automatic catalog anchors; nearest first within each.
    const dedicatedPriority = (placement: ProjectedPlacement) =>
      placement.id.startsWith("aurion.return-stone")
      || placement.id.startsWith("aurion.village-fountain")
      || placement.id.startsWith("aurion.village-street-lamp")
      || isStarterCityWallSource(placement.asset.sha256)
        ? 0
        : placement.id.startsWith("authored:") ? 1 : 2;
    placements.sort((left, right) => {
      const priority = dedicatedPriority(left) - dedicatedPriority(right);
      if (priority) return priority;
      const ld = Math.hypot(left.xMm / 1000 - position.x, left.zMm / 1000 - position.z);
      const rd = Math.hypot(right.xMm / 1000 - position.x, right.zMm / 1000 - position.z);
      return ld - rd || left.id.localeCompare(right.id);
    });
    const authored = placements.filter(placement => dedicatedPriority(placement) === 1).slice(0, MAX_AUTHORED_RENDERED);
    const automatic = placements.filter(placement => dedicatedPriority(placement) !== 1).slice(0, MAX_RENDERED);
    return { center, placements: [...automatic, ...authored] };
  }

  private remove(id: string): void {
    const current = this.rendered.get(id);
    if (!current) return;
    releaseGlbTree(current.root);
    current.root.removeFromParent();
    this.rendered.delete(id);
  }

  private async project(placement: ProjectedPlacement, originX: number, originZ: number): Promise<void> {
    if (this.disposed || this.pending.has(placement.id)) return;
    const current = this.rendered.get(placement.id);
    if (current?.sha256 === placement.asset.sha256) return;
    this.pending.add(placement.id);
    let unowned: THREE.Group | undefined;
    try {
      const loaded = await glbManager.loadStaticLodFamily(placement.asset);
      unowned = loaded.scene;
      if (this.disposed || !staticRenderable(loaded.scene)) return;
      const stillAllowed = this.catalog?.entries.some(entry => entry.assetId === placement.asset.assetId && entry.sha256 === placement.asset.sha256 && entry.purpose === placement.asset.purpose);
      // Removed or replaced while loading: never draw a placement the world no longer wants.
      if (!stillAllowed || this.wanted.get(placement.id) !== placement.asset.sha256) return;

      const fit = fitWorldVisual(loaded.scene, placement.asset, placement.scalePermille ?? 1_000);
      if (!fit) return;
      const { scale, center, bounds } = fit;
      const worldX = placement.xMm / 1000;
      const worldZ = placement.zMm / 1000;
      const terrainY = this.engine.landscape.chunkManager.getElevationAt(worldX, worldZ);
      if (!Number.isFinite(terrainY)) { this.retryAt.set(placement.id, performance.now() + WORLD_VISUAL_TERRAIN_RETRY_MS); return; }

      const holder = new THREE.Group();
      holder.name = `uploaded-world:${placement.id}`;
      holder.userData.uploadedWorldCatalog = Object.freeze({ assetId: placement.asset.assetId, sha256: placement.asset.sha256, purpose: placement.asset.purpose, lodLevels: loaded.lodLevels });
      // Addressable by the admin cursor; visual only, no collider or gameplay object.
      const targetKind = worldVisualTargetKind(placement.placementRef);
      if (targetKind) holder.userData.worldVisualTarget = Object.freeze({ placementRef: placement.placementRef, targetKind, assetId: placement.asset.assetId, displayName: placement.asset.displayName } satisfies WorldVisualTargetData);
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
      this.rendered.set(placement.id, Object.freeze({ sha256: placement.asset.sha256, root: holder, lodLevels: loaded.lodLevels }));
      this.retryAt.delete(placement.id);
      unowned = undefined;
    } catch {
      // Existing world visuals remain authoritative when an uploaded render fails; retry with a back-off.
      this.retryAt.set(placement.id, performance.now() + WORLD_VISUAL_LOAD_RETRY_MS);
    } finally {
      if (unowned) releaseGlbTree(unowned);
      this.pending.delete(placement.id);
    }
  }

  update(position = { x: this.engine.player.position.x, z: this.engine.player.position.z }): void {
    if (this.disposed) return;
    const { center, placements } = this.desired(position);
    const originX = center.x * 64;
    const originZ = center.z * 64;
    const nextSignature = `${this.catalog?.revision ?? "none"}:${this.worldDesign?.revision ?? "none"}:${this.overridesHash}:${center.x}:${center.z}:${placements.map(value => `${value.id}:${value.asset.sha256}:${value.scalePermille ?? 1000}:${(value.asset.lods ?? []).map(lod => `${lod.level}:${lod.sha256}`).join(",")}`).join("|")}`;
    if (nextSignature === this.signature) {
      // Retry placements whose last render failed once their back-off has passed.
      if (this.retryAt.size) {
        const now = performance.now();
        for (const placement of placements) {
          const at = this.retryAt.get(placement.id);
          if (at !== undefined && at <= now && !this.rendered.has(placement.id)) { this.retryAt.delete(placement.id); void this.project(placement, originX, originZ); }
        }
      }
      return;
    }
    this.signature = nextSignature;
    this.wanted = new Map(placements.map(placement => [placement.id, placement.asset.sha256] as const));
    for (const id of [...this.retryAt.keys()]) if (!this.wanted.has(id)) this.retryAt.delete(id);
    this.root.position.set(originX, 0, originZ);
    const ids = new Set(placements.map(placement => placement.id));
    for (const id of [...this.rendered.keys()]) if (!ids.has(id)) this.remove(id);
    for (const placement of placements) void this.project(placement, originX, originZ);
  }

  evidence() {
    return Object.freeze({ catalogRevision: this.catalog?.revision ?? null, worldDesignRevision: this.worldDesign?.revision ?? null, rendered: this.rendered.size, pending: this.pending.size, maxRendered: MAX_RENDERED, maxAuthoredRendered: MAX_AUTHORED_RENDERED,
      assets: Object.freeze([...this.rendered.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, value]) => Object.freeze({ id, sha256: value.sha256, lodLevels: value.lodLevels }))) });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending.clear();
    for (const id of [...this.rendered.keys()]) this.remove(id);
    this.root.removeFromParent();
  }
}
