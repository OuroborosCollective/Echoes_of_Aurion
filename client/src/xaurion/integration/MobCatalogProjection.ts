import * as THREE from "three";
import type { GlbRuntimeCatalog } from "@shared/glbImportContract";
import { validConfirmedZoneCombatEvent, type ConfirmedZoneCombatEvent } from "@shared/zoneCombatContract";
import type { MMOEngine } from "../core/MMOEngine";
import { AnimatedGlbActor } from "../core/AnimatedGlbActor";
import { glbManager } from "../core/GLBModelManager";
import { releaseGlbTree } from "../core/GlbModelLease";
import { subscribeConfirmedMobCombat } from "./zoneCombatBridge";

type MobVisual = MMOEngine["mobManager"]["mobs"][number];
type Loaded = Awaited<ReturnType<typeof glbManager.loadModel>>;
type Projected = { visual: MobVisual; actor: AnimatedGlbActor; oldBodyVisible: boolean; lastPosition: THREE.Vector3; sampleTime: number; speed: number; deadSeconds: number | null; lastAttackSequence: number };
/** Exact authored presentation binding. Catalog approval/revocation remains
 * mandatory; a filename or a legacy occupied starter target cannot claim it. */
export const CLOCKWORK_STALKER_GLB_SHA = "94a98c7a1f2c38d8933d8c70d4f27f20d3df7e090a281f7aec48c826354c7b4a";

export class MobCatalogProjection {
  private catalog: GlbRuntimeCatalog | null = null;
  private readonly projected = new Map<string, Projected>();
  private readonly pending = new Map<string, number>();
  private readonly wanted = new Map<string, MobVisual>();
  private readonly failures = new Map<string, { attempts: number; retryAt: number }>();
  private disposed = false;
  private clock = 0;
  private generation = 0;
  private elapsed = 1;
  private readonly detach: () => void;

  constructor(private readonly engine: Pick<MMOEngine, "scene" | "player" | "landscape" | "mobManager">,
    private readonly load: (url: string) => Promise<Loaded> = url => glbManager.loadModel(url)) {
    this.detach = subscribeConfirmedMobCombat(event => this.acceptCombat(event));
  }

  private entry() {
    return this.catalog?.entries.find(e => e.purpose === "auto" && e.assetType === "enemy" && e.sha256 === CLOCKWORK_STALKER_GLB_SHA);
  }

  setCatalog(catalog: GlbRuntimeCatalog): void {
    this.catalog = catalog;
    if (!this.entry()) {
      this.wanted.clear(); this.pending.clear();
      for (const id of [...this.projected.keys()]) this.remove(id);
    }
    this.elapsed = 1;
  }

  private async acquire(visual: MobVisual): Promise<void> {
    const id = visual.data.id, entry = this.entry(), failure = this.failures.get(id);
    if (!entry || this.pending.has(id) || this.projected.has(id) || (failure && (failure.attempts >= 3 || this.clock < failure.retryAt))) return;
    const token = ++this.generation; this.pending.set(id, token);
    let loaded: Loaded | null = null;
    let actor: AnimatedGlbActor | null = null;
    try {
      loaded = await this.load(entry.storageUrl);
      if (this.disposed || this.pending.get(id) !== token || this.wanted.get(id) !== visual || !this.entry() || visual.data.hp <= 0) return;
      let triangles = 0, bones = 0;
      loaded.scene.traverse(node => {
        if ((node as THREE.Bone).isBone) bones++;
        if ((node as THREE.Mesh).isMesh) { const g = (node as THREE.Mesh).geometry; triangles += (g.index?.count ?? g.getAttribute("position")?.count ?? 0) / 3; }
      });
      if (!Number.isInteger(triangles) || triangles < 1 || triangles > 1600 || bones < 1 || bones > 64) throw Error("MOB_GLB_BUDGET_OR_RIG");
      actor = new AnimatedGlbActor(loaded.scene, loaded.animations, 1.65); loaded = null;
      for (const pose of ["idle", "walk", "run", "attack", "death"] as const) if (!actor.hasAnimatedPose(pose)) throw Error("MOB_GLB_MOVING_CLIPS_REQUIRED");
      actor.group.name = `aurion-confirmed-mob-glb:${id}`;
      actor.group.position.copy(visual.group.position);
      this.engine.scene.add(actor.group);
      this.projected.set(id, { visual, actor, oldBodyVisible: visual.body.visible, lastPosition: visual.group.position.clone(), sampleTime: 0, speed: 0, deadSeconds: null, lastAttackSequence: 0 });
      visual.body.visible = false; actor = null;
    } catch {
      this.failures.set(id, { attempts: (failure?.attempts ?? 0) + 1, retryAt: this.clock + 5 });
    } finally {
      actor?.dispose(); if (loaded) releaseGlbTree(loaded.scene);
      if (this.pending.get(id) === token) this.pending.delete(id);
    }
  }

