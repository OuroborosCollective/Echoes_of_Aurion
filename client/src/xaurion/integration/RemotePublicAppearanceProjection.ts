import { releaseGlbTree } from "../core/GlbModelLease";
import * as THREE from "three";
import type { ConfirmedZonePresence } from "@shared/zonePresenceContract";
import type { MMOEngine } from "../core/MMOEngine";
import { AnimatedGlbActor } from "../core/AnimatedGlbActor";
import { actorLodBand, actorUsesSkinnedVisual, emptyActorLodCounts, shouldUpdateActorAnimation, type ActorLodBand, type ActorLodCounts } from "../core/actorLod";
import { glbManager } from "../core/GLBModelManager";
import { CONFIRMED_REMOTE_PRESENCES_EVENT, REMOTE_PUBLIC_APPEARANCE_ACTIVE_EVENT } from "./RemotePresenceProjection";

type PublicAppearance = Readonly<{ userId: number; assetId: string; displayName: string; storageUrl: string }>;
type ActorRecord = {
  appearance: PublicAppearance;
  actor: AnimatedGlbActor;
  lastPosition: { x: number; z: number } | null;
  accumulatedAnimationDelta: number;
  lod: ActorLodBand;
};

/** Public appearance is a presentation projection over already-confirmed zone presence. */
export class RemotePublicAppearanceProjection {
  readonly root = new THREE.Group();
  private presences: readonly ConfirmedZonePresence[] = Object.freeze([]);
  private readonly appearances = new Map<number, PublicAppearance>();
  private readonly actors = new Map<number, ActorRecord>();
  private readonly pending = new Set<number>();
  private refreshBusy = false;
  private lastRefreshTick = -150;
  private lastUserSignature = "";
  private activeSignature = "";
  private disposed = false;
  private lodCounts: ActorLodCounts = emptyActorLodCounts();
  private mixerUpdatesLastFrame = 0;
  private mixerUpdatesTotal = 0;

  constructor(private readonly engine: MMOEngine) {
    this.root.name = "aurion-remote-public-glb-appearances";
    engine.scene.add(this.root);
    if (typeof window !== "undefined") window.addEventListener(CONFIRMED_REMOTE_PRESENCES_EVENT, this.onPresences as EventListener);
  }

  private onPresences = (event: Event) => {
    if (this.disposed) return;
    const value = (event as CustomEvent<{ presences?: unknown }>).detail?.presences;
    const presences = Array.isArray(value) ? value.filter((entry): entry is ConfirmedZonePresence => Boolean(entry && typeof entry === "object" && Number.isSafeInteger((entry as ConfirmedZonePresence).userId) && (entry as ConfirmedZonePresence).userId > 0 && (entry as ConfirmedZonePresence).position && Number.isSafeInteger((entry as ConfirmedZonePresence).position.x) && Number.isSafeInteger((entry as ConfirmedZonePresence).position.z))) : [];
    this.presences = Object.freeze(presences.map(presence => Object.freeze({ ...presence, position: Object.freeze({ ...presence.position }) })));
    const ids = new Set(this.presences.map(presence => presence.userId));
    for (const userId of [...this.actors.keys()]) if (!ids.has(userId)) this.remove(userId);
    for (const userId of [...this.appearances.keys()]) if (!ids.has(userId)) this.appearances.delete(userId);
    const signature = [...ids].sort((a, b) => a - b).join(",");
    if (signature !== this.lastUserSignature) {
      this.lastUserSignature = signature;
      void this.refreshAppearances();
    }
  };

  private activeUserIds(): readonly number[] {
    return Object.freeze([...this.actors.entries()]
      .filter(([, record]) => record.actor.group.visible && actorUsesSkinnedVisual(record.lod))
      .map(([userId]) => userId)
      .sort((a, b) => a - b));
  }

  private announceActive(): void {
    if (typeof window === "undefined") return;
    const userIds = this.activeUserIds();
    const signature = userIds.join(",");
    if (signature === this.activeSignature) return;
    this.activeSignature = signature;
    window.dispatchEvent(new CustomEvent(REMOTE_PUBLIC_APPEARANCE_ACTIVE_EVENT, { detail: { userIds } }));
  }

  private remove(userId: number): void {
    const existing = this.actors.get(userId);
    if (!existing) return;
    existing.actor.dispose();
    this.actors.delete(userId);
    this.announceActive();
  }

  private async ensureActor(appearance: PublicAppearance): Promise<void> {
    if (this.disposed || this.pending.has(appearance.userId)) return;
    const existing = this.actors.get(appearance.userId);
    if (existing?.appearance.storageUrl === appearance.storageUrl) return;
    this.pending.add(appearance.userId);
    let unowned: THREE.Group | undefined;
    try {
      const loaded = await glbManager.loadModel(appearance.storageUrl);
      unowned = loaded.scene;
      if (this.disposed || !this.presences.some(presence => presence.userId === appearance.userId)) return;
      if (!loaded.animations.some(clip => /idle/i.test(clip.name))) return;
      const latest = this.appearances.get(appearance.userId);
      if (!latest || latest.storageUrl !== appearance.storageUrl) return;
      this.remove(appearance.userId);
      const actor = new AnimatedGlbActor(loaded.scene, loaded.animations, 2);
      actor.group.name = `aurion-remote-public-player:${appearance.userId}`;
      actor.group.userData.publicAppearance = Object.freeze({ userId: appearance.userId, assetId: appearance.assetId, storageUrl: appearance.storageUrl });
      actor.group.visible = false;
      this.root.add(actor.group);
      this.actors.set(appearance.userId, { appearance, actor, lastPosition: null, accumulatedAnimationDelta: 0, lod: "very_far" });
      unowned = undefined;
    } catch {
      // Capsule fallback stays visible until the GLB is proven renderable.
    } finally {
      if (unowned) releaseGlbTree(unowned);
      this.pending.delete(appearance.userId);
    }
  }

