import * as THREE from 'three';

type Particle = { points: THREE.Points; life: number; max: number; vel: THREE.Vector3[] };
type AmbientEmitter = { position: THREE.Vector3; kind: 'steam' | 'beacon'; color: string; timer: number };

export class ParticleSystem {
  private particles: Particle[] = [];
  private emitters: AmbientEmitter[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  public registerSteamVent(x: number, y: number, z: number): void {
    this.emitters.push({ position: new THREE.Vector3(x, y, z), kind: 'steam', color: '#94a3b8', timer: Math.random() * 1.5 });
  }

  public registerBeacon(x: number, y: number, z: number, color = '#22d3ee'): void {
    this.emitters.push({ position: new THREE.Vector3(x, y, z), kind: 'beacon', color, timer: Math.random() });
  }

  public emit(kind: string, position: { x: number; y: number; z: number }, color: string | number = '#22d3ee', scale = 1): void {
    const count = kind === 'explosion' || kind === 'level_up' ? 40 : kind === 'steam_vent' ? 12 : 22;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let index = 0; index < count; index++) {
      positions[index * 3] = position.x;
      positions[index * 3 + 1] = position.y;
      positions[index * 3 + 2] = position.z;
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.6 + Math.random() * 2.6) * scale;
      velocities.push(new THREE.Vector3(
        Math.cos(angle) * speed * (kind === 'steam_vent' ? 0.25 : 1),
        (0.8 + Math.random() * 2.5) * scale,
        Math.sin(angle) * speed * (kind === 'steam_vent' ? 0.25 : 1),
      ));
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: new THREE.Color(color),
        size: (kind === 'beacon_activate' ? 0.18 : 0.12) * scale,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.scene.add(points);
    this.particles.push({ points, life: 0, max: kind === 'steam_vent' ? 1.8 : 1.2, vel: velocities });
  }

  public update(delta: number): void {
    for (const emitter of this.emitters) {
      emitter.timer -= delta;
      if (emitter.timer <= 0) {
        if (emitter.kind === 'steam') {
          this.emit('steam_vent', emitter.position, emitter.color, 0.55);
          emitter.timer = 1.1 + Math.random() * 1.6;
        } else {
          this.emit('beacon_activate', emitter.position, emitter.color, 0.35);
          emitter.timer = 2.2 + Math.random() * 2.5;
        }
      }
    }

    for (const particle of this.particles) {
      particle.life += delta;
      const position = particle.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      for (let index = 0; index < particle.vel.length; index++) {
        particle.vel[index].y -= delta * 1.4;
        position.setXYZ(
          index,
          position.getX(index) + particle.vel[index].x * delta,
          position.getY(index) + particle.vel[index].y * delta,
          position.getZ(index) + particle.vel[index].z * delta,
        );
      }
      position.needsUpdate = true;
      (particle.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1 - particle.life / particle.max);
    }

    const dead = this.particles.filter(particle => particle.life >= particle.max);
    for (const particle of dead) {
      this.scene.remove(particle.points);
      particle.points.geometry.dispose();
      (particle.points.material as THREE.Material).dispose();
    }
    this.particles = this.particles.filter(particle => particle.life < particle.max);
  }

  public dispose(): void {
    this.particles.forEach(particle => this.scene.remove(particle.points));
    this.particles = [];
    this.emitters = [];
  }
}
