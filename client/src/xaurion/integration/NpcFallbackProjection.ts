import * as THREE from "three";
import { glbRuntimeCatalogSchema, type GlbRuntimeCatalog } from "@shared/glbImportContract";
import type { NPCCharacter } from "../types";
import type { MMOEngine } from "../core/MMOEngine";
import { AnimatedGlbActor } from "../core/AnimatedGlbActor";
import { actorLodBand, actorUsesSkinnedVisual, emptyActorLodCounts, shouldUpdateActorAnimation, type ActorLodBand, type ActorLodCounts } from "../core/actorLod";
import { glbManager } from "../core/GLBModelManager";
import { selectNpcGlb } from "../core/NpcGlbFallback";
import { UploadedWorldCatalogProjection } from "./UploadedWorldCatalogProjection";
import { RemotePublicAppearanceProjection } from "./RemotePublicAppearanceProjection";
import { EquipmentCatalogProjection } from "./EquipmentCatalogProjection";

type ProjectedNpc = {
  sha256: string;
  actor: AnimatedGlbActor;
  proceduralMeshes: readonly THREE.Object3D[];
  accumulatedAnimationDelta: number;
  lod: ActorLodBand;
};

const NPC_FALLBACK_LOW_LOD_DISTANCE_METERS = 42;
const NPC_VERY_FAR_PROXY_CAPACITY = 256;
function near(left: number, right: number): boolean { return Math.abs(left - right) <= 0.01; }

/**
 * Identifies only the existing legacy/model-less NPC body contract. The golden
 * quest marker is deliberately excluded so interaction affordance remains even
 * after the GLB body is projected.
 */
export function findProceduralNpcVisual(scene: THREE.Scene, npc: Pick<NPCCharacter, "x" | "z">): { group: THREE.Group; body: THREE.Object3D[] } | null {
  for (const child of scene.children) {
    if (!(child instanceof THREE.Group) || !near(child.position.x, npc.x) || !near(child.position.z, npc.z)) continue;
    const meshes = child.children.filter(candidate => (candidate as THREE.Mesh).isMesh) as THREE.Mesh[];
    const cylinder = meshes.find(mesh => mesh.geometry?.type === "CylinderGeometry");
    const sphere = meshes.find(mesh => mesh.geometry?.type === "SphereGeometry");
    const marker = meshes.find(mesh => mesh.geometry?.type === "OctahedronGeometry");
    if (cylinder && sphere && marker) return { group: child, body: [cylinder, sphere] };
  }
  return null;
}

/**
 * Presentation-only adapter for catalog-backed visuals still hosted on the
 * legacy AX1 projection tick. It never writes NPC/gameplay/world truth. Failed
 * catalog or GLB reads retain the existing procedural/world presentation.
 */
export class NpcFallbackProjection {
  private catalog: GlbRuntimeCatalog | null = null;
  private readonly projected = new Map<string, ProjectedNpc>();
  private readonly pending = new Set<string>();
  private readonly uploadedWorld: UploadedWorldCatalogProjection;
  private readonly remotePublic: RemotePublicAppearanceProjection;
  private readonly equipment: EquipmentCatalogProjection;
  readonly farProxyMesh: THREE.InstancedMesh;
  private readonly farProxyGeometry = new THREE.CapsuleGeometry(.28, 1, 2, 4);
  private readonly farProxyMaterial = new THREE.MeshStandardMaterial({ color: 0xb7a56b, roughness: .82 });
  private readonly proxyPosition = new THREE.Vector3();
  private readonly proxyMatrix = new THREE.Matrix4();
  private disposed = false;
  private refreshBusy = false;
  private lastRefreshTick = -150;
  private lodCounts: ActorLodCounts = emptyActorLodCounts();
  private mixerUpdatesLastFrame = 0;
  private mixerUpdatesTotal = 0;
  private farProxyCount = 0;
  private farProxyOverflow = 0;

  constructor(private readonly engine: MMOEngine) {
    this.uploadedWorld = new UploadedWorldCatalogProjection(engine);
    this.remotePublic = new RemotePublicAppearanceProjection(engine);
    this.equipment = new EquipmentCatalogProjection(engine);
    this.farProxyMesh = new THREE.InstancedMesh(this.farProxyGeometry, this.farProxyMaterial, NPC_VERY_FAR_PROXY_CAPACITY);
    this.farProxyMesh.name = "aurion-npc-very-far-proxies";
    this.farProxyMesh.count = 0;
    this.farProxyMesh.frustumCulled = false;
    engine.scene.add(this.farProxyMesh);
    void this.refreshCatalog();
  }

