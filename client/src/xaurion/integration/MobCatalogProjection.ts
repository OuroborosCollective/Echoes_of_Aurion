import * as THREE from "three";
import { type GlbLodLevel, type GlbRuntimeCatalog } from "@shared/glbImportContract";
import { assetTier, type AssetTier } from "@shared/glbPresentationBudget";
import { validConfirmedZoneCombatEvent, type ConfirmedZoneCombatEvent } from "@shared/zoneCombatContract";
import type { MMOEngine } from "../core/MMOEngine";
import { AnimatedGlbActor } from "../core/AnimatedGlbActor";
import { glbManager } from "../core/GLBModelManager";
import { releaseGlbTree } from "../core/GlbModelLease";
import { ACTOR_LOD_MID_MAX_METERS, ACTOR_LOD_NEAR_MAX_METERS } from "../core/actorLod";
import { subscribeConfirmedMobCombat } from "./zoneCombatBridge";
import { enemyFallbackDiagnostics, selectEnemyGlb } from "../core/EnemyGlbFallback";

type MobVisual = MMOEngine["mobManager"]["mobs"][number];
type Loaded = Awaited<ReturnType<typeof glbManager.loadModel>>;
type Projected = { visual: MobVisual; actor: AnimatedGlbActor; assetId: string; variantKey: string; sha256: string; lodLevel: GlbLodLevel; oldBodyVisible: boolean; lastPosition: THREE.Vector3; sampleTime: number; speed: number; deadSeconds: number | null; lastAttackSequence: number };
/** Exact authored presentation binding. Catalog approval/revocation remains
 * mandatory; a filename or a legacy occupied starter target cannot claim it. */
/** Legacy fixture identity retained for tests/asset provenance only; runtime selection is generic. */
export const CLOCKWORK_STALKER_GLB_SHA = "94a98c7a1f2c38d8933d8c70d4f27f20d3df7e090a281f7aec48c826354c7b4a";

export class MobCatalogProjection {
  private catalog: GlbRuntimeCatalog | null = null;
  private readonly projected = new Map<string, Projected>();
  private readonly pending = new Map<string, number>();
  private readonly wanted = new Map<string, MobVisual>();
  private readonly failures = new Map<string, { attempts: number; retryAt: number; reason: string; tier: AssetTier; fallbackCandidates: number; budgetRejectedCandidates: number }>();
  private disposed = false;
  private clock = 0;
  private generation = 0;
  private elapsed = 1;
  private readonly detach: () => void;

  constructor(private readonly engine: Pick<MMOEngine, "scene" | "player" | "landscape" | "mobManager">,
    private readonly load: (url: string) => Promise<Loaded> = url => glbManager.loadModel(url)) {
    this.detach = subscribeConfirmedMobCombat(event => this.acceptCombat(event));
  }

  private presentationTier(): AssetTier {
    return assetTier(typeof window === "undefined" ? 1200 : window.innerWidth);
  }

  private preferredLod(visual: MobVisual): GlbLodLevel {
    const distance = Math.hypot(visual.data.x - this.engine.player.position.x, visual.data.z - this.engine.player.position.z);
    return distance < ACTOR_LOD_NEAR_MAX_METERS ? 0 : distance < ACTOR_LOD_MID_MAX_METERS ? 1 : 2;
  }

  private selection(visual: MobVisual, fallbackOffset = 0) {
    return selectEnemyGlb(
      this.catalog,
      visual.data.type,
      this.preferredLod(visual),
      this.presentationTier(),
      `${visual.data.type}:${visual.data.id}`,
      fallbackOffset,
    );
  }

  setCatalog(catalog: GlbRuntimeCatalog): void {
    this.catalog = catalog;
    this.failures.clear();
    this.elapsed = 1;
    for (const [id, projected] of this.projected) {
      const selected = this.selection(projected.visual);
      if (!selected || selected.entry.sha256 !== projected.sha256) this.remove(id, false);
    }
  }

