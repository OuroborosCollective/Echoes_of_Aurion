import * as THREE from "three";

export const AX1_COMBAT_PRESENTATION_SOURCE_REVISION = "286c575d3d0050ffa77b794d5b7a7e24858acee8" as const;
export const AX1_COMBAT_PRESENTATION_SOURCE_PATH = "src/engine/combat/TelegraphVisualizer.ts" as const;

export type Ax1ConfirmedTelegraphKind = "circle" | "cone" | "line";

export type Ax1ConfirmedTelegraphSpec = Readonly<{
  id: string;
  kind: Ax1ConfirmedTelegraphKind;
  x: number;
  y: number;
  z: number;
  color: string;
  startTick: number;
  impactTick: number;
  angleRadians?: number;
  radius?: number;
  arcRadians?: number;
  width?: number;
  length?: number;
}>;

type ActiveTelegraph = {
  spec: Ax1ConfirmedTelegraphSpec;
  outerMesh: THREE.Mesh;
  innerMesh: THREE.Mesh;
};

/**
 * Presentation-only AX1 telegraph renderer.
 *
 * The caller must provide a server-confirmed identity/spec. This presenter never
 * decides damage, hit results, target state, timing authority or rewards. Fill
 * progress and expiry advance only from confirmed logical Zone ticks.
 */
export class Ax1CombatTelegraphPresenter {
  private readonly active = new Map<string, ActiveTelegraph>();
  private lastConfirmedTick = -1;

  public constructor(private readonly scene: THREE.Scene) {}

  public addConfirmed(spec: Ax1ConfirmedTelegraphSpec): void {
    if (this.active.has(spec.id)) return;
    if (!Number.isSafeInteger(spec.startTick) || spec.startTick < 0) return;
    if (!Number.isSafeInteger(spec.impactTick) || spec.impactTick <= spec.startTick) return;

    const baseColor = new THREE.Color(spec.color);
    let outerGeometry: THREE.BufferGeometry;
    let innerGeometry: THREE.BufferGeometry;

    if (spec.kind === "circle") {
      const radius = Math.max(0.05, spec.radius ?? 1);
      outerGeometry = new THREE.RingGeometry(radius * 0.95, radius, 32);
      innerGeometry = new THREE.CircleGeometry(radius, 32);
    } else if (spec.kind === "cone") {
      const radius = Math.max(0.05, spec.radius ?? 1);
      const arc = spec.arcRadians ?? Math.PI / 2;
      outerGeometry = new THREE.RingGeometry(radius * 0.92, radius, 24, 1, -arc / 2, arc);
      innerGeometry = new THREE.CircleGeometry(radius, 24, -arc / 2, arc);
    } else {
      const width = Math.max(0.05, spec.width ?? 3);
      const length = Math.max(0.05, spec.length ?? 10);
      outerGeometry = new THREE.PlaneGeometry(width, length);
      innerGeometry = new THREE.PlaneGeometry(width * 0.96, length);
    }

    outerGeometry.rotateX(-Math.PI / 2);
    innerGeometry.rotateX(-Math.PI / 2);

    const outerMaterial = new THREE.MeshBasicMaterial({
      color: baseColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const innerMaterial = new THREE.MeshBasicMaterial({
      color: baseColor,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });

    const outerMesh = new THREE.Mesh(outerGeometry, outerMaterial);
    const innerMesh = new THREE.Mesh(innerGeometry, innerMaterial);
    outerMesh.position.set(spec.x, spec.y + 0.04, spec.z);
    innerMesh.position.set(spec.x, spec.y + 0.03, spec.z);

    if (spec.angleRadians !== undefined) {
      outerMesh.rotation.y = spec.angleRadians;
      innerMesh.rotation.y = spec.angleRadians;
    }

    innerMesh.scale.set(0.02, 1, 0.02);
    this.scene.add(outerMesh);
    this.scene.add(innerMesh);
    this.active.set(spec.id, { spec, outerMesh, innerMesh });

    if (this.lastConfirmedTick >= 0) this.projectConfirmedTick(spec.id, this.lastConfirmedTick);
  }

  public updateConfirmedTick(tick: number): void {
    if (!Number.isSafeInteger(tick) || tick < 0) return;
    if (tick < this.lastConfirmedTick) return;
    this.lastConfirmedTick = tick;
    for (const id of [...this.active.keys()]) this.projectConfirmedTick(id, tick);
  }

  private projectConfirmedTick(id: string, tick: number): void {
    const entry = this.active.get(id);
    if (!entry) return;
    if (tick >= entry.spec.impactTick) {
      this.remove(id);
      return;
    }
    const totalTicks = entry.spec.impactTick - entry.spec.startTick;
    const elapsedTicks = Math.max(0, Math.min(totalTicks, tick - entry.spec.startTick));
    const progress = elapsedTicks / totalTicks;
    entry.innerMesh.scale.set(Math.max(0.02, progress), 1, Math.max(0.02, progress));
    (entry.innerMesh.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.35 * progress;
  }

  public remove(id: string): void {
    const entry = this.active.get(id);
    if (!entry) return;
    this.scene.remove(entry.outerMesh);
    this.scene.remove(entry.innerMesh);
    entry.outerMesh.geometry.dispose();
    entry.innerMesh.geometry.dispose();
    (entry.outerMesh.material as THREE.Material).dispose();
    (entry.innerMesh.material as THREE.Material).dispose();
    this.active.delete(id);
  }

  public clear(): void {
    for (const id of [...this.active.keys()]) this.remove(id);
  }

  public activeCount(): number {
    return this.active.size;
  }
}
