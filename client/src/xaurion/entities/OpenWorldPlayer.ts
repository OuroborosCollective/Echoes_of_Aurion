import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CharacterClassId, ClassSkill, EquipmentState, PlayerStats, RPGItem, WeaponType } from '../types';
import { DEFAULT_WEAPON_MASTERIES, MMORPG_CLASSES, RPG_ITEMS_DATABASE } from '../data/mmorpgData';
import { collisionSystem } from '../world/WorldCollisionSystem';

const cloneMasteries = (): PlayerStats['weaponMasteries'] => Object.fromEntries(
  Object.entries(DEFAULT_WEAPON_MASTERIES).map(([key, value]) => [key, {
    ...value,
    bonusStats: { ...value.bonusStats },
    skills: value.skills.map(skill => ({ ...skill })),
    milestoneSkills: value.milestoneSkills?.map(skill => ({ ...skill })),
  }]),
) as PlayerStats['weaponMasteries'];

export class OpenWorldPlayer {
  public readonly scene: THREE.Scene;
  public readonly group = new THREE.Group();
  public position = this.group.position;
  public currentClassId: CharacterClassId;
  public facingAngle = Math.PI;
  public targetAngle = Math.PI;
  public isMoving = false;
  public baseMoveSpeed = 9.5;
  public buffAttackMultiplier = 1;
  public buffSpeedMultiplier = 1;
  public buffTimer = 0;
  public isShieldActive = false;
  public shieldTimer = 0;

  public equipment: EquipmentState = {
    weapon: null,
    shield: null,
    helmet: null,
    shoulders: null,
    chest: null,
    arms: null,
    legs: null,
    boots: null,
    relic: null,
    mount: null,
  };
  public inventory: RPGItem[] = [];
  public stats: PlayerStats;

  private body: THREE.Object3D | null = null;
  private externalModel: THREE.Object3D | null = null;
  private shieldVisual: THREE.Mesh | null = null;
  private equipmentListeners = new Set<(equipment: EquipmentState) => void>();
  private attackTimer = 0;
  private attackDuration = 0.55;
  private attackType: ClassSkill['type'] = 'melee';

  constructor(scene: THREE.Scene, classId: CharacterClassId = 'knight') {
    this.scene = scene;
    this.currentClassId = classId;
    this.stats = this.makeStats(classId);
    scene.add(this.group);
    this.buildBody();
    this.inventory = RPG_ITEMS_DATABASE.slice(0, 10).map(item => ({ ...item, stats: { ...item.stats } }));
    this.equipment.weapon = this.inventory.find(item => item.slot === 'weapon') ?? null;
    this.equipment.shield = this.inventory.find(item => item.slot === 'shield') ?? null;
    this.recalculateStats();
  }

  private makeStats(classId: CharacterClassId): PlayerStats {
    const def = MMORPG_CLASSES[classId];
    return {
      hp: def.baseHp,
      maxHp: def.baseHp,
      resource: def.baseResource,
      maxResource: def.baseResource,
      resourceName: def.resourceName,
      resourceColor: def.resourceColor,
      level: 1,
      xp: 0,
      maxXp: 100,
      xpToNextLevel: 100,
      gold: 250,
      politicsLevel: 1,
      politicsXp: 0,
      attackPower: def.baseAttack,
      spellPower: def.baseSpellPower,
      armor: def.baseArmor,
      critChance: 10,
      dodgeChance: 6,
      moveSpeed: 100,
      moveSpeedMultiplier: 1,
      isMounted: false,
      activeMountName: 'Clockwork Brass Stallion',
      score: 0,
      kills: 0,
      bossKills: 0,
      currentZone: 'Aethelgard Sanctum (Hauptstadt)',
      x: 0,
      y: 0,
      z: 8,
      statPoints: 3,
      attributes: { strength: 10, agility: 10, intelligence: 10, defense: 10 },
      activeWeaponType: classId === 'mage' ? 'arcane' : classId === 'ranger' ? 'marksmanship' : classId === 'engineer' ? 'heavy_tech' : 'blade',
      weaponMasteries: cloneMasteries(),
      equippedSkills: def.skills.map(skill => ({ ...skill })),
      unlockedMilestoneSkills: [],
      totalMasteryLevel: 4,
    };
  }