  private async refreshAppearances(): Promise<void> {
    if (this.disposed || this.refreshBusy) return;
    const userIds = this.presences.map(presence => presence.userId).sort((a, b) => a - b);
    if (!userIds.length) {
      for (const id of [...this.actors.keys()]) this.remove(id);
      this.appearances.clear();
      return;
    }
    this.refreshBusy = true;
    try {
      const response = await fetch(`/api/game/public-player-appearances?userIds=${encodeURIComponent(userIds.join(","))}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("REMOTE_APPEARANCE_UNAVAILABLE");
      const body = await response.json() as { appearances?: unknown };
      const values = Array.isArray(body.appearances) ? body.appearances.filter((value): value is PublicAppearance => Boolean(value && typeof value === "object" && Number.isSafeInteger((value as PublicAppearance).userId) && typeof (value as PublicAppearance).assetId === "string" && typeof (value as PublicAppearance).storageUrl === "string" && /^\/api\/assets\/glb\/[a-f0-9]{64}\.glb$/.test((value as PublicAppearance).storageUrl))) : [];
      const allowed = new Set(values.map(value => value.userId));
      for (const userId of [...this.actors.keys()]) if (!allowed.has(userId)) this.remove(userId);
      for (const userId of [...this.appearances.keys()]) if (!allowed.has(userId)) this.appearances.delete(userId);
      for (const appearance of values) this.appearances.set(appearance.userId, Object.freeze({ ...appearance }));
    } catch {
      // Keep already-proven actors/appearance metadata through transient reads.
    } finally { this.refreshBusy = false; }
  }

  update(delta: number, logicalTick: number): void {
    if (this.disposed) return;
    if (logicalTick - this.lastRefreshTick >= 150) { this.lastRefreshTick = logicalTick; void this.refreshAppearances(); }
    const selfPosition = this.engine.player.position;
    const originX = Math.floor(selfPosition.x / 64) * 64;
    const originZ = Math.floor(selfPosition.z / 64) * 64;
    this.root.position.set(originX, 0, originZ);
    const counts = { near: 0, mid: 0, far: 0, very_far: 0 } satisfies Record<ActorLodBand, number>;
    let mixerUpdates = 0;
    const frameDelta = Number.isFinite(delta) && delta > 0 ? Math.min(delta, .25) : 0;

    for (const presence of this.presences) {
      const worldX = presence.position.x / 1000;
      const worldZ = presence.position.z / 1000;
      const y = this.engine.landscape.chunkManager.getElevationAt(worldX, worldZ);
      if (!Number.isFinite(y)) { this.remove(presence.userId); continue; }
      const band = actorLodBand(Math.hypot(worldX - selfPosition.x, worldZ - selfPosition.z));
      counts[band] += 1;
      const appearance = this.appearances.get(presence.userId);
      if (actorUsesSkinnedVisual(band) && appearance) void this.ensureActor(appearance);

      const record = this.actors.get(presence.userId);
      if (!record) continue;
      if (appearance && record.appearance.storageUrl !== appearance.storageUrl) {
        record.actor.group.visible = false;
        void this.ensureActor(appearance);
        continue;
      }

      record.lod = band;
      record.actor.group.position.set(worldX - originX, y, worldZ - originZ);
      const moved = record.lastPosition ? Math.hypot(presence.position.x - record.lastPosition.x, presence.position.z - record.lastPosition.z) : 0;
      record.lastPosition = { ...presence.position };
      if (!actorUsesSkinnedVisual(band)) {
        record.actor.group.visible = false;
        record.accumulatedAnimationDelta = 0;
        continue;
      }

      record.actor.group.visible = true;
      record.actor.setLocomotion(moved > 20 ? 2 : 0);
      record.accumulatedAnimationDelta = Math.min(.25, record.accumulatedAnimationDelta + frameDelta);
      if (record.accumulatedAnimationDelta > 0 && shouldUpdateActorAnimation(logicalTick, `player:${presence.userId}`, band)) {
        record.actor.update(record.accumulatedAnimationDelta);
        record.accumulatedAnimationDelta = 0;
        mixerUpdates += 1;
      }
    }

    this.lodCounts = Object.freeze({ ...counts });
    this.mixerUpdatesLastFrame = mixerUpdates;
    this.mixerUpdatesTotal += mixerUpdates;
    this.announceActive();
  }

  evidence() {
    const activeSkinnedActors = this.activeUserIds().length;
    return Object.freeze({
      confirmedPresences: this.presences.length,
      renderedPublicAppearances: this.actors.size,
      activeSkinnedActors,
      proxyRepresentations: Math.max(0, this.presences.length - activeSkinnedActors),
      lod: this.lodCounts,
      mixerUpdatesLastFrame: this.mixerUpdatesLastFrame,
      mixerUpdatesTotal: this.mixerUpdatesTotal,
      pending: this.pending.size,
      users: Object.freeze([...this.actors.keys()].sort((a, b) => a - b)),
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof window !== "undefined") window.removeEventListener(CONFIRMED_REMOTE_PRESENCES_EVENT, this.onPresences as EventListener);
    for (const id of [...this.actors.keys()]) this.remove(id);
    this.appearances.clear();
    this.pending.clear();
    this.root.removeFromParent();
    this.activeSignature = "__disposed__";
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(REMOTE_PUBLIC_APPEARANCE_ACTIVE_EVENT, { detail: { userIds: [] } }));
  }
}