  private async refreshCatalog(): Promise<void> {
    if (this.refreshBusy || this.disposed) return;
    this.refreshBusy = true;
    try {
      const response = await fetch("/api/game/glb-catalog", { credentials: "same-origin" });
      if (!response.ok) throw new Error("GLB_CATALOG_UNAVAILABLE");
      const catalog = glbRuntimeCatalogSchema.parse(await response.json());
      if (!this.disposed) {
        this.catalog = catalog;
        this.uploadedWorld.setCatalog(catalog);
        this.equipment.setCatalog(catalog);
      }
    } catch {
      // Keep the last confirmed catalog through transient transport failures.
      // A later confirmed catalog can still revoke/reselect a visual.
    } finally {
      this.refreshBusy = false;
    }
  }

  private restoreNpc(npcId: string): void {
    const previous = this.projected.get(npcId);
    if (!previous) return;
    previous.actor.dispose();
    previous.proceduralMeshes.forEach(mesh => { mesh.visible = true; });
    this.projected.delete(npcId);
  }

  private distanceToCamera(npc: NPCCharacter): number {
    return Math.hypot(npc.x - this.engine.camera.position.x, npc.z - this.engine.camera.position.z);
  }

  private preferredLod(npc: NPCCharacter): 0 | 1 {
    return this.distanceToCamera(npc) >= NPC_FALLBACK_LOW_LOD_DISTANCE_METERS ? 1 : 0;
  }

  private async project(npc: NPCCharacter): Promise<void> {
    if (this.disposed || this.pending.has(npc.id)) return;
    const selection = selectNpcGlb(this.catalog, npc.id, null, this.preferredLod(npc));
    if (!selection || selection.source !== "fallback") { this.restoreNpc(npc.id); return; }
    const existing = this.projected.get(npc.id);
    if (existing?.sha256 === selection.entry.sha256) return;
    const procedural = findProceduralNpcVisual(this.engine.scene, npc);
    if (!procedural) return;

    this.pending.add(npc.id);
    try {
      const loaded = await glbManager.loadModel(selection.entry.storageUrl);
      if (this.disposed) return;
      const currentSelection = selectNpcGlb(this.catalog, npc.id, null, this.preferredLod(npc));
      if (!currentSelection || currentSelection.source !== "fallback" || currentSelection.entry.sha256 !== selection.entry.sha256) return;
      const currentVisual = findProceduralNpcVisual(this.engine.scene, npc);
      if (!currentVisual) return;

      this.restoreNpc(npc.id);
      const actor = new AnimatedGlbActor(loaded.scene, loaded.animations, 2);
      actor.group.name = `aurion-npc-fallback:${npc.id}`;
      actor.group.userData.npcFallback = Object.freeze({ npcId: npc.id, assetId: selection.entry.assetId, sha256: selection.entry.sha256, variantKey: selection.variantKey, lod: selection.lod, source: "catalog" });
      currentVisual.group.add(actor.group);
      const band = actorLodBand(this.distanceToCamera(npc));
      const veryFar = band === "very_far";
      actor.group.visible = !veryFar;
      // Keep the old cheap body visible until the next update has actually
      // placed this NPC into the shared instanced proxy. No actor vanishes.
      currentVisual.body.forEach(mesh => { mesh.visible = veryFar; });
      this.projected.set(npc.id, {
        sha256: selection.entry.sha256,
        actor,
        proceduralMeshes: Object.freeze(currentVisual.body.slice()),
        accumulatedAnimationDelta: 0,
        lod: band,
      });
    } catch {
      // Fail visibly to the existing procedural NPC. No GLB success is claimed.
    } finally {
      this.pending.delete(npc.id);
    }
  }

  private projectVeryFarInstances(candidates: readonly ProjectedNpc[]): void {
    let count = 0;
    let overflow = 0;
    for (const projected of candidates) {
      if (count >= NPC_VERY_FAR_PROXY_CAPACITY) {
        projected.proceduralMeshes.forEach(mesh => { mesh.visible = true; });
        overflow += 1;
        continue;
      }
      const parent = projected.actor.group.parent;
      if (!parent) {
        projected.proceduralMeshes.forEach(mesh => { mesh.visible = true; });
        overflow += 1;
        continue;
      }
      parent.updateWorldMatrix(true, false);
      parent.getWorldPosition(this.proxyPosition);
      this.proxyMatrix.makeTranslation(this.proxyPosition.x, this.proxyPosition.y + .8, this.proxyPosition.z);
      this.farProxyMesh.setMatrixAt(count, this.proxyMatrix);
      projected.proceduralMeshes.forEach(mesh => { mesh.visible = false; });
      count += 1;
    }
    this.farProxyMesh.count = count;
    this.farProxyMesh.instanceMatrix.needsUpdate = true;
    this.farProxyCount = count;
    this.farProxyOverflow = overflow;
  }

