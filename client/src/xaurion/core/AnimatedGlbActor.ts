import { releaseGlbTree } from "./GlbModelLease";
import * as THREE from "three";
import type { GlbEquipmentSlot } from "@shared/glbImportContract";
import { equipmentAnchorAliases, equipmentLocalScale } from "./EquipmentAttachmentSizing";

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
const normalizeNodeName = normalizeClipName;

/** A named clip is not animation evidence unless at least one keyframe track changes. */
export function animationClipHasMotion(clip: THREE.AnimationClip, epsilon = 1e-5): boolean {
  if (!Number.isFinite(clip.duration) || clip.duration <= 0 || clip.tracks.length === 0) return false;
  for (const track of clip.tracks) {
    const stride = track.getValueSize();
    if (!Number.isInteger(stride) || stride < 1 || track.times.length < 2 || track.values.length < stride * 2) continue;
    for (let offset = stride; offset + stride <= track.values.length; offset += stride) {
      for (let component = 0; component < stride; component++) {
        const first = Number(track.values[component]);
        const current = Number(track.values[offset + component]);
        if (Number.isFinite(first) && Number.isFinite(current) && Math.abs(current - first) > epsilon) return true;
      }
    }
  }
  return false;
}

/** Presentation only: imported transforms/rig are preserved inside a metre-sized,
 * foot-anchored wrapper. Animation and attached visuals never change authoritative
 * world coordinates, equipment ownership or item stats.
 */
