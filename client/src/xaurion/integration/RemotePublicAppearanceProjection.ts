import * as THREE from "three";
import type { ConfirmedZonePresence } from "@shared/zonePresenceContract";
import type { MMOEngine } from "../core/MMOEngine";
import { AnimatedGlbActor } from "../core/AnimatedGlbActor";
import { glbManager } from "../core/GLBModelManager";
import { CONFIRMED_REMOTE_PRESENCES_EVENT, REMOTE_PUBLIC_APPEARANCE_ACTIVE_EVENT } from "./RemotePresenceProjection";

type PublicAppearance = Readonly<{ userId: number; assetId: string; displayName: string; storageUrl: string }>;
type ActorRecord = { appearance: PublicAppearance; actor: AnimatedGlbActor; lastPosition: { x: number; z: number } | null };

/** Public appearance is a presentation projection over already-confirmed zone presence. */
export class RemotePublicAppearanceProjection {
  readonly root = new THREE.Group();
  private presences: readonly ConfirmedZonePresence[] = Object.freeze([]);
  private readonly actors = new Map<number, ActorRecord>();
  private readonly pending = new Set<number>();
  private refreshBusy = false;
  private lastRefreshTick = -150;
  private lastUserSignature = "";
  private disposed = false;

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
    const signature = [...ids].sort((a, b) => a - b).join(",");
    if (signature !== this.lastUserSignature) {
      this.lastUserSignature = signature;
      void this.refreshAppearances();
    }
  };

  private announceActive(): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(REMOTE_PUBLIC_APPEARANCE_ACTIVE_EVENT, { detail: { userIds: [...this.actors.keys()].sort((a, b) => a - b) } }));
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
    try {
      const loaded = await glbManager.loadModel(appearance.storageUrl);
      if (this.disposed || !this.presences.some(presence => presence.userId === appearance.userId)) return;
      if (!loaded.animations.some(clip => /idle/i.test(clip.name))) return;
      this.remove(appearance.userId);
      const actor = new AnimatedGlbActor(loaded.scene, loaded.animations, 2);
      actor.group.name = `aurion-remote-public-player:${appearance.userId}`;
      actor.group.userData.publicAppearance = Object.freeze({ userId: appearance.userId, assetId: appearance.assetId, storageUrl: appearance.storageUrl });
      this.root.add(actor.group);
      this.actors.set(appearance.userId, { appearance, actor, lastPosition: null });
      this.announceActive();
    } catch {
      // Capsule fallback stays visible until the GLB is proven renderable.
    } finally {
      this.pending.delete(appearance.userId);
    }
  }

  private async refreshAppearances(): Promise<void> {
    if (this.disposed || this.refreshBusy) return;
    const userIds = this.presences.map(presence => presence.userId).sort((a, b) => a - b);
    if (!userIds.length) { for (const id of [...this.actors.keys()]) this.remove(id); return; }
    this.refreshBusy = true;
    try {
      const response = await fetch(`/api/game/public-player-appearances?userIds=${encodeURIComponent(userIds.join(","))}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) throw new Error("REMOTE_APPEARANCE_UNAVAILABLE");
      const body = await response.json() as { appearances?: unknown };
      const values = Array.isArray(body.appearances) ? body.appearances.filter((value): value is PublicAppearance => Boolean(value && typeof value === "object" && Number.isSafeInteger((value as PublicAppearance).userId) && typeof (value as PublicAppearance).assetId === "string" && typeof (value as PublicAppearance).storageUrl === "string" && /^\/api\/assets\/glb\/[a-f0-9]{64}\.glb$/.test((value as PublicAppearance).storageUrl))) : [];
      const allowed = new Set(values.map(value => value.userId));
      for (const userId of [...this.actors.keys()]) if (!allowed.has(userId)) this.remove(userId);
      for (const appearance of values) void this.ensureActor(appearance);
    } catch {
      // Keep already-proven actors through transient reads; confirmed presence still owns position.
    } finally { this.refreshBusy = false; }
  }

  update(delta: number, logicalTick: number): void {
    if (this.disposed) return;
    if (logicalTick - this.lastRefreshTick >= 150) { this.lastRefreshTick = logicalTick; void this.refreshAppearances(); }
    const selfPosition = this.engine.player.position;
    const originX = Math.floor(selfPosition.x / 64) * 64;
    const originZ = Math.floor(selfPosition.z / 64) * 64;
    this.root.position.set(originX, 0, originZ);
    for (const presence of this.presences) {
      const record = this.actors.get(presence.userId);
      if (!record) continue;
      const worldX = presence.position.x / 1000;
      const worldZ = presence.position.z / 1000;
      const y = this.engine.landscape.chunkManager.getElevationAt(worldX, worldZ);
      if (!Number.isFinite(y)) { this.remove(presence.userId); continue; }
      const moved = record.lastPosition ? Math.hypot(presence.position.x - record.lastPosition.x, presence.position.z - record.lastPosition.z) : 0;
      record.actor.setLocomotion(moved > 20 ? 2 : 0);
      record.actor.group.position.set(worldX - originX, y, worldZ - originZ);
      record.actor.update(delta);
      record.lastPosition = { ...presence.position };
    }
  }

  evidence() { return Object.freeze({ confirmedPresences: this.presences.length, renderedPublicAppearances: this.actors.size, pending: this.pending.size, users: Object.freeze([...this.actors.keys()].sort((a, b) => a - b)) }); }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof window !== "undefined") window.removeEventListener(CONFIRMED_REMOTE_PRESENCES_EVENT, this.onPresences as EventListener);
    for (const id of [...this.actors.keys()]) this.remove(id);
    this.pending.clear();
    this.root.removeFromParent();
    this.announceActive();
  }
}