  acceptCombat(event: ConfirmedZoneCombatEvent): void {
    if (this.disposed || !validConfirmedZoneCombatEvent(event)) return;
    const current = this.projected.get(event.attackerEntityId);
    if (!current || current.deadSeconds !== null || current.visual.data.hp <= 0 || event.sequence <= current.lastAttackSequence) return;
    current.lastAttackSequence = event.sequence;
    current.actor.playOnce("attack");
  }

  update(delta: number): void {
    if (this.disposed || !Number.isFinite(delta) || delta < 0) return;
    this.clock += delta; this.elapsed += delta;
    const mobs = this.engine.mobManager?.mobs ?? [];
    const byId = new Map(mobs.map(v => [v.data.id, v]));
    for (const [id, p] of this.projected) {
      const v = byId.get(id);
      if (v !== p.visual || !this.entry() || v.group.userData.aurionConfirmedMob !== true) { this.remove(id); continue; }
      if (v.data.hp <= 0) {
        if (p.deadSeconds === null) { p.deadSeconds = 0; p.actor.playOnce("death"); }
        p.deadSeconds += delta;
        if (p.deadSeconds > 1.8) { this.remove(id); continue; }
        p.actor.group.visible = true;
      } else {
        if (p.deadSeconds !== null) { this.remove(id); continue; }
        p.actor.group.visible = v.group.visible;
        p.sampleTime += delta;
        if (p.sampleTime >= .15) {
          const dx = v.group.position.x - p.lastPosition.x, dz = v.group.position.z - p.lastPosition.z;
          const distance = Math.hypot(dx, dz);
          p.speed = distance / p.sampleTime;
          if (distance > .015) p.actor.group.rotation.y = Math.atan2(dx, dz);
          p.lastPosition.copy(v.group.position); p.sampleTime = 0;
        }
        p.actor.setLocomotion(p.speed);
        const y = this.engine.landscape.chunkManager.getElevationAt(v.data.x, v.data.z);
        if (Number.isFinite(y)) p.actor.group.position.set(v.data.x, y, v.data.z);
      }
      p.actor.update(delta);
    }
    if (this.elapsed < .5) return;
    this.elapsed = 0; this.wanted.clear();
    if (!this.entry()) return;
    const player = this.engine.player.position;
    const limit = typeof window !== "undefined" && window.innerWidth < 768 ? 8 : 12;
    const near = mobs.filter(v => v.data.type === "clockwork_stalker" && v.group.userData.aurionConfirmedMob === true && v.data.hp > 0)
      .map(v => ({ v, distance: Math.hypot(v.data.x - player.x, v.data.z - player.z) }))
      .filter(t => t.distance < 65).sort((a, b) => a.distance - b.distance || a.v.data.id.localeCompare(b.v.data.id));
    const corpses = [...this.projected.values()].filter(p => p.deadSeconds !== null).length;
    for (const { v } of near.slice(0, Math.max(0, limit - corpses))) this.wanted.set(v.data.id, v);
    for (const [id, p] of this.projected) if (!this.wanted.has(id) && p.deadSeconds === null) this.remove(id);
    for (const id of this.pending.keys()) if (!this.wanted.has(id)) this.pending.delete(id);
    for (const [id, v] of this.wanted) {
      if (this.pending.size >= 2) break;
      if (!this.projected.has(id)) void this.acquire(v);
    }
    for (const id of this.failures.keys()) if (!byId.has(id)) this.failures.delete(id);
  }

  evidence() { return { sha256: this.entry()?.sha256 ?? null, projected: this.projected.size, pending: this.pending.size, failed: this.failures.size, trianglesPerModel: 1300, lastAttackSequences: [...this.projected].map(([id, p]) => ({ id, sequence: p.lastAttackSequence })) }; }
  private remove(id: string): void {
    const p = this.projected.get(id); if (!p) return;
    p.visual.body.visible = p.oldBodyVisible; p.actor.group.removeFromParent(); p.actor.dispose(); this.projected.delete(id);
  }
  dispose(): void { this.disposed = true; this.detach(); this.pending.clear(); this.wanted.clear(); for (const id of [...this.projected.keys()]) this.remove(id); }
}
