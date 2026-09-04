import * as THREE from "three";
import type { MMOEngine } from "../core/MMOEngine";

export type AurionWorldContext = Readonly<{ epoch: number; worldSeed: string }>;

type WorldCoreMetrics = Readonly<{
  fixedTick: number;
  tickRate: number;
  weatherPhase: WeatherType;
  drawCalls: number;
  triangles: number;
  vegetationInstances: number;
  lod: Readonly<{ high: number; medium: number; low: number; culled: number }>;
  occlusion: Readonly<{ tested: number; occluded: number }>;
}>;

let latestWorldContext: AurionWorldContext = Object.freeze({ epoch: 0, worldSeed: "echoes-of-aurion-global" });

if (typeof window !== "undefined") {
  window.addEventListener("aurion:load-open-world", event => {
    const detail = (event as CustomEvent<{ globalWorld?: { epoch?: unknown; worldSeed?: unknown } }>).detail;
    const epoch = detail?.globalWorld?.epoch;
    const worldSeed = detail?.globalWorld?.worldSeed;
    if (Number.isSafeInteger(epoch) && typeof worldSeed === "string" && worldSeed.trim()) {
      latestWorldContext = Object.freeze({ epoch: epoch as number, worldSeed: worldSeed.trim() });
    }
  });
}

/** -ax1 FixedTimestepLoop adapted to the normative WASD 10 Hz logical tick. */
export class FixedTimestepLoop {
  public readonly targetTickRate: number;
  public readonly fixedDelta: number;
  private accumulator = 0;
  private currentTick = 0;
  public onTick?: (tick: number, fixedDelta: number) => void;

  constructor(targetTickRate = 10) {
    this.targetTickRate = targetTickRate;
    this.fixedDelta = 1 / targetTickRate;
  }

  advance(renderDelta: number): number {
    this.accumulator += Math.min(Math.max(renderDelta, 0), 0.25);
    while (this.accumulator >= this.fixedDelta) {
      this.currentTick += 1;
      this.onTick?.(this.currentTick, this.fixedDelta);
      this.accumulator -= this.fixedDelta;
    }
    return Math.max(0, Math.min(1, this.accumulator / this.fixedDelta));
  }

  get tick(): number { return this.currentTick; }
}

/** Mulberry32 generator carried from -ax1; seed ownership comes from Aurion world context. */
export class DeterministicPRNG {
  constructor(private seed: number) { this.seed >>>= 0; }
  nextFloat(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  nextInt(min: number, max: number): number { return Math.floor(this.nextFloat() * (max - min + 1)) + min; }
}

function seed32(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** TerrainBarycentric uses the already-authoritative Aurion/xaurion landscape height function. */
export class TerrainBarycentric {
  constructor(private readonly getHeightAt: (x: number, z: number) => number) {}
  getHeight(x: number, z: number): number { return this.getHeightAt(x, z); }
  getNormal(x: number, z: number, eps = 0.2): THREE.Vector3 {
    const hL = this.getHeight(x - eps, z);
    const hR = this.getHeight(x + eps, z);
    const hD = this.getHeight(x, z - eps);
    const hU = this.getHeight(x, z + eps);
    return new THREE.Vector3(-(hR - hL) / (2 * eps), 1, -(hU - hD) / (2 * eps)).normalize();
  }
}

export type WeatherType = "clear_radiance" | "leyline_tempest" | "aether_rain" | "astral_eclipse";
type WeatherState = Readonly<{ type: WeatherType; color: number; fogColor: number; fogDensity: number; intensity: number }>;

/**
 * -ax1 GlobalWeatherEngine adapted so weather derives from Aurion epoch + logical tick,
 * never browser Date.now(). Gameplay effects remain server-owned; this class projects atmosphere only.
 */
export class GlobalWeatherEngine {
  private readonly phases: readonly WeatherState[] = [
    { type: "clear_radiance", color: 0xfff7ed, fogColor: 0xd4d4d8, fogDensity: 0.003, intensity: 0.3 },
    { type: "leyline_tempest", color: 0x06b6d4, fogColor: 0x083344, fogDensity: 0.007, intensity: 0.42 },
    { type: "aether_rain", color: 0x10b981, fogColor: 0x064e3b, fogDensity: 0.009, intensity: 0.28 },
    { type: "astral_eclipse", color: 0x7c3aed, fogColor: 0x1e1b4b, fogDensity: 0.012, intensity: 0.22 },
  ];
  readonly phaseDurationTicks = 3000; // 5 minutes at normative 10 Hz.

  state(epoch: number, logicalTick: number): WeatherState {
    const phaseIndex = Math.floor((epoch + logicalTick) / this.phaseDurationTicks) % this.phases.length;
    return this.phases[(phaseIndex + this.phases.length) % this.phases.length]!;
  }

  apply(scene: THREE.Scene, ambient: THREE.AmbientLight, epoch: number, logicalTick: number): WeatherState {
    const state = this.state(epoch, logicalTick);
    ambient.color.setHex(state.color);
    ambient.intensity = state.intensity;
    if (scene.fog instanceof THREE.FogExp2) {
      scene.fog.color.setHex(state.fogColor);
      scene.fog.density = state.fogDensity;
    }
    return state;
  }
}

export enum LODTier { HIGH = 0, MEDIUM = 1, LOW = 2, CULLED = 3 }
type LODTarget = { group: THREE.Object3D; tier: LODTier };

export class LODManager {
  private readonly targets = new Map<string, LODTarget>();
  private readonly frustum = new THREE.Frustum();
  private readonly projection = new THREE.Matrix4();
  readonly stats = { high: 0, medium: 0, low: 0, culled: 0 };

  register(id: string, group: THREE.Object3D): void { this.targets.set(id, { group, tier: LODTier.HIGH }); }
  clear(): void { this.targets.clear(); }

  update(camera: THREE.Camera): void {
    camera.updateMatrixWorld();
    this.projection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projection);
    this.stats.high = this.stats.medium = this.stats.low = this.stats.culled = 0;
    for (const target of this.targets.values()) {
      const position = new THREE.Vector3();
      target.group.getWorldPosition(position);
      const distance = position.distanceTo(camera.position);
      const inFrustum = this.frustum.intersectsSphere(new THREE.Sphere(position, 6));
      target.tier = !inFrustum && distance > 35 ? LODTier.CULLED : distance < 25 ? LODTier.HIGH : distance < 58 ? LODTier.MEDIUM : LODTier.LOW;
      target.group.visible = target.tier !== LODTier.CULLED;
      if (target.tier === LODTier.HIGH) this.stats.high += 1;
      else if (target.tier === LODTier.MEDIUM) this.stats.medium += 1;
      else if (target.tier === LODTier.LOW) this.stats.low += 1;
      else this.stats.culled += 1;
    }
  }
}

type BoxOccluder = { min: THREE.Vector3; max: THREE.Vector3 };
export class OcclusionCullingSystem {
  private readonly occluders: BoxOccluder[] = [
    { min: new THREE.Vector3(-14, 0, -22), max: new THREE.Vector3(14, 12, -18) },
    { min: new THREE.Vector3(-55, 0, -10), max: new THREE.Vector3(-45, 16, 10) },
    { min: new THREE.Vector3(45, 0, -45), max: new THREE.Vector3(55, 20, -35) },
  ];
  readonly stats = { tested: 0, occluded: 0 };

