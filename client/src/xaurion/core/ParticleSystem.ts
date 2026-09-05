import { DeterministicSimulation, seededRandom } from "@shared/deterministicSimulation";
import * as THREE from 'three';

export interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  acceleration: THREE.Vector3;
  color: THREE.Color;
  size: number;
  initialSize: number;
  alpha: number;
  initialAlpha: number;
  life: number;
  maxLife: number;
  rotation: number;
  rotSpeed: number;
}

export type ParticleEffectType =
  | 'combat_hit'
  | 'combat_crit'
  | 'slash_cleave'
  | 'magic_impact'
  | 'level_up'
  | 'beacon_activate'
  | 'steam_vent'
  | 'smoke'
  | 'explosion'
  | 'heal_sparkle'
  | 'blood_oil'
  | 'teleport_warp'
  | 'aurion_blast'
  | 'holy_nova'
  | 'electric_spark'
  | 'frost_shatter'
  | 'fire_impact'
  | 'physical_hit';

export class ParticleSystem {
  public scene: THREE.Scene;
  private readonly maxParticles: number;
  private readonly pool: Particle[] = [];
  private disposed = false;
  private droppedBursts = 0;
  private reusedParticles = 0;
  private eventRandom: (() => number) | null = null;
  private random() { return this.eventRandom ? this.eventRandom() : this.simulation.random('ax1-vfx:ambient'); }
  private particles: Particle[] = [];
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;
  private texture: THREE.Texture;
  private points: THREE.Points;

  // Buffer attributes
  private positions: Float32Array;
  private colors: Float32Array;
  private sizes: Float32Array;
  private alphas: Float32Array;

  // Beacon & environmental continuously emitting anchors
  private activeBeacons: { position: THREE.Vector3; color: THREE.Color; active: boolean; timer: number }[] = [];
  private steamVents: THREE.Vector3[] = [];

  constructor(scene: THREE.Scene, private readonly simulation: DeterministicSimulation, public readonly budgetTier: 'phone' | 'tablet' | 'desktop' = 'desktop') {
    if (!['phone', 'tablet', 'desktop'].includes(budgetTier)) throw new Error('PARTICLE_BUDGET_INVALID');
    this.maxParticles = { phone: 600, tablet: 1200, desktop: 2400 }[budgetTier];
    this.scene = scene;

    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);
    this.alphas = new Float32Array(this.maxParticles);

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.geometry.setDrawRange(0, 0);