export class AnimatedGlbActor {
  readonly group = new THREE.Group();
  readonly heightMeters: number;
  private readonly mixer: THREE.AnimationMixer;
  private readonly clips = new Map<string, THREE.AnimationClip>();
  private readonly animatedClips = new Set<string>();
  private readonly bones: THREE.Bone[] = [];
  private readonly bonesByName = new Map<string, THREE.Bone>();
  private readonly nodesByName = new Map<string, THREE.Object3D>();
  private readonly attachments = new Map<GlbEquipmentSlot, THREE.Group>();
  private readonly restBoneQuaternions = new Map<THREE.Bone, THREE.Quaternion>();
  private active: THREE.AnimationAction | null = null;
  private fading: THREE.AnimationAction | null = null;
  private fadeRemaining = 0;
  private locomotion: GlbPose = "idle";
  private oneShot = false;
  private disposed = false;
  private fallbackClock = 0;
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
      if (node.name) {
        const normalized = normalizeNodeName(node.name);
        if (normalized && !this.nodesByName.has(normalized)) this.nodesByName.set(normalized, node);
      }
      if (!(node as THREE.Bone).isBone) return;
      const bone = node as THREE.Bone;
      this.bones.push(bone);
      this.restBoneQuaternions.set(bone, bone.quaternion.clone());
      const normalized = normalizeNodeName(bone.name);
      if (normalized && !this.bonesByName.has(normalized)) this.bonesByName.set(normalized, bone);
    });
    for (const clip of animations) {
      const normalized = normalizeClipName(clip.name);
      if (!normalized || this.clips.has(normalized)) continue;
      this.clips.set(normalized, clip);
      if (animationClipHasMotion(clip)) this.animatedClips.add(normalized);
    }
    this.mixer = new THREE.AnimationMixer(model);
    this.mixer.addEventListener("finished", this.finished);
    this.play("idle", false);
    this.mixer.update(0);
    this.relaxArmsTowardNaturalPose(true);
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
  hasAnimatedPose(pose: GlbPose): boolean {
    const clip = this.resolveClip(pose);
    return Boolean(clip && this.animatedClips.has(normalizeClipName(clip.name)));
  }

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
    this.fading?.stop();
    this.fading = null;
    next.reset().setEffectiveTimeScale(this.playbackRate(pose, clip)).setEffectiveWeight(1);
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
    next.clampWhenFinished = once;
    next.play();
    if (previous && previous !== next) {
      this.fadeRemaining = once ? ONESHOT_BLEND_SECONDS : LOCOMOTION_BLEND_SECONDS;
      previous.crossFadeTo(next, this.fadeRemaining, false);
      this.fading = previous;
    }
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

  private attachmentAnchor(slot: GlbEquipmentSlot): THREE.Object3D | null {
    for (const alias of equipmentAnchorAliases[slot]) {
      const node = this.nodesByName.get(alias);
      if (node) return node;
    }
    return null;
  }

  detachEquipment(slot: GlbEquipmentSlot): void {
    const previous = this.attachments.get(slot);
    if (!previous) return;
    releaseGlbTree(previous);
    previous.removeFromParent();
    this.attachments.delete(slot);
  }

  /** Attach a visual clone to a known rig node. This is deliberately not an equip mutation. */
  attachEquipment(slot: GlbEquipmentSlot, visual: THREE.Group): boolean {
    if (this.disposed) return false;
    const anchor = this.attachmentAnchor(slot);
    if (!anchor) return false;
    visual.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(visual, true);
    if (bounds.isEmpty()) return false;
    const size = bounds.getSize(new THREE.Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z);
    if (!Number.isFinite(maxDimension) || maxDimension <= 0.0001) return false;

    this.group.updateMatrixWorld(true);
    anchor.updateWorldMatrix(true, false);
    const anchorScale = anchor.getWorldScale(new THREE.Vector3());
    const anchorWorldScale = Math.max(Math.abs(anchorScale.x), Math.abs(anchorScale.y), Math.abs(anchorScale.z));
    const scale = equipmentLocalScale(slot, maxDimension, this.heightMeters, anchorWorldScale);
    if (scale === null) return false;

    this.detachEquipment(slot);
    const holder = new THREE.Group();
    holder.name = `aurion-confirmed-equipment:${slot}`;
    holder.userData.confirmedEquipmentSlot = slot;
    const center = bounds.getCenter(new THREE.Vector3());
    visual.scale.setScalar(scale);
    visual.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    visual.traverse(node => {
      if (!(node as THREE.Mesh).isMesh) return;
      const mesh = node as THREE.Mesh;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
    });
    holder.add(visual);
    anchor.add(holder);
    this.attachments.set(slot, holder);
    return true;
  }

  private findBone(...aliases: string[]): THREE.Bone | null {
    for (const alias of aliases) {
      const bone = this.bonesByName.get(normalizeNodeName(alias));
      if (bone) return bone;
    }
    return null;
  }

  private restoreAndRotateX(bone: THREE.Bone | null, radians: number): void {
    if (!bone) return;
    const rest = this.restBoneQuaternions.get(bone);
    if (!rest) return;
    bone.quaternion.copy(rest).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), radians));
  }

  /** Presentation-only correction for imported clips whose shoulder keyframes remain near bind/T-pose. */
  private relaxArmsTowardNaturalPose(force = false): void {
    if (this.oneShot || (!force && this.locomotion !== "idle")) return;
    const localAxis = new THREE.Vector3(0, 1, 0);
    const aliases = [
      [["upperarml", "leftupperarm", "mixamorigleftarm", "ccbaselupperarm"], 1],
      [["upperarmr", "rightupperarm", "mixamorigrightarm", "ccbaserupperarm"], -1],
    ] as const;
    for (const [names, side] of aliases) {
      const bone = this.findBone(...names);
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
      bone.quaternion.slerp(correctedLocal, 0.82);
    }
    this.group.updateMatrixWorld(true);
  }

  /**
   * AX1 visual fallback for rigs that advertise Idle/Walk/Run clips whose tracks
   * are actually static. It consumes only confirmed locomotion speed + render
   * delta and cannot alter gameplay state or server coordinates.
   */
  private applyStaticLocomotionFallback(delta: number): void {
    if (this.oneShot || this.hasAnimatedPose(this.locomotion)) return;
    this.fallbackClock += delta;
    if (this.locomotion === "idle") {
      this.relaxArmsTowardNaturalPose(true);
      return;
    }

    const running = this.locomotion === "run";
    const phase = Math.sin(this.fallbackClock * (running ? 9.5 : 6.2));
    const opposite = -phase;
    const legAmount = running ? 0.68 : 0.44;
    const kneeAmount = running ? 0.48 : 0.28;
    const armAmount = running ? 0.42 : 0.26;

    this.restoreAndRotateX(this.findBone("thighl", "leftupleg", "upperlegl", "mixamorigleftupleg", "ccbaselthigh"), phase * legAmount);
    this.restoreAndRotateX(this.findBone("thighr", "rightupleg", "upperlegr", "mixamorigrightupleg", "ccbaserthigh"), opposite * legAmount);
    this.restoreAndRotateX(this.findBone("shinl", "leftleg", "lowerlegl", "mixamorigleftleg", "ccbaselcalf"), Math.max(0, -phase) * kneeAmount);
    this.restoreAndRotateX(this.findBone("shinr", "rightleg", "lowerlegr", "mixamorigrightleg", "ccbasercalf"), Math.max(0, phase) * kneeAmount);

    this.relaxArmsTowardNaturalPose(true);
    const leftArm = this.findBone("upperarml", "leftupperarm", "mixamorigleftarm", "ccbaselupperarm");
    const rightArm = this.findBone("upperarmr", "rightupperarm", "mixamorigrightarm", "ccbaserupperarm");
    leftArm?.rotateX(opposite * armAmount);
    rightArm?.rotateX(phase * armAmount);
    this.group.updateMatrixWorld(true);
  }

  update(delta: number): void {
    if (this.disposed || !Number.isFinite(delta) || delta <= 0) return;
    const step = Math.min(delta, 0.25);
    this.mixer.update(step);
    this.fadeRemaining -= step;
    if (this.fading && this.fadeRemaining <= 0) { this.fading.stop(); this.fading = null; }
    if (this.locomotion === "idle") this.relaxArmsTowardNaturalPose();
    this.applyStaticLocomotionFallback(step);
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
    const supportedPoses = (Object.keys(clipNames) as GlbPose[]).filter(candidate => this.supportsPose(candidate));
    const animatedPoses = supportedPoses.filter(candidate => this.hasAnimatedPose(candidate));
    return { heightMeters: this.heightMeters, renderedHeightMeters: measured.max.y - measured.min.y, feetY: measured.min.y,
      activeAnimationActions: Number(Boolean(this.active)) + Number(Boolean(this.fading)),
      clip: this.active?.getClip().name ?? null, clipTime: this.active?.time ?? 0, boneCount: this.bones.length, bonePose: pose.toString(16),
      supportedPoses,
      animatedPoses,
      fallbackPoses: supportedPoses.filter(candidate => !animatedPoses.includes(candidate) && (candidate === "idle" || candidate === "walk" || candidate === "run")),
      animationNames: [...this.clips.values()].map(clip => clip.name).sort(),
      equipmentSlots: [...this.attachments.keys()].sort(),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of [...this.attachments.keys()]) this.detachEquipment(slot);
    this.mixer.removeEventListener("finished", this.finished);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model);
    releaseGlbTree(this.model);
    this.group.removeFromParent();
  }
}
