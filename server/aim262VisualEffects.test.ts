import * as THREE from "three";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { DeterministicSimulation } from "../shared/deterministicSimulation";
import { ParticleSystem, type ParticleEffectType } from "../client/src/xaurion/core/ParticleSystem";
import { ConfirmedVisualEffects } from "../client/src/xaurion/integration/confirmedVisualEffects";

const effects: ParticleEffectType[] = ['combat_hit', 'combat_crit', 'slash_cleave', 'magic_impact', 'level_up', 'beacon_activate', 'steam_vent', 'smoke', 'explosion', 'heal_sparkle', 'blood_oil', 'teleport_warp', 'aurion_blast', 'holy_nova', 'electric_spark', 'frost_shatter', 'fire_impact', 'physical_hit'];
function fixture() {
  const scene = new THREE.Scene(), clock = new DeterministicSimulation('verified-world', 3);
  const particles = new ParticleSystem(scene, clock, 'phone');
  particles.registerSteamVent(0, 0, 0);
  particles.registerBeacon(0, 3, 0);
  return { scene, clock, particles };
}
function run(cadence: number[], { scene, clock, particles }: ReturnType<typeof fixture>) {
  let nextEffect = 0;
  for (const delta of cadence) clock.advanceProjection(delta, fixed => {
    particles.emit(effects[nextEffect++ % effects.length], { x: 1, y: 2, z: 3 }, '#22d3ee', 1, `receipt:${clock.tick}`);
    particles.update(fixed);
  });
  const points = scene.children[0] as THREE.Points;
  const hash = createHash('sha256');
  for (const name of ['position', 'color', 'size', 'alpha']) hash.update(Buffer.from(points.geometry.getAttribute(name).array.buffer));
  const result = { hash: hash.digest('hex'), metrics: particles.metrics, drawCount: points.geometry.drawRange.count };
  particles.dispose();
  return result;
}

describe('AIM-262 deterministic source particle projection', () => {
  it('preserves the exact 18 source generators through the reviewed random/allocation adapters', () => {
    const manifest = JSON.parse(readFileSync('docs/migrations/aim262-particle-source.json', 'utf8'));
    const target = readFileSync(manifest.targetPath, 'utf8');
    expect(createHash('sha256').update(target).digest('hex')).toBe(manifest.targetSha256);
    const restored = target.replaceAll('this.random()', 'Math.random()').replaceAll('this.enqueueParticle({', 'this.particles.push({');
    const generators = Object.fromEntries(Array.from(restored.matchAll(/  private (emit\w+)\([\s\S]*?(?=\n  (?:private|public)|\n  \/\*\*)/g), match => [match[1], createHash('sha256').update(match[0]).digest('hex')]));
    expect(Object.keys(generators)).toHaveLength(18);
    expect(generators).toEqual(manifest.effectGenerators);
  });
  it('replays all 18 source effects identically across render cadences without wall time or global randomness', () => {
    // Three.js allocates opaque renderer UUIDs during construction. They are
    // excluded from all simulation inputs and hashes; generation below is pure.
    const first = fixture(), second = fixture();
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('global random forbidden'); });
    const now = vi.spyOn(Date, 'now').mockImplementation(() => { throw Error('wall clock forbidden'); });
    try {
      const smooth = run(Array(180).fill(0.01), first), coarse = run(Array(18).fill(0.1), second);
      expect(smooth).toEqual(coarse);
      expect(smooth.metrics.active).toBeLessThanOrEqual(600);
      expect(smooth.drawCount).toBe(smooth.metrics.active);
    } finally { random.mockRestore(); now.mockRestore(); }
  });

  it('bounds every device tier, reuses dead particles and releases GPU resources once', () => {
    for (const [tier, budget] of [['phone', 600], ['tablet', 1200], ['desktop', 2400]] as const) {
      const scene = new THREE.Scene(), particles = new ParticleSystem(scene, new DeterministicSimulation('budget', 0), tier);
      const points = scene.children[0] as THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
      const geometry = vi.spyOn(points.geometry, 'dispose'), material = vi.spyOn(points.material, 'dispose');
      const texture = vi.spyOn(points.material.uniforms.particleMap.value as THREE.Texture, 'dispose');
      for (let i = 0; i < 100; i++) particles.emit('explosion', { x: 0, y: 1, z: 0 }, undefined, 4);
      expect(particles.metrics.active).toBe(budget);
      expect(particles.metrics.droppedBursts).toBeGreaterThan(0);
      for (let i = 0; i < 50; i++) particles.update(0.1);
      expect(particles.metrics.active).toBe(0);
      expect(points.geometry.drawRange.count).toBe(0);
      particles.emit('combat_hit', { x: 0, y: 1, z: 0 });
      expect(particles.metrics.reused).toBeGreaterThan(0);
      expect(() => particles.update(1 / 60)).toThrow('PARTICLE_FIXED_TICK_REQUIRED');
      expect(() => particles.emit('explosion', { x: NaN, y: 0, z: 0 })).toThrow('PARTICLE_EVENT_INVALID');
      particles.dispose(); particles.dispose();
      expect(scene.children).toHaveLength(0);
      expect(geometry).toHaveBeenCalledTimes(1); expect(material).toHaveBeenCalledTimes(1); expect(texture).toHaveBeenCalledTimes(1);
    }
  });

  it('ignores incomplete, repeated and reordered combat receipts', () => {
    const projection = new ConfirmedVisualEffects();
    const receipt = { sessionId: 'game_confirmed_1', sequence: 2, damage: 8, bossHp: 12, completed: false, command: '1' };
    expect(projection.accept({ command: '1' })).toBeNull();
    expect(projection.accept({ ...receipt, completed: true })).toBeNull();
    expect(projection.accept(receipt)).toEqual({ kind: 'combat_hit', receiptKey: 'game_confirmed_1:2' });
    expect(projection.accept(receipt)).toBeNull();
    expect(projection.accept({ ...receipt, sequence: 1 })).toBeNull();
    expect(projection.accept({ ...receipt, sequence: 3, bossHp: 0, completed: true })).toEqual({ kind: 'explosion', receiptKey: 'game_confirmed_1:3' });
  });
});
