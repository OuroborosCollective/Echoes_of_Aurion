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
  castDurationMs: number;
  angleRadians?: number;
  radius?: number;
  arcRadians?: number;
  width?: number;
  length?: number;
}>;

type ActiveTelegraph = {
  spec: Ax1ConfirmedTelegraphSpec;
  elapsedMs: number;
  outerMesh: THREE.Mesh;
  innerMesh: THREE.Mesh;
};

/**
 * Presentation-only AX1 telegraph renderer.
 *
 * The caller must provide a server-confirmed identity/spec. This presenter never
 * decides damage, hit results, target state, timing authority or rewards. Local
 * frame delta is used only to animate already-confirmed presentation geometry.
 */
export class Ax1CombatTelegraphPresenter {
  private readonly active = new Map<string, ActiveTelegraph>();

  public constructor(private readonly scene: THREE.Scene) {}

  public addConfirmed(spec: Ax1ConfirmedTelegraphSpec): void {
    if (this.active.has(spec.id)) return;
    if (!Number.isFinite(spec.castDurationMs) || spec.castDurationMs <= 0) return;

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
    this.active.set(spec.id, { spec, elapsedMs: 0, outerMesh, innerMesh });
  }

  public updatePresentation(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;

    for (const [id, entry] of this.active) {
      entry.elapsedMs = Math.min(entry.spec.castDurationMs, entry.elapsedMs + deltaMs);
      const progress = entry.elapsedMs / entry.spec.castDurationMs;
      entry.innerMesh.scale.set(Math.max(0.02, progress), 1, Math.max(0.02, progress));
      (entry.innerMesh.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.35 * progress;
      if (entry.elapsedMs >= entry.spec.castDurationMs) this.remove(id);
    }
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
