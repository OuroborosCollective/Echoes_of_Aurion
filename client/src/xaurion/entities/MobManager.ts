import * as THREE from 'three';
import type { RPGItem, WorldMobEntity } from '../types';
import { RPG_ITEMS_DATABASE } from '../data/mmorpgData';
import type { LootDropManager } from './LootDropManager';

type MobVisual = { data: WorldMobEntity; group: THREE.Group; body: THREE.Mesh; hpBar: THREE.Mesh };

export class MobManager {
  public readonly scene: THREE.Scene;
  public mobs: MobVisual[] = [];
  private counter = 0;
  private lootManager?: LootDropManager;

  constructor(scene: THREE.Scene, lootManager?: LootDropManager) {
    this.scene = scene;
    this.lootManager = lootManager;
    this.spawnInitial();
  }

  private dropTable(level: number): RPGItem[] {
    return RPG_ITEMS_DATABASE.filter(item => item.levelReq <= Math.max(1, level + 1)).slice(0, 8);
  }

  private create(type: WorldMobEntity['type'], name: string, level: number, x: number, z: number, boss = false, elite = false): WorldMobEntity {
    const hp = (boss ? 360 : elite ? 150 : 75) + level * 18;
    const data: WorldMobEntity = {
      id: `mob_${++this.counter}`,
      name,
      type,
      level,
      hp,
      maxHp: hp,
      x,
      y: 0,
      z,
      spawnX: x,
      spawnZ: z,
      radius: boss ? 1.8 : 0.75,
      attackRange: boss ? 5 : 2.2,
      damage: 7 + level * 3,
      expReward: (boss ? 180 : elite ? 65 : 28) + level * 8,
      goldReward: (boss ? 95 : elite ? 35 : 12) + level * 3,
      isAggroed: false,
      isBoss: boss,
      isElite: elite,
      patrolAngle: Math.random() * Math.PI * 2,
      attackCooldown: 0,
      maxAttackCooldown: boss ? 2.8 : 1.8,
      dropTable: this.dropTable(level),
      color: boss ? '#f97316' : elite ? '#a855f7' : '#ef4444',
    };

    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(data.color),
      metalness: 0.62,
      roughness: 0.38,
      emissive: new THREE.Color(data.color),
      emissiveIntensity: boss ? 0.35 : 0.08,
    });
    const body = new THREE.Mesh(
      boss ? new THREE.DodecahedronGeometry(1.7, 1) : new THREE.CapsuleGeometry(0.55, 1.05, 4, 7),
      material,
    );
    body.position.y = boss ? 1.8 : 1.15;
    group.add(body);
    group.position.set(x, 0, z);
    this.scene.add(group);

    const hpBar = new THREE.Mesh(
      new THREE.PlaneGeometry(boss ? 3.5 : 1.8, 0.12),
      new THREE.MeshBasicMaterial({ color: 0x22c55e, side: THREE.DoubleSide }),
    );
    hpBar.position.y = boss ? 4.2 : 2.6;
    group.add(hpBar);
    this.mobs.push({ data, group, body, hpBar });
    return data;
  }

  private spawnInitial(): void {
    const definitions: [WorldMobEntity['type'], string, number, number, number, boolean?, boolean?][] = [
      ['clockwork_stalker', 'Clockwork Stalker', 1, 18, -18],
      ['aether_wisp', 'Aether Wisp', 2, 34, -28],
      ['corrupted_golem', 'Corrupted Golem', 3, -34, -20, false, true],
      ['steam_drake', 'Steam Drake', 4, -48, 28, false, true],
      ['centurion_elite', 'Brass Centurion', 5, 28, 42, false, true],
      ['titan_boss', 'The Aether Titan', 8, 0, 68, true, true],
    ];
    definitions.forEach(def => this.create(...def));
    for (let index = 0; index < 10; index++) {
      this.create(index % 2 ? 'clockwork_stalker' : 'aether_wisp', index % 2 ? 'Clockwork Stalker' : 'Aether Wisp', 1 + index % 4, -55 + index * 11, -50 + index % 3 * 22);
    }
  }

  public update(delta: number, playerOrX: { x: number; z: number } | number, playerZ?: number, onAttack?: (mob: WorldMobEntity, damage: number) => void): void {
    const player = typeof playerOrX === 'number' ? { x: playerOrX, z: playerZ ?? 0 } : playerOrX;
    for (const mob of this.mobs) {
      if (mob.data.hp <= 0) continue;
      mob.data.attackCooldown = Math.max(0, mob.data.attackCooldown - delta);
      const dx = player.x - mob.data.x;
      const dz = player.z - mob.data.z;
      const distance = Math.hypot(dx, dz);
      mob.data.isAggroed = distance < (mob.data.isBoss ? 22 : 12);

      if (mob.data.isAggroed && distance > mob.data.attackRange) {
        const speed = (mob.data.isBoss ? 1.5 : 2.1) * delta;
        mob.data.x += dx / (distance || 1) * speed;
        mob.data.z += dz / (distance || 1) * speed;
      } else if (mob.data.isAggroed && distance <= mob.data.attackRange && mob.data.attackCooldown <= 0) {
        mob.data.attackCooldown = mob.data.maxAttackCooldown;
        onAttack?.(mob.data, mob.data.damage);
      } else if (!mob.data.isAggroed) {
        mob.data.patrolAngle += delta * 0.35;
        mob.data.x = mob.data.spawnX + Math.cos(mob.data.patrolAngle) * 2.2;
        mob.data.z = mob.data.spawnZ + Math.sin(mob.data.patrolAngle) * 2.2;
      }

      mob.group.position.set(mob.data.x, mob.data.y, mob.data.z);
      mob.body.rotation.y += delta * (mob.data.isBoss ? 0.35 : 0.75);
      mob.hpBar.scale.x = Math.max(0.02, mob.data.hp / mob.data.maxHp);
    }
  }

  public getNearbyMobs(x: number, z: number, radius = 18): WorldMobEntity[] {
    return this.mobs
      .filter(mob => mob.data.hp > 0 && Math.hypot(mob.data.x - x, mob.data.z - z) <= radius)
      .map(mob => mob.data)
      .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z));
  }

  public nearest(x: number, z: number, max = 18): WorldMobEntity | null {
    return this.getNearbyMobs(x, z, max)[0] ?? null;
  }

  public cycle(currentId: string | undefined, x: number, z: number): WorldMobEntity | null {
    const alive = this.getNearbyMobs(x, z, Number.POSITIVE_INFINITY);
    if (!alive.length) return null;
    const index = alive.findIndex(mob => mob.id === currentId);
    return alive[(index + 1) % alive.length];
  }

  public damageMob(mobId: string, amount: number): { mob: WorldMobEntity | null; isKilled: boolean } {
    const visual = this.mobs.find(mob => mob.data.id === mobId);
    if (!visual || visual.data.hp <= 0) return { mob: null, isKilled: false };
    visual.data.hp = Math.max(0, visual.data.hp - Math.max(0, amount));
    const isKilled = visual.data.hp <= 0;
    if (isKilled) {
      visual.group.visible = false;
      const drop = visual.data.dropTable[Math.floor(Math.random() * Math.max(1, visual.data.dropTable.length))];
      if (drop && this.lootManager) this.lootManager.spawnLoot({ ...drop, stats: { ...drop.stats } }, visual.data.x, visual.data.z, visual.data.goldReward);
    }
    return { mob: visual.data, isKilled };
  }

  public damage(mobId: string, amount: number) {
    return this.damageMob(mobId, amount);
  }

  public spawnCustomMob(type: WorldMobEntity['type'], x: number, z: number): WorldMobEntity {
    const boss = type === 'titan_boss';
    const elite = boss || type === 'centurion_elite' || type === 'corrupted_golem' || type === 'steam_drake';
    const level = boss ? 8 : elite ? 5 : 2;
    const names: Record<WorldMobEntity['type'], string> = {
      clockwork_stalker: 'Clockwork Stalker',
      corrupted_golem: 'Corrupted Golem',
      aether_wisp: 'Aether Wisp',
      steam_drake: 'Steam Drake',
      centurion_elite: 'Brass Centurion',
      titan_boss: 'The Aether Titan',
    };
    return this.create(type, names[type], level, x, z, boss, elite);
  }

  public dispose(): void {
    this.mobs.forEach(mob => this.scene.remove(mob.group));
    this.mobs = [];
  }
}
