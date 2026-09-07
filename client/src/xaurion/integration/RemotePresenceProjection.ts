import { splitWorldChunkPositionMm } from "@shared/worldChunkProtocol";
import * as THREE from "three";
import { validConfirmedPresences, ZONE_MAX_PRESENCES, type ConfirmedZonePresence } from "@shared/zonePresenceContract";

export const CONFIRMED_REMOTE_PRESENCES_EVENT = "aurion:confirmed-remote-presences" as const;
export const REMOTE_PUBLIC_APPEARANCE_ACTIVE_EVENT = "aurion:remote-public-appearance-active" as const;

/** Only authenticated zone actors enter this bounded, read-only render projection. */
export class RemotePresenceProjection {
  readonly mesh: THREE.InstancedMesh;
  private readonly geometry: THREE.CapsuleGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private disposed = false;
  private current: readonly ConfirmedZonePresence[] = [];
  private hiddenUsers = new Set<number>();
  private originX = 0;
  private originZ = 0;

  constructor(private readonly scene: THREE.Scene, private readonly selfUserId: number, private readonly elevation: (x: number, z: number) => number) {
    if (!Number.isSafeInteger(selfUserId) || selfUserId < 1) throw new Error("REMOTE_SELF_INVALID");
    this.geometry = new THREE.CapsuleGeometry(.3, 1.1, 3, 6);
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .65 });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, ZONE_MAX_PRESENCES - 1);
    this.mesh.name = "aurion-confirmed-remote-players";
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    if (typeof window !== "undefined") window.addEventListener(REMOTE_PUBLIC_APPEARANCE_ACTIVE_EVENT, this.onAppearanceActive as EventListener);
  }

  get presences() { return this.current; }

  private render(): void {
    const zero = new THREE.Vector3(0, 0, 0);
    this.current.forEach((presence, index) => {
      const x = presence.position.x / 1000, z = presence.position.z / 1000;
      const y = this.elevation(x, z);
      if (!Number.isFinite(y)) throw new Error("REMOTE_ELEVATION_INVALID");
      const matrix = new THREE.Matrix4().makeTranslation(x - this.originX, y + .85, z - this.originZ);
      if (this.hiddenUsers.has(presence.userId)) matrix.scale(zero);
      this.mesh.setMatrixAt(index, matrix);
      this.mesh.setColorAt(index, new THREE.Color([0x66bbcc, 0xe3c578, 0xa4d090, 0xc3a1df][presence.userId % 4]));
    });
    this.mesh.position.set(this.originX, 0, this.originZ);
    this.mesh.count = this.current.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private assertRenderable(presences: readonly ConfirmedZonePresence[]): void {
    for (const presence of presences) {
      const x = presence.position.x / 1000;
      const z = presence.position.z / 1000;
      if (!Number.isFinite(this.elevation(x, z))) throw new Error("REMOTE_ELEVATION_INVALID");
    }
  }

  private onAppearanceActive = (event: Event) => {
    if (this.disposed) return;
    const value = (event as CustomEvent<{ userIds?: unknown }>).detail?.userIds;
    const ids = Array.isArray(value) ? value.filter((id): id is number => Number.isSafeInteger(id) && id > 0) : [];
    this.hiddenUsers = new Set(ids);
    this.render();
  };

  apply(presences: unknown): void {
    if (this.disposed) return;
    if (!validConfirmedPresences(presences) || !presences.some(p => p.userId === this.selfUserId)) throw new Error("REMOTE_SNAPSHOT_INVALID");
    const self = presences.find(p => p.userId === this.selfUserId)!;
    const center = splitWorldChunkPositionMm(self.position).coordinate;
    const next = Object.freeze(presences
      .filter(p => p.userId !== this.selfUserId)
      .sort((a, b) => a.userId - b.userId)
      .map(p => Object.freeze({ ...p, position: Object.freeze({ ...p.position }) })));

    // Fail closed before mutating either the confirmed read model or the visible mesh.
    this.assertRenderable(next);
    this.originX = center.x * 64;
    this.originZ = center.z * 64;
    this.current = next;
    this.render();
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CONFIRMED_REMOTE_PRESENCES_EVENT, { detail: { presences: this.current } }));
  }

  clear(): void {
    this.mesh.count = 0;
    this.current = Object.freeze([]);
    this.hiddenUsers.clear();
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CONFIRMED_REMOTE_PRESENCES_EVENT, { detail: { presences: this.current } }));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (typeof window !== "undefined") window.removeEventListener(REMOTE_PUBLIC_APPEARANCE_ACTIVE_EVENT, this.onAppearanceActive as EventListener);
    this.clear(); this.scene.remove(this.mesh); this.geometry.dispose(); this.material.dispose(); this.mesh.dispose();
  }
}
