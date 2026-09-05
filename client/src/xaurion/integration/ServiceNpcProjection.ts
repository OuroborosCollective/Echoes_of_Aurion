import * as THREE from "three";
import type { WorldServiceNpc } from "@shared/worldServiceNpcs";
import { AnimatedGlbActor } from "../core/AnimatedGlbActor";
import { glbManager } from "../core/GLBModelManager";

/** Server-published service placement and catalog-selected visual. */
export class ServiceNpcProjection {
  private actor: AnimatedGlbActor | null = null;
  private retired = false;
  readonly group = new THREE.Group();
  constructor(readonly definition: WorldServiceNpc, scene: THREE.Scene, private readonly elevation: (x: number, z: number) => number) {
    this.group.name = definition.id;
    this.group.position.set(definition.positionMm.x / 1000, 0, definition.positionMm.z / 1000);
    this.group.position.y = elevation(this.group.position.x, this.group.position.z);
    scene.add(this.group);
  }
  async load(url: string): Promise<void> {
    const glb = await glbManager.loadModel(url);
    if (this.retired) return;
    this.actor?.dispose();
    this.actor = new AnimatedGlbActor(glb.scene, glb.animations, this.definition.heightMeters);
    this.group.add(this.actor.group);
  }
  update(delta: number): void {
    if (this.retired) return;
    this.group.position.y = this.elevation(this.group.position.x, this.group.position.z);
    this.actor?.update(delta);
  }
  isNearby(position: { x: number; z: number }): boolean {
    return Boolean(this.actor) && Math.hypot(position.x - this.group.position.x, position.z - this.group.position.z) <= this.definition.interactionRadiusMeters;
  }
  interact(position: { x: number; z: number }): boolean {
    if (!this.isNearby(position)) return false;
    this.group.rotation.y = Math.atan2(position.x - this.group.position.x, position.z - this.group.position.z);
    this.actor!.playOnce("interact");
    return true;
  }
  evidence() { return this.actor ? { id: this.definition.id, ...this.actor.evidence() } : null; }
  dispose(): void { this.retired = true; this.actor?.dispose(); this.actor = null; this.group.removeFromParent(); }
}