  private buildBody(): void {
    if (this.body) this.group.remove(this.body);
    const def = MMORPG_CLASSES[this.currentClassId];
    const root = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: new THREE.Color(def.color), metalness: 0.78, roughness: 0.28 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x202b33, roughness: 0.8 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.48, 0.9, 5, 8), metal);
    torso.position.y = 1.25;
    root.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), dark);
    head.position.y = 2.15;
    root.add(head);
    for (const side of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.65, 4, 6), metal);
      arm.position.set(side * 0.58, 1.35, 0);
      arm.rotation.z = side * 0.12;
      root.add(arm);
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.72, 4, 6), dark);
      leg.position.set(side * 0.23, 0.48, 0);
      root.add(leg);
    }
    const weapon = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.35, 0.1), new THREE.MeshStandardMaterial({ color: 0xd8b66c, metalness: 0.9, roughness: 0.2 }));
    weapon.position.set(0.75, 1.25, 0.2);
    weapon.rotation.z = -0.18;
    root.add(weapon);
    this.group.add(root);
    this.body = root;
  }

  public setClass(classId: CharacterClassId): void {
    const previous = this.stats;
    this.currentClassId = classId;
    const next = this.makeStats(classId);
    next.level = previous.level;
    next.xp = previous.xp;
    next.gold = previous.gold;
    next.score = previous.score;
    next.kills = previous.kills;
    next.bossKills = previous.bossKills;
    next.weaponMasteries = previous.weaponMasteries;
    next.attributes = { ...previous.attributes };
    next.statPoints = previous.statPoints;
    this.stats = next;
    this.buildBody();
    this.recalculateStats();
  }

  public update(delta: number, movement?: { x: number; z: number }): void {
    for (const skill of this.stats.equippedSkills) skill.currentCooldown = Math.max(0, skill.currentCooldown - delta);
    this.stats.resource = Math.min(this.stats.maxResource, this.stats.resource + delta * 4);

    if (this.buffTimer > 0) {
      this.buffTimer = Math.max(0, this.buffTimer - delta);
      if (this.buffTimer === 0) {
        this.buffAttackMultiplier = 1;
        this.buffSpeedMultiplier = 1;
        this.recalculateStats();
      }
    }
    if (this.shieldTimer > 0) {
      this.shieldTimer = Math.max(0, this.shieldTimer - delta);
      if (this.shieldTimer === 0) this.setShield(false);
    }
    if (this.attackTimer > 0) {
      this.attackTimer = Math.max(0, this.attackTimer - delta);
      if (this.body) {
        const progress = 1 - this.attackTimer / Math.max(0.01, this.attackDuration);
        this.body.rotation.z = this.attackType === 'melee' ? Math.sin(progress * Math.PI) * -0.18 : 0;
      }
    } else if (this.body) {
      this.body.rotation.z *= Math.max(0, 1 - delta * 12);
    }

    if (movement) {
      const length = Math.hypot(movement.x, movement.z);
      this.isMoving = length > 0.001;
      if (this.isMoving) {
        const nx = movement.x / length;
        const nz = movement.z / length;
        this.targetAngle = Math.atan2(nx, nz);
        let diff = this.targetAngle - this.facingAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        this.facingAngle += diff * Math.min(1, delta * 10);
        const speed = this.baseMoveSpeed * this.stats.moveSpeedMultiplier * delta;
        this.move({ x: nx * speed, z: nz * speed });
      }
    }

    this.group.rotation.y = this.facingAngle;
    this.group.scale.setScalar(this.stats.isMounted ? 1.08 : 1);
    this.stats.x = this.position.x;
    this.stats.y = this.position.y;
    this.stats.z = this.position.z;
  }

  public move(displacement: { x: number; z: number }): void {
    const resolved = collisionSystem.resolveMovement({ x: this.position.x, z: this.position.z }, displacement, 0.65);
    this.position.x = resolved.newPos.x;
    this.position.z = resolved.newPos.z;
  }

  public toggleMount(): boolean {
    this.stats.isMounted = !this.stats.isMounted;
    this.stats.activeMountName = this.stats.isMounted ? 'Clockwork Brass Stallion' : '';
    this.recalculateStats();
    return this.stats.isMounted;
  }

  public consumeResource(amount: number): boolean {
    if (this.stats.resource < amount) return false;
    this.stats.resource -= amount;
    return true;
  }

  public triggerAttackAnimation(type: ClassSkill['type'], duration = 0.55): void {
    this.attackType = type;
    this.attackDuration = Math.max(0.1, duration);
    this.attackTimer = this.attackDuration;
  }

  public triggerShield(duration = 6): void {
    this.isShieldActive = true;
    this.shieldTimer = duration;
    this.setShield(true);
  }

  public heal(amount: number): void {
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + Math.max(0, amount));
  }

  public takeDamage(amount: number): { damageTaken: number; isDead: boolean; dodged: boolean } {
    if (Math.random() * 100 < this.stats.dodgeChance) return { damageTaken: 0, isDead: false, dodged: true };
    let damage = amount * (100 / (100 + this.stats.armor * 0.6));
    if (this.isShieldActive) damage *= 0.25;
    const damageTaken = Math.max(1, Math.round(damage));
    this.stats.hp = Math.max(0, this.stats.hp - damageTaken);
    return { damageTaken, isDead: this.stats.hp <= 0, dodged: false };
  }

  public recalculateStats(): void {
    const def = MMORPG_CLASSES[this.currentClassId];
    let attack = 0, spell = 0, armor = 0, hp = 0, resource = 0, speed = 0, crit = 0;
    for (const item of Object.values(this.equipment)) {
      if (!item?.stats) continue;
      attack += item.stats.attack ?? 0;
      spell += item.stats.spellPower ?? 0;
      armor += item.stats.armor ?? 0;
      hp += item.stats.maxHp ?? 0;
      resource += item.stats.maxResource ?? 0;
      speed += item.stats.moveSpeed ?? 0;
      crit += item.stats.critChance ?? 0;
    }
    const levelMult = 1 + (this.stats.level - 1) * 0.12;
    this.stats.maxHp = Math.round((def.baseHp + hp + (this.stats.attributes.defense - 10) * 22) * levelMult);
    this.stats.maxResource = Math.round(def.baseResource + resource + (this.stats.attributes.intelligence - 10) * 12);
    this.stats.attackPower = Math.round((def.baseAttack + attack + (this.stats.attributes.strength - 10) * 3.5) * levelMult * this.buffAttackMultiplier);
    this.stats.spellPower = Math.round((def.baseSpellPower + spell + (this.stats.attributes.intelligence - 10) * 3.5) * levelMult * this.buffAttackMultiplier);
    this.stats.armor = Math.round(def.baseArmor + armor + (this.stats.attributes.defense - 10) * 4.5);
    this.stats.critChance = Math.min(75, 10 + crit + Math.max(0, this.stats.attributes.strength - 10) * 0.5);
    this.stats.dodgeChance = Math.min(50, 6 + Math.max(0, this.stats.attributes.agility - 10) * 0.75);
    this.stats.moveSpeedMultiplier = (1 + speed / 100 + (this.stats.isMounted ? 1 : 0)) * this.buffSpeedMultiplier;
    this.stats.hp = Math.min(this.stats.hp, this.stats.maxHp);
    this.stats.resource = Math.min(this.stats.resource, this.stats.maxResource);
    this.stats.activeWeaponType = this.getActiveWeaponType();
  }

  public getActiveWeaponType(): WeaponType {
    return this.equipment.weapon?.weaponType ?? this.stats.activeWeaponType;
  }

  public gainWeaponMasteryXp(type: WeaponType, amount: number) {
    const mastery = this.stats.weaponMasteries[type];
    mastery.xp += Math.max(0, amount);
    let leveledUp = false;
    while (mastery.xp >= mastery.maxXp) {
      mastery.xp -= mastery.maxXp;
      mastery.level++;
      mastery.maxXp = Math.round(mastery.maxXp * 1.45);
      this.stats.statPoints++;
      leveledUp = true;
    }
    this.stats.totalMasteryLevel = Object.values(this.stats.weaponMasteries).reduce((sum, entry) => sum + entry.level, 0);
    return { leveledUp, newLevel: mastery.level, mastery };
  }

  public gainXp(amount: number): boolean {
    this.stats.xp += Math.max(0, amount);
    let leveled = false;
    while (this.stats.xp >= this.stats.maxXp) {
      this.stats.xp -= this.stats.maxXp;
      this.stats.level++;
      this.stats.maxXp = Math.round(this.stats.maxXp * 1.32);
      this.stats.xpToNextLevel = this.stats.maxXp;
      this.stats.statPoints += 2;
      leveled = true;
    }
    if (leveled) {
      this.recalculateStats();
      this.stats.hp = this.stats.maxHp;
    }
    return leveled;
  }

  public allocateStatPoint(attribute: keyof PlayerStats['attributes']) {
    if (this.stats.statPoints < 1) return { success: false, message: 'No stat points available' };
    this.stats.statPoints--;
    this.stats.attributes[attribute]++;
    this.recalculateStats();
    return { success: true, message: `${attribute} increased` };
  }

  public unlockMilestoneSkill(skillId: string) {
    if (this.stats.unlockedMilestoneSkills.includes(skillId)) return { success: false, message: 'Already unlocked' };
    this.stats.unlockedMilestoneSkills.push(skillId);
    return { success: true, message: 'Unlocked' };
  }

  public equipSkillToHotbar(slot: number, skill: ClassSkill): void {
    if (slot >= 0 && slot < 5) this.stats.equippedSkills[slot] = { ...skill, keybind: String(slot + 1) };
  }

  public equipItem(item: RPGItem): RPGItem | null {
    if (item.slot === 'consumable') {
      this.useConsumable(item);
      return null;
    }
    const slot = item.slot === 'head' ? 'helmet' : item.slot === 'shoes' ? 'boots' : item.slot === 'offhand' ? 'shield' : item.slot;
    if (!(slot in this.equipment)) return null;
    const previous = this.equipment[slot as keyof EquipmentState] ?? null;
    (this.equipment as Record<string, RPGItem | null | undefined>)[slot] = item;
    this.inventory = this.inventory.filter(candidate => candidate.id !== item.id);
    if (previous) this.inventory.push(previous);
    this.observeEquipmentState();
    return previous;
  }

  public unequipSlot(slotName: string): RPGItem | null {
    const slot = slotName === 'head' ? 'helmet' : slotName === 'shoes' ? 'boots' : slotName === 'offhand' ? 'shield' : slotName;
    if (!(slot in this.equipment)) return null;
    const item = (this.equipment as Record<string, RPGItem | null | undefined>)[slot] ?? null;
    if (!item) return null;
    (this.equipment as Record<string, RPGItem | null | undefined>)[slot] = null;
    this.inventory.push(item);
    this.observeEquipmentState();
    return item;
  }

  public addEquipmentListener(listener: (equipment: EquipmentState) => void): () => void {
    this.equipmentListeners.add(listener);
    return () => this.equipmentListeners.delete(listener);
  }

  public observeEquipmentState(): boolean {
    this.recalculateStats();
    this.equipmentListeners.forEach(listener => listener({ ...this.equipment }));
    return true;
  }

  public useConsumable(item: RPGItem): void {
    if (item.slot !== 'consumable') return;
    this.heal(item.id.includes('elixir') ? 100 : 250);
    this.inventory = this.inventory.filter(candidate => candidate.id !== item.id);
  }

  public async equipGlbModel(url: string | null): Promise<boolean> {
    if (!url) {
      if (this.externalModel) this.group.remove(this.externalModel);
      this.externalModel = null;
      if (this.body) this.body.visible = true;
      return true;
    }
    try {
      const gltf = await new GLTFLoader().loadAsync(url);
      if (this.externalModel) this.group.remove(this.externalModel);
      this.externalModel = gltf.scene;
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const size = box.getSize(new THREE.Vector3());
      const max = Math.max(size.x, size.y, size.z) || 1;
      gltf.scene.scale.setScalar(2.4 / max);
      const nextBox = new THREE.Box3().setFromObject(gltf.scene);
      gltf.scene.position.y -= nextBox.min.y;
      if (this.body) this.body.visible = false;
      this.group.add(gltf.scene);
      return true;
    } catch {
      if (this.body) this.body.visible = true;
      return false;
    }
  }

  public setShield(active: boolean): void {
    this.isShieldActive = active;
    if (active && !this.shieldVisual) {
      this.shieldVisual = new THREE.Mesh(
        new THREE.SphereGeometry(1.3, 20, 14),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.18, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }),
      );
      this.shieldVisual.position.y = 1.2;
      this.group.add(this.shieldVisual);
    }
    if (this.shieldVisual) this.shieldVisual.visible = active;
  }

  public dispose(): void {
    this.scene.remove(this.group);
  }
}
