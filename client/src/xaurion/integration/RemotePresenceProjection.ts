import * as THREE from "three";
import { validConfirmedPresences, ZONE_MAX_PRESENCES, type ConfirmedZonePresence } from "@shared/zonePresenceContract";

/** Only authenticated zone actors enter this bounded, read-only render projection. */
export class RemotePresenceProjection {
  readonly mesh: THREE.InstancedMesh;
  private readonly geometry: THREE.CapsuleGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private disposed = false;
  private current: readonly ConfirmedZonePresence[] = [];
  constructor(private readonly scene: THREE.Scene, private readonly selfUserId: number, private readonly elevation: (x: number, z: number) => number) {
    if (!Number.isSafeInteger(selfUserId) || selfUserId < 1) throw new Error("REMOTE_SELF_INVALID");
    this.geometry = new THREE.CapsuleGeometry(.3, 1.1, 3, 6);
    this.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .65 });
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, ZONE_MAX_PRESENCES - 1);
    this.mesh.name = "aurion-confirmed-remote-players";
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }
  get presences() { return this.current; }
  apply(presences: unknown): void {
    if (this.disposed) return;
    if (!validConfirmedPresences(presences) || !presences.some(p => p.userId === this.selfUserId)) throw new Error("REMOTE_SNAPSHOT_INVALID");
    const others = presences.filter(p => p.userId !== this.selfUserId).sort((a, b) => a.userId - b.userId);
    const transforms = others.map(p => {
      const x = p.position.x / 1000, z = p.position.z / 1000;
      const y = this.elevation(x, z);
      if (!Number.isFinite(y)) throw new Error("REMOTE_ELEVATION_INVALID");
      return new THREE.Matrix4().makeTranslation(x, y + .85, z);
    });
    others.forEach((p, i) => {
      this.mesh.setMatrixAt(i, transforms[i]);
      // Display-only actor tint, stable for the confirmed account identity.
      this.mesh.setColorAt(i, new THREE.Color([0x66bbcc, 0xe3c578, 0xa4d090, 0xc3a1df][p.userId % 4]));
    });
    this.mesh.count = others.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.current = Object.freeze(others.map(p => Object.freeze({ ...p, position: Object.freeze({ ...p.position }) })));
  }
  clear(): void { this.mesh.count = 0; this.current = Object.freeze([]); }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear(); this.scene.remove(this.mesh); this.geometry.dispose(); this.material.dispose(); this.mesh.dispose();
  }
}
