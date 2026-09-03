/**
 * Core Types for Aurion - 3D Open World Steampunk Fantasy MMORPG
 */

export type CharacterClassId = 'knight' | 'mage' | 'ranger' | 'engineer';

export type WeaponType = 'blade' | 'arcane' | 'marksmanship' | 'heavy_tech';

export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mystic';

export type ItemSlot =
  | 'weapon'
  | 'shield'
  | 'offhand'
  | 'helmet'
  | 'head'
  | 'shoulders'
  | 'chest'
  | 'arms'
  | 'legs'
  | 'boots'
  | 'shoes'
  | 'relic'
  | 'mount'
  | 'consumable';

export interface CharacterAttributes {
  strength: number;
  agility: number;
  intelligence: number;
  defense: number;
}

export interface MilestoneWeaponSkill extends ClassSkill {
  requiredMasteryLevel: number;
  unlockCostGold: number;
  weaponType: WeaponType;
  unlocked?: boolean;
}

export interface WeaponMastery {
  type: WeaponType;
  name: string;
  level: number;
  xp: number;
  maxXp: number;
  icon: string;
  color: string;
  description: string;
  scalingAttr: string;
  bonusStats: {
    attack?: number;
    spellPower?: number;
    armor?: number;
    critChance?: number;
    maxHp?: number;
    maxResource?: number;
    moveSpeed?: number;
    dodgeChance?: number;
  };
  skills: ClassSkill[];
  milestoneSkills?: MilestoneWeaponSkill[];
}

export interface RPGItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: ItemRarity;
  slot: ItemSlot;
  weaponType?: WeaponType;
  levelReq: number;
  classReq?: CharacterClassId;
  stats: {
    attack?: number;
    spellPower?: number;
    armor?: number;
    maxHp?: number;
    maxResource?: number;
    critChance?: number;
    moveSpeed?: number;
  };
  valueGold: number;
  effectDescription?: string;
  glbModelId?: string;
  glbModelUrl?: string;
  isGlbModel?: boolean;
}

export interface ClassSkill {
  id: string;
  name: string;
  icon: string;
  description: string;
  keybind: string;
  cooldown: number;
  currentCooldown: number;
  resourceCost: number;
  resourceType: 'steam' | 'mana' | 'energy' | 'heat';
  range: number;
  damage: number;
  aoeRadius?: number;
  castTime?: number;
  type: 'melee' | 'projectile' | 'aoe' | 'buff' | 'utility' | 'turret';
  color: string;
}

export interface ClassDefinition {
  id: CharacterClassId;
  name: string;
  title: string;
  description: string;
  primaryRole: string;
  icon: string;
  color: string;
  resourceName: string;
  resourceType: 'steam' | 'mana' | 'energy' | 'heat';
  resourceColor: string;
  baseHp: number;
  baseResource: number;
  baseAttack: number;
  baseSpellPower: number;
  baseArmor: number;
  skills: ClassSkill[];
}

export interface PlayerStats {
  hp: number;
  maxHp: number;
  resource: number;
  maxResource: number;
  resourceName: string;
  resourceColor: string;
  level: number;
  xp: number;
  maxXp: number;
  xpToNextLevel: number;
  gold: number;
  politicsLevel: number;
  politicsXp: number;
  attackPower: number;
  spellPower: number;
  armor: number;
  critChance: number;
  dodgeChance: number;
  moveSpeed: number;
  moveSpeedMultiplier: number;
  isMounted: boolean;
  activeMountName: string;
  score: number;
  kills: number;
  bossKills: number;
  currentZone: string;
  x: number;
  y: number;
  z: number;
  statPoints: number;
  attributes: CharacterAttributes;
  activeWeaponType: WeaponType;
  weaponMasteries: Record<WeaponType, WeaponMastery>;
  equippedSkills: ClassSkill[];
  unlockedMilestoneSkills: string[];
  totalMasteryLevel: number;
}

export interface EquipmentState {
  weapon: RPGItem | null;
  shield: RPGItem | null;
  offhand?: RPGItem | null;
  helmet: RPGItem | null;
  head?: RPGItem | null;
  shoulders: RPGItem | null;
  chest: RPGItem | null;
  arms: RPGItem | null;
  legs: RPGItem | null;
  boots: RPGItem | null;
  shoes?: RPGItem | null;
  relic: RPGItem | null;
  mount: RPGItem | null;
}

export interface LootDropEntity { id: string; item: RPGItem; x: number; y: number; z: number; goldAmount: number; rarity: ItemRarity; beamColor: string; spawnTime: number; }

export interface WorldMobEntity {
  id: string; name: string; type: 'clockwork_stalker' | 'corrupted_golem' | 'aether_wisp' | 'steam_drake' | 'centurion_elite' | 'titan_boss'; level: number; hp: number; maxHp: number; x: number; y: number; z: number; spawnX: number; spawnZ: number; radius: number; attackRange: number; damage: number; expReward: number; goldReward: number; isAggroed: boolean; isBoss: boolean; isElite: boolean; patrolAngle: number; attackCooldown: number; maxAttackCooldown: number; dropTable: RPGItem[]; color: string; castProgress?: number; castSkillName?: string;
}