    // Create radial soft particle texture programmatically
    this.texture = this.createParticleTexture();
    // Source effects use per-particle size/alpha, which PointsMaterial ignores.
    this.material = new THREE.ShaderMaterial({
      uniforms: { particleMap: { value: this.texture } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color;
        varying vec3 tint; varying float opacity;
        void main() { tint = color; opacity = alpha;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(size * 300.0 / max(0.1, -viewPosition.z), 1.0, 64.0);
          gl_Position = projectionMatrix * viewPosition; }`,
      fragmentShader: `uniform sampler2D particleMap; varying vec3 tint; varying float opacity;
        void main() { vec4 sprite = texture2D(particleMap, gl_PointCoord);
          gl_FragColor = vec4(tint, sprite.a * opacity); }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  private createParticleTexture(): THREE.Texture {
    const pixels = new Uint8Array(64 * 64 * 4);
    const stops = [[0, 1], [0.3, 0.8], [0.7, 0.25], [1, 0]];
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      const radius = Math.min(1, Math.hypot(x - 31.5, y - 31.5) / 30);
      const upper = Math.max(1, stops.findIndex(stop => radius <= stop[0]));
      const [a, b] = [stops[upper - 1], stops[upper]];
      const alpha = a[1] + (b[1] - a[1]) * (radius - a[0]) / (b[0] - a[0]);
      const offset = (y * 64 + x) * 4;
      pixels.set([255, 255, 255, Math.round(alpha * 255)], offset);
    }
    const texture = new THREE.DataTexture(pixels, 64, 64, THREE.RGBAFormat);
    texture.needsUpdate = true;
    return texture;
  }

  public get metrics() {
    return Object.freeze({ tier: this.budgetTier, budget: this.maxParticles, active: this.particles.length,
      pooled: this.pool.length, reused: this.reusedParticles, droppedBursts: this.droppedBursts, tickRate: 10 });
  }

  private enqueueParticle(value: Particle) {
    const reused = this.pool.pop();
    if (reused) {
      reused.position.copy(value.position); reused.velocity.copy(value.velocity);
      reused.acceleration.copy(value.acceleration); reused.color.copy(value.color);
      for (const key of ['size', 'initialSize', 'alpha', 'initialAlpha', 'life', 'maxLife', 'rotation', 'rotSpeed'] as const) reused[key] = value[key];
      this.reusedParticles++;
      this.particles.push(reused);
    } else this.particles.push(value);
  }

  public registerSteamVent(x: number, y: number, z: number) {
    if (this.disposed || ![x, y, z].every(Number.isFinite)) throw new Error('PARTICLE_ANCHOR_INVALID');
    if (this.steamVents.length >= 64) return;
    this.steamVents.push(new THREE.Vector3(x, y, z));
  }

  public registerBeacon(x: number, y: number, z: number, colorHex: string = '#00f2ff') {
    if (this.disposed || ![x, y, z].every(Number.isFinite)) throw new Error('PARTICLE_ANCHOR_INVALID');
    if (this.activeBeacons.length >= 64) return;
    this.activeBeacons.push({
      position: new THREE.Vector3(x, y, z),
      color: new THREE.Color(colorHex),
      active: true,
      timer: 0,
    });
  }

  /**
   * Spawn a custom particle burst or effect
   */
  public emit(
    type: ParticleEffectType,
    pos: THREE.Vector3 | { x: number; y: number; z: number },
    customColor?: string | number,
    countMultiplier: number = 1,
    receiptKey?: string
  ) {
    if (this.disposed) return;
    if (![pos.x, pos.y, pos.z, countMultiplier].every(Number.isFinite) || countMultiplier <= 0 || countMultiplier > 4) throw new Error('PARTICLE_EVENT_INVALID');
    if (this.particles.length >= this.maxParticles) { this.droppedBursts++; return; }
    const basePos = new THREE.Vector3(pos.x, pos.y, pos.z);
    const color = customColor !== undefined ? new THREE.Color(customColor) : new THREE.Color(0xffffff);

    const previousRandom = this.eventRandom;
    this.eventRandom = seededRandom(JSON.stringify([this.simulation.seed, 'ax1-particle-v2', receiptKey ?? this.simulation.nextId('particle-cue')]));
    try { switch (type) {
      case 'combat_hit':
        this.emitCombatHit(basePos, color, 18 * countMultiplier);
        break;
      case 'combat_crit':
        this.emitCombatCrit(basePos, color, 38 * countMultiplier);
        break;
      case 'slash_cleave':
        this.emitSlashArc(basePos, color, 30 * countMultiplier);
        break;
      case 'magic_impact':
        this.emitMagicImpact(basePos, color, 32 * countMultiplier);
        break;
      case 'level_up':
        this.emitLevelUpFlare(basePos, 90 * countMultiplier);
        break;
      case 'beacon_activate':
        this.emitBeaconBurst(basePos, color, 80 * countMultiplier);
        break;
      case 'steam_vent':
        this.emitSteamPuff(basePos, 12 * countMultiplier);
        break;
      case 'smoke':
        this.emitSmokePuff(basePos, 14 * countMultiplier);
        break;
      case 'explosion':
        this.emitExplosion(basePos, color, 65 * countMultiplier);
        break;
      case 'heal_sparkle':
        this.emitHealSparkles(basePos, 26 * countMultiplier);
        break;
      case 'blood_oil':
        this.emitBloodOilSplash(basePos, 22 * countMultiplier);
        break;
      case 'teleport_warp':
        this.emitTeleportWarp(basePos, color, 50 * countMultiplier);
        break;
      case 'aurion_blast':
        this.emitAurionBlast(basePos, color, 70 * countMultiplier);
        break;
      case 'holy_nova':
        this.emitHolyNova(basePos, 80 * countMultiplier);
        break;
      case 'electric_spark':
        this.emitElectricSparks(basePos, 35 * countMultiplier);
        break;
      case 'frost_shatter':
        this.emitFrostShatter(basePos, 45 * countMultiplier);
        break;
      case 'fire_impact':
        this.emitFireImpact(basePos, 40 * countMultiplier);
        break;
      case 'physical_hit':
        this.emitPhysicalHit(basePos, 30 * countMultiplier);
        break;
      default: throw new Error('PARTICLE_EFFECT_UNKNOWN');
    } } finally { this.eventRandom = previousRandom; }
  }

  // --- Specialized Effect Generators ---

  private emitCombatHit(pos: THREE.Vector3, color: THREE.Color, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const speed = 3.5 + this.random() * 5.0;
      const theta = this.random() * Math.PI * 2;
      const phi = this.random() * Math.PI * 0.8;

      this.enqueueParticle({
        position: pos.clone().add(new THREE.Vector3((this.random() - 0.5) * 0.4, (this.random() - 0.5) * 0.4, (this.random() - 0.5) * 0.4)),
        velocity: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed + 1.5,
          Math.sin(phi) * Math.sin(theta) * speed
        ),
        acceleration: new THREE.Vector3(0, -9.8, 0),
        color: color.clone().offsetHSL((this.random() - 0.5) * 0.1, 0, (this.random() - 0.5) * 0.2),
        size: 0.35 + this.random() * 0.35,
        initialSize: 0.35 + this.random() * 0.35,
        alpha: 1.0,
        initialAlpha: 1.0,
        life: 0,
        maxLife: 0.35 + this.random() * 0.25,
        rotation: this.random() * Math.PI,
        rotSpeed: (this.random() - 0.5) * 5,
      });
    }
  }

