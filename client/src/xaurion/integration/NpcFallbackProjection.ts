import * as THREE from "three";
import { glbRuntimeCatalogSchema, type GlbRuntimeCatalog } from "@shared/glbImportContract";
import type { NPCCharacter } from "../types";
import type { MMOEngine } from "../core/MMOEngine";
import { AnimatedGlbActor } from "../core/AnimatedGlbActor";
import { glbManager } from "../core/GLBModelManager";
import { selectNpcGlb } from "../core/NpcGlbFallback";

type ProjectedNpc = Readonly<{
  sha256: string;
  actor: AnimatedGlbActor;
  proceduralMeshes: readonly THREE.Object3D[];
}>;

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
 * Presentation-only adapter for the still-rendered AX1/procedural NPC surface.
 * It never writes NPC/gameplay state. A failed catalog read or GLB load leaves
 * the original procedural body visible rather than inventing success.
 */
export class NpcFallbackProjection {
  private catalog: GlbRuntimeCatalog | null = null;
  private readonly projected = new Map<string, ProjectedNpc>();
  private readonly pending = new Set<string>();
  private disposed = false;
  private refreshBusy = false;
  private lastRefreshTick = -150;

  constructor(private readonly engine: MMOEngine) {
    void this.refreshCatalog();
  }

  private async refreshCatalog(): Promise<void> {
    if (this.refreshBusy || this.disposed) return;
    this.refreshBusy = true;
    try {
      const response = await fetch("/api/game/glb-catalog", { credentials: "same-origin" });
      if (!response.ok) throw new Error("GLB_CATALOG_UNAVAILABLE");
      const catalog = glbRuntimeCatalogSchema.parse(await response.json());
      if (!this.disposed) this.catalog = catalog;
    } catch {
      // Keep the last confirmed catalog through transient transport failures.
      // A later confirmed catalog can still revoke/reselect a fallback.
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

  private async project(npc: NPCCharacter): Promise<void> {
    if (this.disposed || this.pending.has(npc.id)) return;
    const selection = selectNpcGlb(this.catalog, npc.id);
    if (!selection || selection.source !== "fallback") { this.restoreNpc(npc.id); return; }
    const existing = this.projected.get(npc.id);
    if (existing?.sha256 === selection.entry.sha256) return;
    const procedural = findProceduralNpcVisual(this.engine.scene, npc);
    if (!procedural) return;

    this.pending.add(npc.id);
    try {
      const loaded = await glbManager.loadModel(selection.entry.storageUrl);
      if (this.disposed) return;
      const currentSelection = selectNpcGlb(this.catalog, npc.id);
      if (!currentSelection || currentSelection.source !== "fallback" || currentSelection.entry.sha256 !== selection.entry.sha256) return;
      const currentVisual = findProceduralNpcVisual(this.engine.scene, npc);
      if (!currentVisual) return;

      this.restoreNpc(npc.id);
      const actor = new AnimatedGlbActor(loaded.scene, loaded.animations, 2);
      actor.group.name = `aurion-npc-fallback:${npc.id}`;
      actor.group.userData.npcFallback = Object.freeze({ npcId: npc.id, assetId: selection.entry.assetId, sha256: selection.entry.sha256, source: "catalog" });
      currentVisual.group.add(actor.group);
      currentVisual.body.forEach(mesh => { mesh.visible = false; });
      this.projected.set(npc.id, Object.freeze({ sha256: selection.entry.sha256, actor, proceduralMeshes: Object.freeze(currentVisual.body.slice()) }));
    } catch {
      // Fail visibly to the existing procedural NPC. No GLB success is claimed.
    } finally {
      this.pending.delete(npc.id);
    }
  }

  update(delta: number, logicalTick: number): void {
    if (this.disposed) return;
    for (const projected of this.projected.values()) projected.actor.update(delta);
    if (logicalTick - this.lastRefreshTick >= 150) {
      this.lastRefreshTick = logicalTick;
      void this.refreshCatalog();
    }
    const liveNpcIds = new Set(this.engine.npcs.map(npc => npc.id));
    for (const npcId of [...this.projected.keys()]) if (!liveNpcIds.has(npcId)) this.restoreNpc(npcId);
    for (const npc of this.engine.npcs) void this.project(npc);
  }

  evidence(): readonly Readonly<{ npcId: string; sha256: string; presentation: ReturnType<AnimatedGlbActor["evidence"]> }>[] {
    return Object.freeze([...this.projected.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([npcId, projected]) => Object.freeze({
      npcId,
      sha256: projected.sha256,
      presentation: projected.actor.evidence(),
    })));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const npcId of [...this.projected.keys()]) this.restoreNpc(npcId);
    this.pending.clear();
  }
}
