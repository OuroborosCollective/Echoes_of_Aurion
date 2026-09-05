import * as THREE from "three";

export type GlbPose = "idle" | "walk" | "run" | "attack" | "jump" | "death" | "interact";
const clipNames: Record<GlbPose, readonly string[]> = {
  idle: ["idle"], walk: ["walk", "run"], run: ["run", "walk"],
  attack: ["attackcombo", "attack", "fight"], jump: ["jump"],
  death: ["death"], interact: ["shopinteract", "interact"],
};

/** Presentation only: imported transforms/rig are preserved inside a metre-sized,
 * foot-anchored wrapper. Animation never changes authoritative world coordinates.
 */
export class AnimatedGlbActor {
  readonly group = new THREE.Group();
  readonly heightMeters: number;
  private readonly mixer: THREE.AnimationMixer;
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private readonly bones: THREE.Bone[] = [];
  private active: THREE.AnimationAction | null = null;
  private locomotion: GlbPose = "idle";
  private oneShot = false;
  private disposed = false;
  private readonly footPivot = new THREE.Group();
  private readonly bounds = new THREE.Box3();
  private readonly worldOrigin = new THREE.Vector3();
  private readonly worldScale = new THREE.Vector3();

  constructor(private readonly model: THREE.Group, animations: readonly THREE.AnimationClip[], heightMeters = 2) {
    if (!Number.isFinite(heightMeters) || heightMeters < 0.25 || heightMeters > 10) throw new Error("GLB_ACTOR_HEIGHT_INVALID");
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model, true);
    const height = bounds.max.y - bounds.min.y;
    if (!Number.isFinite(height) || height < 0.0001 || bounds.isEmpty()) throw new Error("GLB_ACTOR_BOUNDS_INVALID");
    const center = bounds.getCenter(new THREE.Vector3());
    const pivot = this.footPivot;
    pivot.position.set(-center.x, -bounds.min.y, -center.z);
    pivot.add(model);
    this.group.name = "aurion-glb-actor";
    this.group.scale.setScalar(heightMeters / height);
    this.group.add(pivot);
    this.heightMeters = heightMeters;
    model.traverse(node => { if ((node as THREE.Bone).isBone) this.bones.push(node as THREE.Bone); });
    for (const clip of animations) this.clips.set(clip.name.toLowerCase().replace(/[^a-z0-9]/g, ""), clip);
    this.mixer = new THREE.AnimationMixer(model);
    this.mixer.addEventListener("finished", this.finished);
    this.play("idle", false);
    this.mixer.update(0);
  }

  private finished = (event: { action: THREE.AnimationAction }) => {
    if (event.action !== this.active || this.active.getClip().name.toLowerCase() === "death") return;
    this.oneShot = false;
    this.play(this.locomotion, false);
  };

  private play(pose: GlbPose, once: boolean): boolean {
    const clip = clipNames[pose].map(name => this.clips.get(name)).find(Boolean) ?? this.clips.get("idle");
    if (!clip) return false;
    const next = this.mixer.clipAction(clip);
    if (next === this.active && !once) return true;
    const previous = this.active;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (previous && previous !== next) previous.crossFadeTo(next, 0.15, false);
    this.active = next;
    return true;
  }

  setLocomotion(speedMetersPerSecond: number): void {
    this.locomotion = speedMetersPerSecond > 4.5 ? "run" : speedMetersPerSecond > 0.05 ? "walk" : "idle";
    if (!this.oneShot) this.play(this.locomotion, false);
  }

  playOnce(pose: "attack" | "jump" | "death" | "interact"): void {
    if (this.disposed) return;
    this.oneShot = this.play(pose, true);
  }

  update(delta: number): void {
    if (this.disposed || !Number.isFinite(delta) || delta <= 0) return;
    this.mixer.update(Math.min(delta, 0.25));
    // In-place locomotion keeps the lowest animated contact on the sampled
    // ground. The authored Jump may leave it; root motion never moves the actor.
    if (this.active?.getClip().name.toLowerCase() !== "jump") {
      this.group.parent?.updateWorldMatrix(true, false);
      this.group.updateMatrixWorld(true);
      this.bounds.setFromObject(this.model, true);
      this.group.getWorldPosition(this.worldOrigin);
      this.group.getWorldScale(this.worldScale);
      this.footPivot.position.y -= (this.bounds.min.y - this.worldOrigin.y) / this.worldScale.y;
      this.group.updateMatrixWorld(true);
    }
  }

  evidence() {
    // Read actual mixer/bone state; this is not a simulated success flag.
    const measured = new THREE.Box3().setFromObject(this.model, true);
    let pose = 2166136261;
    for (const bone of this.bones) for (const value of [...bone.quaternion.toArray(), ...bone.position.toArray()]) {
      pose = Math.imul(pose ^ Math.round(value * 100_000), 16777619) >>> 0;
    }
    return { heightMeters: this.heightMeters, renderedHeightMeters: measured.max.y - measured.min.y,
      feetY: measured.min.y, clip: this.active?.getClip().name ?? null,
      clipTime: this.active?.time ?? 0, boneCount: this.bones.length, bonePose: pose.toString(16) };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.removeEventListener("finished", this.finished);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.group.removeFromParent();
    // Cached GLB geometry/textures are shared; retiring an actor must not dispose them.
  }
}