  private emitCombatCrit(pos: THREE.Vector3, color: THREE.Color, count: number) {
    // 1. Radiant shockwave ring particles
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const angle = (i / count) * Math.PI * 2 + this.random() * 0.2;
      const ringSpeed = 6.0 + this.random() * 4.0;

      this.enqueueParticle({
        position: pos.clone().add(new THREE.Vector3(0, 0.2, 0)),
        velocity: new THREE.Vector3(Math.cos(angle) * ringSpeed, 1.2 + this.random() * 2.0, Math.sin(angle) * ringSpeed),
        acceleration: new THREE.Vector3(0, -6.0, 0),
        color: new THREE.Color(0xfbbf24).lerp(color, this.random() * 0.4),
        size: 0.55 + this.random() * 0.4,
        initialSize: 0.55 + this.random() * 0.4,
        alpha: 1.0,
        initialAlpha: 1.0,
        life: 0,
        maxLife: 0.55 + this.random() * 0.3,
        rotation: angle,
        rotSpeed: 2.0,
      });
    }
  }

  private emitSlashArc(pos: THREE.Vector3, color: THREE.Color, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const t = i / count;
      const arcAngle = (t - 0.5) * Math.PI * 0.9;
      const radius = 2.2 + this.random() * 0.8;

      const pPos = pos.clone().add(new THREE.Vector3(Math.sin(arcAngle) * radius, 0.3 + (this.random() - 0.5) * 0.4, Math.cos(arcAngle) * radius));

      this.enqueueParticle({
        position: pPos,
        velocity: new THREE.Vector3(Math.sin(arcAngle) * 3.0, (this.random() - 0.2) * 2.0, Math.cos(arcAngle) * 3.0),
        acceleration: new THREE.Vector3(0, -3.0, 0),
        color: color.clone(),
        size: 0.4 + this.random() * 0.3,
        initialSize: 0.4 + this.random() * 0.3,
        alpha: 0.9,
        initialAlpha: 0.9,
        life: 0,
        maxLife: 0.4 + this.random() * 0.2,
        rotation: 0,
        rotSpeed: 1.0,
      });
    }
  }

  private emitMagicImpact(pos: THREE.Vector3, color: THREE.Color, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const theta = this.random() * Math.PI * 2;
      const phi = this.random() * Math.PI;
      const speed = 4.0 + this.random() * 5.0;

      this.enqueueParticle({
        position: pos.clone(),
        velocity: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed + 2.0,
          Math.sin(phi) * Math.sin(theta) * speed
        ),
        acceleration: new THREE.Vector3(0, -2.5, 0),
        color: color.clone(),
        size: 0.45 + this.random() * 0.35,
        initialSize: 0.45 + this.random() * 0.35,
        alpha: 1.0,
        initialAlpha: 1.0,
        life: 0,
        maxLife: 0.6 + this.random() * 0.3,
        rotation: this.random() * Math.PI,
        rotSpeed: (this.random() - 0.5) * 4,
      });
    }
  }

  private emitLevelUpFlare(pos: THREE.Vector3, count: number) {
    // 1. Vertical ascending helix spirals
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const t = i / count;
      const angle = t * Math.PI * 8; // 4 full revolutions
      const radius = 1.2 + (1 - t) * 0.8;
      const height = t * 6.0;

      const pPos = pos.clone().add(new THREE.Vector3(Math.cos(angle) * radius, height, Math.sin(angle) * radius));

      const isGold = this.random() > 0.3;
      const col = isGold ? new THREE.Color(0xfbbf24) : new THREE.Color(0xffffff);

      this.enqueueParticle({
        position: pPos,
        velocity: new THREE.Vector3(
          -Math.sin(angle) * 2.0,
          3.5 + this.random() * 3.0,
          Math.cos(angle) * 2.0
        ),
        acceleration: new THREE.Vector3(0, 1.5, 0),
        color: col,
        size: 0.6 + this.random() * 0.5,
        initialSize: 0.6 + this.random() * 0.5,
        alpha: 1.0,
        initialAlpha: 1.0,
        life: 0,
        maxLife: 1.2 + this.random() * 0.6,
        rotation: angle,
        rotSpeed: 3.0,
      });
    }
  }

  private emitBeaconBurst(pos: THREE.Vector3, color: THREE.Color, count: number) {
    // Upward cylindrical aether vortex
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const angle = this.random() * Math.PI * 2;
      const radius = 0.5 + this.random() * 2.5;
      const pPos = pos.clone().add(new THREE.Vector3(Math.cos(angle) * radius, this.random() * 1.5, Math.sin(angle) * radius));

      this.enqueueParticle({
        position: pPos,
        velocity: new THREE.Vector3(-Math.sin(angle) * 3.0, 7.0 + this.random() * 4.0, Math.cos(angle) * 3.0),
        acceleration: new THREE.Vector3(0, 2.0, 0),
        color: color.clone().offsetHSL((this.random() - 0.5) * 0.1, 0, 0.1),
        size: 0.5 + this.random() * 0.4,
        initialSize: 0.5 + this.random() * 0.4,
        alpha: 1.0,
        initialAlpha: 1.0,
        life: 0,
        maxLife: 1.5 + this.random() * 0.8,
        rotation: angle,
        rotSpeed: 4.0,
      });
    }
  }

  private emitSteamPuff(pos: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      this.enqueueParticle({
        position: pos.clone().add(new THREE.Vector3((this.random() - 0.5) * 0.8, this.random() * 0.4, (this.random() - 0.5) * 0.8)),
        velocity: new THREE.Vector3((this.random() - 0.5) * 1.2, 2.5 + this.random() * 2.5, (this.random() - 0.5) * 1.2),
        acceleration: new THREE.Vector3((this.random() - 0.5) * 0.5, 0.8, (this.random() - 0.5) * 0.5),
        color: new THREE.Color(0xe2e8f0),
        size: 0.6 + this.random() * 0.6,
        initialSize: 0.6 + this.random() * 0.6,
        alpha: 0.6,
        initialAlpha: 0.6,
        life: 0,
        maxLife: 1.2 + this.random() * 0.8,
        rotation: this.random() * Math.PI,
        rotSpeed: (this.random() - 0.5) * 1.5,
      });
    }
  }

  private emitSmokePuff(pos: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      this.enqueueParticle({
        position: pos.clone().add(new THREE.Vector3((this.random() - 0.5) * 0.6, this.random() * 0.3, (this.random() - 0.5) * 0.6)),
        velocity: new THREE.Vector3((this.random() - 0.5) * 0.8, 1.8 + this.random() * 2.0, (this.random() - 0.5) * 0.8),
        acceleration: new THREE.Vector3(0, 0.5, 0),
        color: new THREE.Color(0x64748b),
        size: 0.5 + this.random() * 0.5,
        initialSize: 0.5 + this.random() * 0.5,
        alpha: 0.55,
        initialAlpha: 0.55,
        life: 0,
        maxLife: 1.5 + this.random() * 0.9,
        rotation: this.random() * Math.PI,
        rotSpeed: (this.random() - 0.5) * 1.0,
      });
    }
  }

  private emitExplosion(pos: THREE.Vector3, color: THREE.Color, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const theta = this.random() * Math.PI * 2;
      const phi = this.random() * Math.PI;
      const speed = 5.0 + this.random() * 8.0;

      const isFire = this.random() > 0.4;
      const pColor = isFire ? new THREE.Color(0xf97316).lerp(new THREE.Color(0xfacc15), this.random()) : color.clone();

      this.enqueueParticle({
        position: pos.clone(),
        velocity: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.abs(Math.cos(phi)) * speed + 2.0,
          Math.sin(phi) * Math.sin(theta) * speed
        ),
        acceleration: new THREE.Vector3(0, -8.0, 0),
        color: pColor,
        size: 0.6 + this.random() * 0.5,
        initialSize: 0.6 + this.random() * 0.5,
        alpha: 1.0,
        initialAlpha: 1.0,
        life: 0,
        maxLife: 0.7 + this.random() * 0.5,
        rotation: this.random() * Math.PI,
        rotSpeed: (this.random() - 0.5) * 6,
      });
    }
  }

  private emitHealSparkles(pos: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const angle = this.random() * Math.PI * 2;
      const radius = this.random() * 1.8;
      const pPos = pos.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0.2 + this.random() * 0.5, Math.sin(angle) * radius));

      this.enqueueParticle({
        position: pPos,
        velocity: new THREE.Vector3((this.random() - 0.5) * 0.5, 2.5 + this.random() * 2.0, (this.random() - 0.5) * 0.5),
        acceleration: new THREE.Vector3(0, 0.5, 0),
        color: new THREE.Color(0x10b981).lerp(new THREE.Color(0x34d399), this.random()),
        size: 0.45 + this.random() * 0.35,
        initialSize: 0.45 + this.random() * 0.35,
        alpha: 1.0,
        initialAlpha: 1.0,
        life: 0,
        maxLife: 0.9 + this.random() * 0.4,
        rotation: this.random() * Math.PI,
        rotSpeed: 2.0,
      });
    }
  }

  private emitBloodOilSplash(pos: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const theta = this.random() * Math.PI * 2;
      const speed = 2.5 + this.random() * 4.0;

      this.enqueueParticle({
        position: pos.clone().add(new THREE.Vector3((this.random() - 0.5) * 0.3, 0.8, (this.random() - 0.5) * 0.3)),
        velocity: new THREE.Vector3(Math.cos(theta) * speed, 1.0 + this.random() * 3.0, Math.sin(theta) * speed),
        acceleration: new THREE.Vector3(0, -12.0, 0),
        color: this.random() > 0.5 ? new THREE.Color(0x991b1b) : new THREE.Color(0x334155),
        size: 0.3 + this.random() * 0.25,
        initialSize: 0.3 + this.random() * 0.25,
        alpha: 0.9,
        initialAlpha: 0.9,
        life: 0,
        maxLife: 0.4 + this.random() * 0.25,
        rotation: 0,
        rotSpeed: 0,
      });
    }
  }

  private emitTeleportWarp(pos: THREE.Vector3, color: THREE.Color, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const angle = this.random() * Math.PI * 2;
      const radius = 2.0 * this.random();
      const pPos = pos.clone().add(new THREE.Vector3(Math.cos(angle) * radius, this.random() * 2.5, Math.sin(angle) * radius));

      this.enqueueParticle({
        position: pPos,
        velocity: new THREE.Vector3(-Math.cos(angle) * 3.0, 3.0 + this.random() * 4.0, -Math.sin(angle) * 3.0),
        acceleration: new THREE.Vector3(0, 1.0, 0),
        color: color.clone(),
        size: 0.5 + this.random() * 0.4,
        initialSize: 0.5 + this.random() * 0.4,
        alpha: 1.0,
        initialAlpha: 1.0,
        life: 0,
        maxLife: 0.8 + this.random() * 0.3,
        rotation: angle,
        rotSpeed: 4.0,
      });
    }
  }

  private emitAurionBlast(pos: THREE.Vector3, color: THREE.Color, count: number) {
    // Powerful outward cyan/turquoise shockwave
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const theta = this.random() * Math.PI * 2;
      const phi = this.random() * Math.PI * 0.7; // mostly horizontal/upward
      const speed = 8.0 + this.random() * 12.0;

      const pColor = this.random() > 0.3 ? new THREE.Color(0x00f0ff) : new THREE.Color(0x14b8a6);

      this.enqueueParticle({
        position: pos.clone().add(new THREE.Vector3(0, 1.0, 0)),
        velocity: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.cos(phi) * speed,
          Math.sin(phi) * Math.sin(theta) * speed
        ),
        acceleration: new THREE.Vector3(0, -4.0, 0), // gravity
        color: pColor.lerp(color, this.random() * 0.3), // blend with skill color
        size: 0.8 + this.random() * 0.7,
        initialSize: 0.8 + this.random() * 0.7,
        alpha: 1.0,
        initialAlpha: 1.0,
        life: 0,
        maxLife: 0.5 + this.random() * 0.3,
        rotation: this.random() * Math.PI,
        rotSpeed: (this.random() - 0.5) * 8.0,
      });
    }
  }

  private emitHolyNova(pos: THREE.Vector3, count: number) {
    // Large expanding ring of light
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const angle = (i / count) * Math.PI * 2 + this.random() * 0.1;
      const speed = 15.0 + this.random() * 2.0;

      this.enqueueParticle({
        position: pos.clone().add(new THREE.Vector3(Math.cos(angle)*0.5, 0.5 + this.random()*0.2, Math.sin(angle)*0.5)),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, this.random() * 1.5, Math.sin(angle) * speed),
        acceleration: new THREE.Vector3(-Math.cos(angle) * 12.0, 0, -Math.sin(angle) * 12.0), // high drag slowing it down quickly
        color: new THREE.Color(0xfde68a).lerp(new THREE.Color(0xffffff), this.random()),
        size: 0.7 + this.random() * 0.5,
        initialSize: 0.7 + this.random() * 0.5,
        alpha: 1.0,
        initialAlpha: 1.0,
        life: 0,
        maxLife: 0.7 + this.random() * 0.2,
        rotation: angle,
        rotSpeed: 1.0,
      });
    }
  }

  private emitElectricSparks(pos: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const speed = 15.0 + this.random() * 10.0;
      const phi = this.random() * Math.PI * 2;
      const theta = this.random() * Math.PI;

      this.enqueueParticle({
        position: pos.clone().add(new THREE.Vector3((this.random() - 0.5) * 0.5, 0.5 + (this.random() - 0.5) * 0.5, (this.random() - 0.5) * 0.5)),
        velocity: new THREE.Vector3(
          Math.sin(theta) * Math.cos(phi) * speed,
          Math.cos(theta) * speed,
          Math.sin(theta) * Math.sin(phi) * speed
        ),
        acceleration: new THREE.Vector3(0, -5.0, 0), // Slight gravity
        color: this.random() > 0.5 ? new THREE.Color(0xfde047) : new THREE.Color(0x60a5fa), // Yellow/Blue sparks
        size: 0.15 + this.random() * 0.15,
        initialSize: 0.15 + this.random() * 0.15,
        alpha: 1.0,
        initialAlpha: 1.0,
        life: 0,
        maxLife: 0.2 + this.random() * 0.15, // Very short-lived
        rotation: this.random() * Math.PI,
        rotSpeed: 10.0,
      });
    }
  }

  private emitFrostShatter(pos: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const speed = 6.0 + this.random() * 6.0;
      const angle = this.random() * Math.PI * 2;
      const height = this.random() * 1.5;

      this.enqueueParticle({
        position: pos.clone().add(new THREE.Vector3(Math.cos(angle)*0.2, height, Math.sin(angle)*0.2)),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, -2.0 + this.random() * 4.0, Math.sin(angle) * speed),
        acceleration: new THREE.Vector3(0, -15.0, 0), // Heavy gravity for shards
        color: new THREE.Color(0xe0f2fe).lerp(new THREE.Color(0x38bdf8), this.random()),
        size: 0.3 + this.random() * 0.3,
        initialSize: 0.3 + this.random() * 0.3,
        alpha: 0.9,
        initialAlpha: 0.9,
        life: 0,
        maxLife: 0.4 + this.random() * 0.3,
        rotation: this.random() * Math.PI,
        rotSpeed: (this.random() - 0.5) * 8.0,
      });
    }
  }

  private emitFireImpact(pos: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const speed = 4.0 + this.random() * 6.0;
      const angle = this.random() * Math.PI * 2;

      this.enqueueParticle({
        position: pos.clone().add(new THREE.Vector3((this.random() - 0.5) * 0.3, 0.5 + this.random() * 0.5, (this.random() - 0.5) * 0.3)),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, 2.0 + this.random() * 5.0, Math.sin(angle) * speed),
        acceleration: new THREE.Vector3(0, 4.0, 0), // Floats up
        color: this.random() > 0.4 ? new THREE.Color(0xf97316) : new THREE.Color(0xef4444), // Orange/Red
        size: 0.6 + this.random() * 0.6,
        initialSize: 0.6 + this.random() * 0.6,
        alpha: 0.8,
        initialAlpha: 0.8,
        life: 0,
        maxLife: 0.5 + this.random() * 0.3,
        rotation: this.random() * Math.PI,
        rotSpeed: (this.random() - 0.5) * 2.0,
      });
    }
  }

  private emitPhysicalHit(pos: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const speed = 3.0 + this.random() * 5.0;
      const angle = this.random() * Math.PI * 2;

      this.enqueueParticle({
        position: pos.clone().add(new THREE.Vector3(0, 1.0, 0)),
        velocity: new THREE.Vector3(Math.cos(angle) * speed, this.random() * 3.0, Math.sin(angle) * speed),
        acceleration: new THREE.Vector3(-Math.cos(angle) * 8.0, -10.0, -Math.sin(angle) * 8.0), // Drag and gravity
        color: new THREE.Color(0xd4af37).lerp(new THREE.Color(0xfef08a), this.random()), // Muted gold/sandstone hit
        size: 0.2 + this.random() * 0.2,
        initialSize: 0.2 + this.random() * 0.2,
        alpha: 1.0,
        initialAlpha: 1.0,
        life: 0,
        maxLife: 0.3 + this.random() * 0.2,
        rotation: this.random() * Math.PI,
        rotSpeed: (this.random() - 0.5) * 4.0,
      });
    }
  }

  /**
   * Main per-frame particle simulation update
   */
  public update(delta: number, emitAmbient = true) {
    if (this.disposed) return;
    if (!Number.isFinite(delta) || Math.abs(delta - 0.1) > Number.EPSILON) throw new Error('PARTICLE_FIXED_TICK_REQUIRED');
    // 1. Ambient continuous emission from steam vents
    for (const vent of emitAmbient ? this.steamVents : []) {
      if (this.random() < 0.25) {
        this.emitSteamPuff(vent, 2);
      }
    }

    // 2. Continuous beacon wisps
    for (const beacon of emitAmbient ? this.activeBeacons : []) {
      if (beacon.active) {
        beacon.timer += delta;
        if (this.random() < 0.4) {
          const angle = this.random() * Math.PI * 2;
          const radius = 0.8 + this.random() * 1.5;
          const pPos = beacon.position.clone().add(new THREE.Vector3(Math.cos(angle) * radius, 0.5, Math.sin(angle) * radius));

          if (this.particles.length < this.maxParticles) {
            this.enqueueParticle({
              position: pPos,
              velocity: new THREE.Vector3(-Math.sin(angle) * 1.5, 4.5 + this.random() * 2.5, Math.cos(angle) * 1.5),
              acceleration: new THREE.Vector3(0, 1.0, 0),
              color: beacon.color.clone(),
              size: 0.45 + this.random() * 0.3,
              initialSize: 0.45 + this.random() * 0.3,
              alpha: 0.85,
              initialAlpha: 0.85,
              life: 0,
              maxLife: 1.4 + this.random() * 0.5,
              rotation: angle,
              rotSpeed: 2.0,
            });
          }
        }
      }
    }

    // 3. Update existing active particles
    let aliveCount = 0;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life += delta;

      if (p.life >= p.maxLife) {
        this.pool.push(p);
        continue;
      }

      // Physics integration
      p.velocity.addScaledVector(p.acceleration, delta);
      p.position.addScaledVector(p.velocity, delta);

      // Lifecycle ratio
      const progress = p.life / p.maxLife;

      // Alpha and size fade
      p.alpha = p.initialAlpha * (1.0 - progress);
      p.size = p.initialSize * (1.0 - progress * 0.5);

      // Write into GPU buffers
      this.positions[aliveCount * 3] = p.position.x;
      this.positions[aliveCount * 3 + 1] = p.position.y;
      this.positions[aliveCount * 3 + 2] = p.position.z;

      this.colors[aliveCount * 3] = p.color.r;
      this.colors[aliveCount * 3 + 1] = p.color.g;
      this.colors[aliveCount * 3 + 2] = p.color.b;

      this.sizes[aliveCount] = p.size;
      this.alphas[aliveCount] = p.alpha;

      // In-place compaction of active particle array
      if (aliveCount !== i) {
        this.particles[aliveCount] = p;
      }
      aliveCount++;
    }

    this.particles.length = aliveCount;
    this.geometry.setDrawRange(0, aliveCount);

    // Zero out remaining buffer indices
    for (let i = aliveCount; i < this.maxParticles; i++) {
      this.sizes[i] = 0;
    }

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
    this.geometry.attributes.size.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }

  public dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.particles.length = this.pool.length = this.activeBeacons.length = this.steamVents.length = 0;
    this.texture.dispose();
    this.geometry.dispose();
    this.material.dispose();
    this.scene.remove(this.points);
  }
}