  isOccluded(camera: THREE.Vector3, target: THREE.Vector3): boolean {
    this.stats.tested += 1;
    const delta = target.clone().sub(camera);
    const targetDistance = delta.length();
    if (targetDistance < 4) return false;
    const ray = new THREE.Ray(camera, delta.normalize());
    for (const occluder of this.occluders) {
      const box = new THREE.Box3(occluder.min, occluder.max);
      const hit = ray.intersectBox(box, new THREE.Vector3());
      if (hit && hit.distanceTo(camera) < targetDistance - 1) {
        this.stats.occluded += 1;
        return true;
      }
    }
    return false;
  }
}

/** GPU-instanced vegetation adapted from -ax1 but grounded on Aurion's existing terrain. */
export class InstancedVegetationSystem {
  readonly group = new THREE.Group();
  readonly instanceCount: number;
  private readonly meshes: THREE.InstancedMesh[] = [];

  constructor(scene: THREE.Scene, terrain: TerrainBarycentric, rng: DeterministicPRNG) {
    this.group.name = "aurion-ax1-instanced-vegetation";
    scene.add(this.group);
    const treeCount = 56;
    const grassCount = 112;
    const runeCount = 16;
    this.instanceCount = treeCount * 2 + grassCount + runeCount;
    const dummy = new THREE.Object3D();

    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.48, 2.8, 6), new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.9 }), treeCount);
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1.9, 4.2, 6), new THREE.MeshStandardMaterial({ color: 0x1b4332, roughness: 0.85, flatShading: true }), treeCount);
    for (let index = 0; index < treeCount; index += 1) {
      const angle = (index / treeCount) * Math.PI * 13 + rng.nextFloat() * 0.2;
      const radius = 28 + rng.nextFloat() * 50;
      const x = 28 + Math.cos(angle) * radius;
      const z = -34 + Math.sin(angle) * radius;
      const y = terrain.getHeight(x, z);
      const scale = 0.8 + rng.nextFloat() * 0.45;
      dummy.position.set(x, y + 1.4 * scale, z); dummy.scale.setScalar(scale); dummy.rotation.set(0, rng.nextFloat() * Math.PI * 2, 0); dummy.updateMatrix(); trunks.setMatrixAt(index, dummy.matrix);
      dummy.position.set(x, y + 3.45 * scale, z); dummy.updateMatrix(); crowns.setMatrixAt(index, dummy.matrix);
    }
    trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;

    const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.34, 0.65, 4), new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.9 }), grassCount);
    for (let index = 0; index < grassCount; index += 1) {
      const angle = rng.nextFloat() * Math.PI * 2;
      const radius = 20 + rng.nextFloat() * 70;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const y = terrain.getHeight(x, z);
      const scale = 0.65 + rng.nextFloat() * 0.5;
      dummy.position.set(x, y + 0.32 * scale, z); dummy.scale.setScalar(scale); dummy.rotation.set(0, rng.nextFloat() * Math.PI * 2, 0); dummy.updateMatrix(); grass.setMatrixAt(index, dummy.matrix);
    }
    grass.instanceMatrix.needsUpdate = true;

    const runes = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.48, 0.62, 3.6, 8), new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.72, roughness: 0.38 }), runeCount);
    for (let index = 0; index < runeCount; index += 1) {
      const angle = (index / runeCount) * Math.PI * 2;
      const x = Math.cos(angle) * 26;
      const z = Math.sin(angle) * 26;
      dummy.position.set(x, terrain.getHeight(x, z) + 1.8, z); dummy.scale.setScalar(1); dummy.rotation.set(0, angle, 0); dummy.updateMatrix(); runes.setMatrixAt(index, dummy.matrix);
    }
    runes.instanceMatrix.needsUpdate = true;

    this.meshes.push(trunks, crowns, grass, runes);
    this.group.add(...this.meshes);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    for (const mesh of this.meshes) {
      mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) mesh.material.forEach(material => material.dispose()); else mesh.material.dispose();
    }
  }
}