  private async acquire(visual: MobVisual): Promise<void> {
    const id = visual.data.id, failure = this.failures.get(id), tier = this.presentationTier(), diagnostics = enemyFallbackDiagnostics(this.catalog, visual.data.type, tier), selection = this.selection(visual, failure?.attempts ?? 0);
    if (!selection || this.pending.has(id) || this.projected.has(id) || (failure && (failure.attempts >= 3 || this.clock < failure.retryAt))) {
      if (!selection && this.catalog) this.failures.set(id, { attempts: failure?.attempts ?? 0, retryAt: this.clock + 5, reason: diagnostics.fallbackCandidates === 0 ? "NO_FALLBACK_CANDIDATES" : diagnostics.compatibleCandidates === 0 ? "NO_COMPATIBLE_FALLBACK" : "NO_FALLBACK_SELECTION", tier, fallbackCandidates: diagnostics.fallbackCandidates, budgetRejectedCandidates: diagnostics.budgetRejected });
      if (!selection && this.catalog) visual.body.visible = false;
      return;
    }
    const token = ++this.generation; this.pending.set(id, token);
    // A compatible approved enemy GLB suppresses the legacy red capsule immediately;
    // the catalog actor becomes visible only after its rig/animation checks pass.
    visual.body.visible = false;
    let loaded: Loaded | null = null;
    let actor: AnimatedGlbActor | null = null;
    try {
      loaded = await this.load(selection.entry.storageUrl);
      const currentSelection = this.selection(visual, failure?.attempts ?? 0);
      if (this.disposed || this.pending.get(id) !== token || this.wanted.get(id) !== visual || !currentSelection || currentSelection.entry.sha256 !== selection.entry.sha256 || visual.data.hp <= 0) return;
      let triangles = 0, bones = 0;
      loaded.scene.traverse(node => {
        if ((node as THREE.Bone).isBone) bones++;
        if ((node as THREE.Mesh).isMesh) { const g = (node as THREE.Mesh).geometry; triangles += (g.index?.count ?? g.getAttribute("position")?.count ?? 0) / 3; }
      });
      if (!Number.isInteger(triangles) || triangles < 1 || triangles > 1600 || bones < 1 || bones > 64) throw Error("MOB_GLB_BUDGET_OR_RIG");
      actor = new AnimatedGlbActor(loaded.scene, loaded.animations, 1.65); loaded = null;
      for (const pose of ["idle", "walk", "run", "attack", "death"] as const) if (!actor.hasAnimatedPose(pose)) throw Error("MOB_GLB_MOVING_CLIPS_REQUIRED");
      actor.group.name = `aurion-confirmed-mob-glb:${id}`;
      actor.group.userData.catalogLod = Object.freeze({ assetId: selection.entry.assetId, physicalSha256: selection.entry.sha256, level: selection.lod });
      actor.group.position.copy(visual.group.position);
      this.engine.scene.add(actor.group);
      this.failures.delete(id);
      this.projected.set(id, { visual, actor, assetId: selection.entry.assetId, variantKey: selection.variantKey, sha256: selection.entry.sha256, lodLevel: selection.lod, oldBodyVisible: visual.body.visible, lastPosition: visual.group.position.clone(), sampleTime: 0, speed: 0, deadSeconds: null, lastAttackSequence: 0 });
      visual.body.visible = false; actor = null;
    } catch (error) {
      const reason = error instanceof Error ? error.message.replace(/[^A-Z0-9_:-]/gi, "_").slice(0, 160) || "GLB_LOAD_FAILED" : "GLB_LOAD_FAILED";
      this.failures.set(id, { attempts: (failure?.attempts ?? 0) + 1, retryAt: this.clock + 0.25, reason, tier, fallbackCandidates: diagnostics.fallbackCandidates, budgetRejectedCandidates: diagnostics.budgetRejected });
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
    for (const [id, p] of [...this.projected]) {
      const v = byId.get(id);
      if (v !== p.visual || v.group.userData.aurionConfirmedMob !== true) { this.remove(id, false); continue; }
      const desiredSelection = this.selection(v);
      if (v.data.hp > 0 && (!desiredSelection || desiredSelection.entry.sha256 !== p.sha256)) { this.remove(id); continue; }
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
    if (!this.catalog) return;
    const player = this.engine.player.position;
    const limit = typeof window !== "undefined" && window.innerWidth < 768 ? 8 : 12;
    const near = mobs.filter(v => v.group.userData.aurionConfirmedMob === true && v.data.hp > 0)
      .map(v => ({ v, distance: Math.hypot(v.data.x - player.x, v.data.z - player.z) }))
      .filter(t => t.distance < 65).sort((a, b) => a.distance - b.distance || a.v.data.id.localeCompare(b.v.data.id));
    const corpses = [...this.projected.values()].filter(p => p.deadSeconds !== null).length;
    for (const { v } of near.slice(0, Math.max(0, limit - corpses))) this.wanted.set(v.data.id, v);
    for (const [id, p] of this.projected) if (!this.wanted.has(id) && p.deadSeconds === null) this.remove(id, false);
    for (const id of this.pending.keys()) if (!this.wanted.has(id)) this.pending.delete(id);
    for (const [id, v] of this.wanted) {
      if (this.pending.size >= 2) break;
      if (!this.projected.has(id)) void this.acquire(v);
    }
    for (const id of this.failures.keys()) if (!byId.has(id)) this.failures.delete(id);
  }

  evidence() {
    return {
      projected: this.projected.size,
      pending: this.pending.size,
      failed: this.failures.size,
      fallbackCandidates: this.catalog ? enemyFallbackDiagnostics(this.catalog, (mobs[0]?.data.type ?? "clockwork_stalker") as MobVisual["data"]["type"], this.presentationTier()).fallbackCandidates : 0,
      budgetRejected: [...this.failures.values()].reduce((sum, failure) => sum + failure.budgetRejectedCandidates, 0),
      noCompatibleFallback: [...this.failures.values()].filter(failure => failure.reason === "NO_COMPATIBLE_FALLBACK").length,
      physicalLods: [...this.projected].map(([id, p]) => ({ id, assetId: p.assetId, variantKey: p.variantKey, level: p.lodLevel, sha256: p.sha256, tier: this.presentationTier(), loadState: "loaded" as const })),
      rejected: [...this.failures].map(([id, failure]) => ({ id, tier: failure.tier, reason: failure.reason, fallbackCandidates: failure.fallbackCandidates, budgetRejectedCandidates: failure.budgetRejectedCandidates, loadState: "rejected" as const })),
      lastAttackSequences: [...this.projected].map(([id, p]) => ({ id, sequence: p.lastAttackSequence })),
    };
  }
  private remove(id: string, restoreBody = false): void {
    const p = this.projected.get(id); if (!p) return;
    p.visual.body.visible = restoreBody ? p.oldBodyVisible : false; p.actor.group.removeFromParent(); p.actor.dispose(); this.projected.delete(id);
  }
  dispose(): void { this.disposed = true; this.detach(); this.pending.clear(); this.wanted.clear(); for (const id of [...this.projected.keys()]) this.remove(id, true); }
}
