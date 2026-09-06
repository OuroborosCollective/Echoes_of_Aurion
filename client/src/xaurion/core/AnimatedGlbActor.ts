import * as THREE from "three";

export type GlbPose = "idle" | "walk" | "run" | "attack" | "jump" | "death" | "interact";
const clipNames: Record<GlbPose, readonly string[]> = {
  idle: ["idle", "standingidle", "standidle", "breathingidle", "breathidle"],
  walk: ["walk", "walking", "walkforward", "locomotionwalk", "run"],
  run: ["run", "running", "sprint", "runforward", "walk"],
  attack: ["attackcombo", "meleeattack", "attack", "slash", "swing", "strike", "fight"],
  jump: ["jump", "jumping"],
  death: ["death", "die", "dying"],
  interact: ["shopinteract", "interact", "interaction", "use"],
};

export const GLB_RUN_THRESHOLD_METERS_PER_SECOND = 2.4;
const LOCOMOTION_BLEND_SECONDS = 0.055;
const ONESHOT_BLEND_SECONDS = 0.035;
const targetClipSeconds: Partial<Record<GlbPose, number>> = { walk: 0.82, run: 0.52, attack: 0.62, jump: 0.8, interact: 0.85 };
const normalizeClipName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Presentation only: imported transforms/rig are preserved inside a metre-sized,
 * foot-anchored wrapper. Animation never changes authoritative world coordinates.
 */
export class AnimatedGlbActor {
  readonly group = new THREE.Group();
  readonly heightMeters: number;
  private readonly mixer: THREE.AnimationMixer;
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private readonly bones: THREE.Bone[] = [];
  private readonly bonesByName = new Map<string, THREE.Bone>();
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
    model.traverse(node => {
      if (!(node as THREE.Bone).isBone) return;
      const bone = node as THREE.Bone;
      this.bones.push(bone);
      if (bone.name) this.bonesByName.set(bone.name, bone);
    });
    for (const clip of animations) {
      const normalized = normalizeClipName(clip.name);
      if (normalized && !this.clips.has(normalized)) this.clips.set(normalized, clip);
    }
    this.mixer = new THREE.AnimationMixer(model);
    this.mixer.addEventListener("finished", this.finished);
    this.play("idle", false);
    this.mixer.update(0);
    this.relaxIdleArms();
  }

  private finished = (event: { action: THREE.AnimationAction }) => {
    if (event.action !== this.active || normalizeClipName(this.active.getClip().name).includes("death")) return;
    this.oneShot = false;
    this.play(this.locomotion, false);
  };

  private resolveClip(pose: GlbPose): THREE.AnimationClip | undefined {
    const aliases = clipNames[pose];
    for (const alias of aliases) {
      const exact = this.clips.get(alias);
      if (exact) return exact;
    }
    const entries = [...this.clips.entries()].sort(([left], [right]) => left.localeCompare(right));
    for (const alias of aliases) {
      const contained = entries.find(([name]) => name.includes(alias) || alias.includes(name));
      if (contained) return contained[1];
    }
    return undefined;
  }

  supportsPose(pose: GlbPose): boolean { return Boolean(this.resolveClip(pose)); }

  private playbackRate(pose: GlbPose, clip: THREE.AnimationClip): number {
    const target = targetClipSeconds[pose];
    if (!target || !Number.isFinite(clip.duration) || clip.duration <= 0) return 1;
    return THREE.MathUtils.clamp(clip.duration / target, 1, 3.25);
  }

  private play(pose: GlbPose, once: boolean): boolean {
    const clip = this.resolveClip(pose) ?? (once ? undefined : this.resolveClip("idle"));
    if (!clip) return false;
    const next = this.mixer.clipAction(clip);
    if (next === this.active && !once) return true;
    const previous = this.active;
    next.reset().setEffectiveTimeScale(this.playbackRate(pose, clip)).setEffectiveWeight(1);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (previous && previous !== next) previous.crossFadeTo(next, once ? ONESHOT_BLEND_SECONDS : LOCOMOTION_BLEND_SECONDS, false);
    this.active = next;
    return true;
  }

  setLocomotion(speedMetersPerSecond: number): void {
    this.locomotion = speedMetersPerSecond >= GLB_RUN_THRESHOLD_METERS_PER_SECOND ? "run" : speedMetersPerSecond > 0.05 ? "walk" : "idle";
    if (!this.oneShot) this.play(this.locomotion, false);
  }

  playOnce(pose: "attack" | "jump" | "death" | "interact"): boolean {
    if (this.disposed) return false;
    this.oneShot = this.play(pose, true);
    return this.oneShot;
  }

  /** Presentation-only correction for imported idle clips whose shoulder keyframes are still near bind pose. */
  private relaxIdleArms(): void {
    if (this.oneShot || this.locomotion !== "idle" || !this.supportsPose("idle")) return;
    const localAxis = new THREE.Vector3(0, 1, 0);
    for (const [name, side] of [["UpperArm_L", 1], ["UpperArm_R", -1]] as const) {
      const bone = this.bonesByName.get(name);
      if (!bone) continue;
      bone.updateWorldMatrix(true, false);
      const worldRotation = bone.getWorldQuaternion(new THREE.Quaternion());
      const direction = localAxis.clone().applyQuaternion(worldRotation).normalize();
      if (direction.y <= -0.82) continue;
      const target = new THREE.Vector3(side * 0.12, -0.985, 0.08).normalize();
      const correction = new THREE.Quaternion().setFromUnitVectors(direction, target);
      const correctedWorld = correction.multiply(worldRotation);
      const parentWorld = bone.parent?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
      const correctedLocal = parentWorld.invert().multiply(correctedWorld);
      bone.quaternion.slerp(correctedLocal, 0.72);
    }
    this.group.updateMatrixWorld(true);
  }

  update(delta: number): void {
    if (this.disposed || !Number.isFinite(delta) || delta <= 0) return;
    this.mixer.update(Math.min(delta, 0.25));
    this.relaxIdleArms();
    this.group.rotation.z = 0;
    if (this.active && !normalizeClipName(this.active.getClip().name).includes("jump")) {
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
    const measured = new THREE.Box3().setFromObject(this.model, true);
    let pose = 2166136261;
    for (const bone of this.bones) for (const value of [...bone.quaternion.toArray(), ...bone.position.toArray()]) pose = Math.imul(pose ^ Math.round(value * 100_000), 16777619) >>> 0;
    return { heightMeters: this.heightMeters, renderedHeightMeters: measured.max.y - measured.min.y, feetY: measured.min.y,
      clip: this.active?.getClip().name ?? null, clipTime: this.active?.time ?? 0, boneCount: this.bones.length, bonePose: pose.toString(16),
      supportedPoses: (Object.keys(clipNames) as GlbPose[]).filter(candidate => this.supportsPose(candidate)),
      animationNames: [...this.clips.values()].map(clip => clip.name).sort(),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.removeEventListener("finished", this.finished);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    this.group.removeFromParent();
  }
}