export interface SimulatedPlayer { id: string; name: string; className: string; classId: CharacterClassId; level: number; x: number; y: number; z: number; targetMobId?: string; action: 'patrolling' | 'fighting' | 'resting' | 'riding'; guildTag: string; }
export interface PartyMember { id: string; name: string; classId: CharacterClassId; className: string; level: number; hp: number; maxHp: number; resource: number; maxResource: number; resourceName: string; resourceColor: string; isLeader: boolean; avatarIcon: string; zone: string; isOnline: boolean; dps: number; }
export interface DayNightInfo { timeOfDay: number; formattedTime: string; phase: 'dawn' | 'day' | 'dusk' | 'night'; phaseName: string; icon: string; sunIntensity: number; skyColorHex: string; }

export interface Quest {
  id: string; title: string; giverName: string; giverZone: string; lore: string; description?: string; objective: string; targetCount: number; currentCount: number; rewardXp: number; rewardGold: number; rewardItem?: RPGItem; completed: boolean; type: 'kill_mobs' | 'kill_boss' | 'collect_loot' | 'explore_zone' | 'level_up' | 'tame_pet' | 'build_house'; targetMobType?: string;
}

export type NPCRole = 'grand_artificer' | 'archmage' | 'guard_captain' | 'wandering_trader' | 'beast_tamer' | 'homestead_architect' | 'outlaw_informant' | 'tavern_keeper' | 'Territory Envoy' | 'Guard';
export interface NPCRelationshipMemory { reputation: number; timesInteracted: number; tradesCompleted: number; crimesWitnessed: number; lastConversationTimestamp?: string; personalNotes?: string; }
export interface NPCCharacter { id: string; name: string; title: string; zone: string; role?: NPCRole; x: number; y: number; z: number; dialogue: string[]; quests: Quest[]; shopItems?: RPGItem[]; color: string; faction?: 'Kingdom of Aethelgard' | 'Clockwork Artisans' | 'Aether Circle' | 'Outlaw Syndicate'; familyMembers?: string[]; mood?: 'ecstatic' | 'friendly' | 'neutral' | 'suspicious' | 'hostile'; memory?: NPCRelationshipMemory; sellPets?: CompanionPet[]; houseBlueprints?: HomesteadBlueprint[]; }
export interface CompanionPet { id: string; name: string; species: 'clockwork_hound' | 'steam_drake' | 'aether_wisp' | 'golden_gryphon'; level: number; bonusAttack: number; bonusSpeed: number; loyalty: number; priceGold: number; color: string; icon: string; description: string; }
export interface HomesteadBlueprint { id: string; name: string; tier: 1 | 2 | 3; costGold: number; woodRequired: number; stoneRequired: number; description: string; perks: string; unlocked: boolean; }
export interface CharacterAppearance { name: string; gender: 'male' | 'female' | 'nonbinary'; bodyType: 'standard' | 'athletic' | 'stout' | 'tall'; hairStyle: 'classic' | 'spiky' | 'braids' | 'goggles_bob' | 'shaved'; hairColor: string; skinTone: string; armorTint: string; startingProfession: 'vanguard' | 'wandering_trader' | 'pet_tamer' | 'iron_guard' | 'outlaw_scout'; faction: 'Kingdom of Aethelgard' | 'Clockwork Artisans' | 'Aether Circle' | 'Outlaw Syndicate'; }
export interface GMWorldConfig { godMode: boolean; infiniteResources: boolean; spawnMobType: WorldMobEntity['type']; weatherState: 'clear_sun' | 'blood_moon' | 'aether_aurora' | 'steampunk_fog' | 'void_storm'; timeOfDay: number; mobSpawnMultiplier: number; ambientParticles: boolean; }
export interface ChatMessage { id: string; channel: 'all' | 'party' | 'guild' | 'system' | 'say' | 'whisper'; sender: string; senderClass?: string; text: string; timestamp: string; isPlayer?: boolean; }
export interface FloatingCombatText { id: string; text: string; x: number; y: number; color: string; size: 'sm' | 'md' | 'lg' | 'xl'; opacity: number; lifespan: number; vy: number; isCrit?: boolean; }
export interface ArchiveFile { path: string; language: 'typescript' | 'javascript' | 'glsl' | 'python' | 'html' | 'markdown' | 'json'; description: string; content: string; }
export type SolidObstacleType = 'tree' | 'building' | 'tower' | 'wall' | 'rock' | 'mound' | 'dungeon_gate' | 'monolith' | 'furnace' | 'anvil' | 'fountain' | 'streetlamp' | 'border_stone' | 'ruin_pillar';
export interface SolidObstacle { id: string; type: SolidObstacleType; x: number; z: number; radius: number; height?: number; name?: string; chunkKey?: string; }
export type BiomeType = 'sanctum_capital' | 'clockwork_woods' | 'scorched_quarry' | 'void_crater' | 'whispering_forest' | 'emberfall_march' | 'sunwatch_bastion' | 'ancient_dungeon' | 'frontier_border';
export type LandmarkType = 'forest' | 'city' | 'dungeon' | 'border' | 'quarry' | 'sanctum';
export interface WorldChunkData { chunkKey: string; chunkX: number; chunkZ: number; centerX: number; centerZ: number; size: number; biome: BiomeType; kingdom: string; landmarkType: LandmarkType; landmarkName: string; elevationBase: number; materialTheme: 'grass' | 'flower_meadow' | 'earth' | 'farmland' | 'garden_parcels' | 'starpath' | 'starpath_crossing'; obstacles: SolidObstacle[]; featureDescription: string; createdAt: string; }
export interface WorldExpansionStats { totalChunks: number; totalAreaSqMeters: number; targetMaxPlayers: number; discoveredKingdoms: string[]; activeLandmarks: { name: string; type: LandmarkType; kingdom: string; x: number; z: number }[]; currentChunkKey: string; currentKingdom: string; currentLandmark: string; }