  update(delta: number, logicalTick: number): void {
    if (this.disposed) return;
    const liveNpc = new Map(this.engine.npcs.map(npc => [npc.id, npc] as const));
    const counts = { near: 0, mid: 0, far: 0, very_far: 0 } satisfies Record<ActorLodBand, number>;
    const frameDelta = Number.isFinite(delta) && delta > 0 ? Math.min(delta, .25) : 0;
    const veryFarCandidates: ProjectedNpc[] = [];
    let mixerUpdates = 0;

    for (const [npcId, projected] of this.projected) {
      const npc = liveNpc.get(npcId);
      if (!npc) { this.restoreNpc(npcId); continue; }
      const band = actorLodBand(this.distanceToCamera(npc));
      counts[band] += 1;
      projected.lod = band;
      if (band === "very_far") {
        projected.actor.group.visible = false;
        projected.accumulatedAnimationDelta = 0;
        veryFarCandidates.push(projected);
        continue;
      }

      projected.proceduralMeshes.forEach(mesh => { mesh.visible = false; });
      projected.actor.group.visible = true;
      if (!actorUsesSkinnedVisual(band)) {
        // Far keeps the already-selected low-LOD GLB as a static idle visual.
        projected.accumulatedAnimationDelta = 0;
        continue;
      }
      projected.accumulatedAnimationDelta = Math.min(.25, projected.accumulatedAnimationDelta + frameDelta);
      if (projected.accumulatedAnimationDelta > 0 && shouldUpdateActorAnimation(logicalTick, `npc:${npcId}`, band)) {
        projected.actor.update(projected.accumulatedAnimationDelta);
        projected.accumulatedAnimationDelta = 0;
        mixerUpdates += 1;
      }
    }

    this.projectVeryFarInstances(veryFarCandidates);
    this.lodCounts = Object.freeze({ ...counts });
    this.mixerUpdatesLastFrame = mixerUpdates;
    this.mixerUpdatesTotal += mixerUpdates;
    this.uploadedWorld.update();
    this.remotePublic.update(delta, logicalTick);
    this.equipment.update(delta, logicalTick);
    if (logicalTick - this.lastRefreshTick >= 150) {
      this.lastRefreshTick = logicalTick;
      void this.refreshCatalog();
    }
    for (const npc of this.engine.npcs) void this.project(npc);
  }

  evidence(): readonly Readonly<{ npcId: string; sha256: string; lod: ActorLodBand; presentation: ReturnType<AnimatedGlbActor["evidence"]> }>[] {
    return Object.freeze([...this.projected.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([npcId, projected]) => Object.freeze({
      npcId,
      sha256: projected.sha256,
      lod: projected.lod,
      presentation: projected.actor.evidence(),
    })));
  }

  crowdEvidence() {
    const activeSkinnedActors = [...this.projected.values()].filter(projected => projected.actor.group.visible && actorUsesSkinnedVisual(projected.lod)).length;
    const staticGlbActors = [...this.projected.values()].filter(projected => projected.actor.group.visible && projected.lod === "far").length;
    return Object.freeze({
      projectedNpcs: this.projected.size,
      activeSkinnedActors,
      staticGlbActors,
      instancedVeryFarProxies: this.farProxyCount,
      proxyOverflowFallbacks: this.farProxyOverflow,
      lod: this.lodCounts,
      mixerUpdatesLastFrame: this.mixerUpdatesLastFrame,
      mixerUpdatesTotal: this.mixerUpdatesTotal,
    });
  }

  uploadedWorldEvidence() { return this.uploadedWorld.evidence(); }
  remotePublicEvidence() { return this.remotePublic.evidence(); }
  equipmentEvidence() { return this.equipment.evidence(); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.equipment.dispose();
    this.remotePublic.dispose();
    this.uploadedWorld.dispose();
    for (const npcId of [...this.projected.keys()]) this.restoreNpc(npcId);
    this.pending.clear();
    this.engine.scene.remove(this.farProxyMesh);
    this.farProxyGeometry.dispose();
    this.farProxyMaterial.dispose();
    this.farProxyMesh.dispose();
  }
}