/**
 * One migration-owned world-core. It does not mutate player/gameplay truth.
 * It runs fixed deterministic projection ticks while MMOEngine keeps rendering at device rate.
 */
export class AurionWorldCore {
  private readonly loop = new FixedTimestepLoop(10);
  private readonly weather = new GlobalWeatherEngine();
  private readonly lod = new LODManager();
  private readonly occlusion = new OcclusionCullingSystem();
  private readonly ambient = new THREE.AmbientLight(0xfff7ed, 0.3);
  private readonly vegetation: InstancedVegetationSystem;
  private animationFrame = 0;
  private lastFrame = 0;
  private weatherPhase: WeatherType = "clear_radiance";

  constructor(private readonly engine: MMOEngine, private readonly context: AurionWorldContext) {
    const terrain = new TerrainBarycentric((x, z) => engine.landscape.chunkManager.getElevationAt(x, z));
    const rng = new DeterministicPRNG(seed32(`${context.worldSeed}:${context.epoch}`));
    this.vegetation = new InstancedVegetationSystem(engine.scene, terrain, rng);
    engine.scene.add(this.ambient);
    this.lod.register("instanced-vegetation", this.vegetation.group);
    this.loop.onTick = tick => this.fixedTick(tick);
  }

  start(): void {
    if (this.animationFrame) return;
    this.lastFrame = performance.now();
    const frame = (now: number) => {
      const delta = Math.max(0, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.loop.advance(delta);
      this.lod.update(this.engine.camera);
      this.animationFrame = requestAnimationFrame(frame);
    };
    this.animationFrame = requestAnimationFrame(frame);
  }

  private fixedTick(tick: number): void {
    const state = this.weather.apply(this.engine.scene, this.ambient, this.context.epoch, tick);
    this.weatherPhase = state.type;
    const vegetationPosition = new THREE.Vector3();
    this.vegetation.group.getWorldPosition(vegetationPosition);
    this.vegetation.group.visible = !this.occlusion.isOccluded(this.engine.camera.position, vegetationPosition);
    if (tick % 10 === 0 && typeof window !== "undefined") {
      const metrics: WorldCoreMetrics = Object.freeze({
        fixedTick: tick,
        tickRate: this.loop.targetTickRate,
        weatherPhase: this.weatherPhase,
        drawCalls: this.engine.renderer.info.render.calls,
        triangles: this.engine.renderer.info.render.triangles,
        vegetationInstances: this.vegetation.instanceCount,
        lod: Object.freeze({ ...this.lod.stats }),
        occlusion: Object.freeze({ tested: this.occlusion.stats.tested, occluded: this.occlusion.stats.occluded }),
      });
      window.dispatchEvent(new CustomEvent("aurion:xaurion-world-core-metrics", { detail: metrics }));
    }
  }

  stop(): void {
    if (this.animationFrame) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.lod.clear();
    this.vegetation.dispose(this.engine.scene);
    this.engine.scene.remove(this.ambient);
    this.ambient.dispose();
  }
}

export function attachAurionWorldCore(engine: MMOEngine): AurionWorldCore {
  const core = new AurionWorldCore(engine, latestWorldContext);
  core.start();
  return core;
}
