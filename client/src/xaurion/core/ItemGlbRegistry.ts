import * as THREE from 'three';
import { RPGItem, ItemSlot, WeaponType, ItemRarity } from '../types';

export interface GLBSocketTransform {
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number] | number;
  mirrorRight?: boolean;
}

export interface ItemGlbMapping {
  itemId: string;
  slot: ItemSlot;
  glbPath: string;
  fallbackGlbPath?: string;
  name: string;
  triangleBudget: number;
  rarity: ItemRarity;
  weaponType?: WeaponType;
  primaryColor?: number;
  glowColor?: number;
  glowIntensity?: number;
  socketTransform: GLBSocketTransform;
  leftSocketTransform?: GLBSocketTransform;
  rightSocketTransform?: GLBSocketTransform;
  specialEffect?: 'none' | 'pulsing_rune' | 'steam_vent' | 'orbit_ring' | 'aether_flame' | 'clockwork_spin';
}

/**
 * Deterministic mapping of individual Item IDs to GLB Asset Paths and Rig Sockets
 */
export const ITEM_TO_GLB_MAPPINGS: Record<string, ItemGlbMapping> = {
  // ==========================================
  // 1. HEAD / HELMET (Kopf)
  // ==========================================
  item_helm_starter: {
    itemId: 'item_helm_starter',
    slot: 'helmet',
    glbPath: '/glb-assets/helmets/recruit-iron-sallet.glb',
    fallbackGlbPath: '/models/glb/recruit-iron-sallet.glb',
    name: 'Recruit Iron Sallet',
    triangleBudget: 420,
    rarity: 'common',
    primaryColor: 0x94a3b8,
    glowColor: 0x00f0ff,
    socketTransform: {
      position: [0, 0.08, 0],
      rotation: [0, 0, 0],
      scale: 1.05,
    },
    specialEffect: 'none',
  },
  item_helm_rare: {
    itemId: 'item_helm_rare',
    slot: 'helmet',
    glbPath: '/glb-assets/helmets/aviator-recon-goggles.glb',
    fallbackGlbPath: '/models/glb/aviator-recon-goggles.glb',
    name: 'Aviator Tactical Brass Goggles',
    triangleBudget: 680,
    rarity: 'rare',
    primaryColor: 0xd97706,
    glowColor: 0x00f0ff,
    glowIntensity: 1.8,
    socketTransform: {
      position: [0, 0.06, 0.04],
      rotation: [0, 0, 0],
      scale: 1.0,
    },
    specialEffect: 'pulsing_rune',
  },
  item_helm_epic: {
    itemId: 'item_helm_epic',
    slot: 'helmet',
    glbPath: '/glb-assets/helmets/sentinel-visored-greathelm.glb',
    fallbackGlbPath: '/models/glb/sol-corona-greathelm.glb',
    name: 'Sentinel Visored Greathelm',
    triangleBudget: 940,
    rarity: 'epic',
    primaryColor: 0x475569,
    glowColor: 0x00f0ff,
    glowIntensity: 2.0,
    socketTransform: {
      position: [0, 0.08, 0],
      rotation: [0, 0, 0],
      scale: 1.08,
    },
    specialEffect: 'steam_vent',
  },
  item_helm_chrono: {
    itemId: 'item_helm_chrono',
    slot: 'helmet',
    glbPath: '/glb-assets/helmets/chrono-aether-cowl.glb',
    fallbackGlbPath: '/models/glb/chrono-aether-cowl.glb',
    name: 'Chronomancer Aether Cowl',
    triangleBudget: 850,
    rarity: 'epic',
    primaryColor: 0x0a192f,
    glowColor: 0x38bdf8,
    glowIntensity: 2.2,
    socketTransform: {
      position: [0, 0.12, -0.02],
      rotation: [0, 0, 0],
      scale: 1.1,
    },
    specialEffect: 'orbit_ring',
  },
  item_helm_legendary: {
    itemId: 'item_helm_legendary',
    slot: 'helmet',
    glbPath: '/glb-assets/helmets/sol-corona-greathelm.glb',
    fallbackGlbPath: '/models/glb/sol-corona-greathelm.glb',
    name: 'Sol Corona Crown Greathelm',
    triangleBudget: 1050,
    rarity: 'legendary',
    primaryColor: 0xf59e0b,
    glowColor: 0xfcd34d,
    glowIntensity: 2.5,
    socketTransform: {
      position: [0, 0.14, 0],
      rotation: [0, 0, 0],
      scale: 1.15,
    },
    specialEffect: 'aether_flame',
  },

  // ==========================================
  // 2. CHESTPLATE / TORSO (Brust)
  // ==========================================
  item_chest_starter: {
    itemId: 'item_chest_starter',
    slot: 'chest',
    glbPath: '/glb-assets/chestplates/recruit-padded-gambeson.glb',
    fallbackGlbPath: '/models/glb/recruit-padded-gambeson.glb',
    name: 'Recruit Padded Gambeson',
    triangleBudget: 520,
    rarity: 'common',
    primaryColor: 0x334155,
    socketTransform: {
      position: [0, 0.35, 0],
      rotation: [0, 0, 0],
      scale: 1.05,
    },
    specialEffect: 'none',
  },
  item_chest_epic: {
    itemId: 'item_chest_epic',
    slot: 'chest',
    glbPath: '/glb-assets/chestplates/valor-hydraulic-cuirass.glb',
    fallbackGlbPath: '/models/glb/titan-hydraulic-cuirass.glb',
    name: 'Hydraulic Cuirass of Valor',
    triangleBudget: 1100,
    rarity: 'epic',
    primaryColor: 0xcd7f32,
    glowColor: 0x00f0ff,
    glowIntensity: 1.9,
    socketTransform: {
      position: [0, 0.36, 0],
      rotation: [0, 0, 0],
      scale: 1.12,
    },
    specialEffect: 'steam_vent',
  },
  item_chest_mage: {
    itemId: 'item_chest_mage',
    slot: 'chest',
    glbPath: '/glb-assets/chestplates/chrono-silk-robes.glb',
    fallbackGlbPath: '/models/glb/chrono-silk-robes.glb',
    name: 'Chronomancer Silk Robes',
    triangleBudget: 860,
    rarity: 'epic',
    primaryColor: 0x0f172a,
    glowColor: 0x00f0ff,
    glowIntensity: 2.0,
    socketTransform: {
      position: [0, 0.34, 0],
      rotation: [0, 0, 0],
      scale: 1.08,
    },
    specialEffect: 'pulsing_rune',
  },
  item_chest_stalker: {
    itemId: 'item_chest_stalker',
    slot: 'chest',
    glbPath: '/glb-assets/chestplates/shadowscale-rogue-jerkin.glb',
    fallbackGlbPath: '/models/glb/shadowscale-rogue-jerkin.glb',
    name: 'Shadowscale Rogue Jerkin',
    triangleBudget: 740,
    rarity: 'rare',
    primaryColor: 0x1e293b,
    glowColor: 0x10b981,
    socketTransform: {
      position: [0, 0.35, 0],
      rotation: [0, 0, 0],
      scale: 1.04,
    },
    specialEffect: 'none',
  },
  item_chest_titan: {
    itemId: 'item_chest_titan',
    slot: 'chest',
    glbPath: '/glb-assets/chestplates/titan-hydraulic-cuirass.glb',
    fallbackGlbPath: '/models/glb/titan-hydraulic-cuirass.glb',
    name: 'Titan Steam Bastion Battleplate',
    triangleBudget: 1180,
    rarity: 'legendary',
    primaryColor: 0xd97706,
    glowColor: 0x00f0ff,
    glowIntensity: 2.4,
    socketTransform: {
      position: [0, 0.38, 0],
      rotation: [0, 0, 0],
      scale: 1.18,
    },
    specialEffect: 'steam_vent',
  },

  // ==========================================
  // 3. SHOULDERS / PAULDRONS (Schultern)
  // ==========================================
  item_shoulder_starter: {
    itemId: 'item_shoulder_starter',
    slot: 'shoulders',
    glbPath: '/glb-assets/shoulders/recruit-riveted-pauldrons.glb',
    fallbackGlbPath: '/models/glb/recruit-riveted-pauldrons.glb',
    name: 'Riveted Iron Pauldrons',
    triangleBudget: 380,
    rarity: 'common',
    primaryColor: 0x64748b,
    socketTransform: {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: 0.95,
      mirrorRight: true,
    },
  },
  item_shoulder_rare: {
    itemId: 'item_shoulder_rare',
    slot: 'shoulders',
    glbPath: '/glb-assets/shoulders/vanguard-spiked-pauldrons.glb',
    fallbackGlbPath: '/models/glb/vanguard-spiked-pauldrons.glb',
    name: 'Spiked Vanguard Pauldrons',
    triangleBudget: 720,
    rarity: 'rare',
    primaryColor: 0xb45309,
    glowColor: 0x00f0ff,
    socketTransform: {
      position: [0, 0.05, 0],
      rotation: [0, 0, 0],
      scale: 1.05,
      mirrorRight: true,
    },
    specialEffect: 'steam_vent',
  },
  item_shoulder_epic: {
    itemId: 'item_shoulder_epic',
    slot: 'shoulders',
    glbPath: '/glb-assets/shoulders/aether-runic-mantle.glb',
    fallbackGlbPath: '/models/glb/aether-runic-mantle.glb',
    name: 'Mantle of Ancient Aether Runes',
    triangleBudget: 960,
    rarity: 'epic',
    primaryColor: 0x0a192f,
    glowColor: 0x00f0ff,
    glowIntensity: 2.2,
    socketTransform: {
      position: [0, 0.1, 0],
      rotation: [0, 0, 0],
      scale: 1.1,
      mirrorRight: true,
    },
    specialEffect: 'orbit_ring',
  },
  item_shoulder_lion: {
    itemId: 'item_shoulder_lion',
    slot: 'shoulders',
    glbPath: '/glb-assets/shoulders/lion-crest-royal-pauldrons.glb',
    fallbackGlbPath: '/models/glb/lion-crest-royal-pauldrons.glb',
    name: 'Lion Crest Royal Pauldrons',
    triangleBudget: 1120,
    rarity: 'legendary',
    primaryColor: 0xf59e0b,
    glowColor: 0xfcd34d,
    glowIntensity: 2.3,
    socketTransform: {
      position: [0, 0.08, 0],
      rotation: [0, 0, 0],
      scale: 1.15,
      mirrorRight: true,
    },
    specialEffect: 'aether_flame',
  },

  // ==========================================
  // 4. ARMS & GAUNTLETS (Arme & Hände)
  // ==========================================
  item_arms_starter: {
    itemId: 'item_arms_starter',
    slot: 'arms',
    glbPath: '/glb-assets/arms/recruit-leather-bracers.glb',
    fallbackGlbPath: '/models/glb/recruit-leather-bracers.glb',
    name: 'Recruit Leather Bracers',
    triangleBudget: 340,
    rarity: 'common',
    primaryColor: 0x475569,
    socketTransform: {
      position: [0, -0.18, 0],
      rotation: [0, 0, 0],
      scale: 0.95,
      mirrorRight: true,
    },
  },
  item_arms_rare: {
    itemId: 'item_arms_rare',
    slot: 'arms',
    glbPath: '/glb-assets/arms/bronze-clank-gauntlets.glb',
    fallbackGlbPath: '/models/glb/bronze-clank-gauntlets.glb',
    name: 'Bronze Clank Gauntlets',
    triangleBudget: 680,
    rarity: 'rare',
    primaryColor: 0xd97706,
    glowColor: 0x00f0ff,
    socketTransform: {
      position: [0, -0.2, 0],
      rotation: [0, 0, 0],
      scale: 1.05,
      mirrorRight: true,
    },
    specialEffect: 'clockwork_spin',
  },
  item_arms_epic: {
    itemId: 'item_arms_epic',
    slot: 'arms',
    glbPath: '/glb-assets/arms/mystic-chrono-spellwraps.glb',
    fallbackGlbPath: '/models/glb/mystic-chrono-spellwraps.glb',
    name: 'Mystic Chrono Spellwraps',
    triangleBudget: 890,
    rarity: 'epic',
    primaryColor: 0x1e1b4b,
    glowColor: 0x00f0ff,
    glowIntensity: 2.1,
    socketTransform: {
      position: [0, -0.22, 0],
      rotation: [0, 0, 0],
      scale: 1.08,
      mirrorRight: true,
    },
    specialEffect: 'pulsing_rune',
  },
  item_arms_titan: {
    itemId: 'item_arms_titan',
    slot: 'arms',
    glbPath: '/glb-assets/arms/titan-piston-fists.glb',
    fallbackGlbPath: '/models/glb/titan-piston-fists.glb',
    name: 'Titan Heavy Piston Fists',
    triangleBudget: 1140,
    rarity: 'legendary',
    primaryColor: 0xb45309,
    glowColor: 0xf59e0b,
    glowIntensity: 2.4,
    socketTransform: {
      position: [0, -0.24, 0],
      rotation: [0, 0, 0],
      scale: 1.15,
      mirrorRight: true,
    },
    specialEffect: 'steam_vent',
  },

  // ==========================================
  // 5. LEGS & GREAVES (Beine)
  // ==========================================
  item_legs_starter: {
    itemId: 'item_legs_starter',
    slot: 'legs',
    glbPath: '/glb-assets/legs/recruit-iron-greaves.glb',
    fallbackGlbPath: '/models/glb/recruit-iron-greaves.glb',
    name: 'Recruit Iron Greaves',
    triangleBudget: 410,
    rarity: 'common',
    primaryColor: 0x475569,
    socketTransform: {
      position: [0, -0.22, 0],
      rotation: [0, 0, 0],
      scale: 1.0,
      mirrorRight: true,
    },
  },
  item_legs_rare: {
    itemId: 'item_legs_rare',
    slot: 'legs',
    glbPath: '/glb-assets/legs/armored-steel-greaves.glb',
    fallbackGlbPath: '/models/glb/armored-steel-greaves.glb',
    name: 'Armored Steel Greaves',
    triangleBudget: 760,
    rarity: 'rare',
    primaryColor: 0x0284c7,
    glowColor: 0x00f0ff,
    socketTransform: {
      position: [0, -0.22, 0],
      rotation: [0, 0, 0],
      scale: 1.06,
      mirrorRight: true,
    },
  },
  item_legs_mage: {
    itemId: 'item_legs_mage',
    slot: 'legs',
    glbPath: '/glb-assets/legs/silk-chrono-robe-skirt.glb',
    fallbackGlbPath: '/models/glb/silk-chrono-robe-skirt.glb',
    name: 'Silk Chrono Robe Skirt',
    triangleBudget: 830,
    rarity: 'epic',
    primaryColor: 0x0f172a,
    glowColor: 0x00f0ff,
    socketTransform: {
      position: [0, -0.2, 0],
      rotation: [0, 0, 0],
      scale: 1.08,
      mirrorRight: true,
    },
    specialEffect: 'pulsing_rune',
  },
  item_legs_titan: {
    itemId: 'item_legs_titan',
    slot: 'legs',
    glbPath: '/glb-assets/legs/titan-plated-faulds.glb',
    fallbackGlbPath: '/models/glb/titan-plated-faulds.glb',
    name: 'Titan Heavy Plated Faulds',
    triangleBudget: 1150,
    rarity: 'legendary',
    primaryColor: 0xd97706,
    glowColor: 0xf59e0b,
    socketTransform: {
      position: [0, -0.24, 0],
      rotation: [0, 0, 0],
      scale: 1.15,
      mirrorRight: true,
    },
    specialEffect: 'steam_vent',
  },

  // ==========================================
  // 6. BOOTS / SABATONS (Schuhe / Füße)
  // ==========================================
  item_boots_starter: {
    itemId: 'item_boots_starter',
    slot: 'boots',
    glbPath: '/glb-assets/boots/recruit-iron-sabatons.glb',
    fallbackGlbPath: '/models/glb/recruit-iron-sabatons.glb',
    name: 'Recruit Iron Sabatons',
    triangleBudget: 360,
    rarity: 'common',
    primaryColor: 0x334155,
    socketTransform: {
      position: [0, -0.42, 0.08],
      rotation: [0, 0, 0],
      scale: 1.0,
      mirrorRight: true,
    },
  },
  item_boots_rare: {
    itemId: 'item_boots_rare',
    slot: 'boots',
    glbPath: '/glb-assets/boots/piston-assisted-striders.glb',
    fallbackGlbPath: '/models/glb/piston-assisted-striders.glb',
    name: 'Piston-Assisted Striders',
    triangleBudget: 740,
    rarity: 'rare',
    primaryColor: 0xd97706,
    glowColor: 0x00f0ff,
    socketTransform: {
      position: [0, -0.42, 0.08],
      rotation: [0, 0, 0],
      scale: 1.05,
      mirrorRight: true,
    },
    specialEffect: 'steam_vent',
  },
  item_boots_epic: {
    itemId: 'item_boots_epic',
    slot: 'boots',
    glbPath: '/glb-assets/boots/arcane-hover-sabatons.glb',
    fallbackGlbPath: '/models/glb/arcane-hover-sabatons.glb',
    name: 'Arcane Hover-Sabatons',
    triangleBudget: 910,
    rarity: 'epic',
    primaryColor: 0x0a192f,
    glowColor: 0x00f0ff,
    glowIntensity: 2.1,
    socketTransform: {
      position: [0, -0.42, 0.08],
      rotation: [0, 0, 0],
      scale: 1.08,
      mirrorRight: true,
    },
    specialEffect: 'orbit_ring',
  },
  item_boots_titan: {
    itemId: 'item_boots_titan',
    slot: 'boots',
    glbPath: '/glb-assets/boots/heavy-crusader-stompers.glb',
    fallbackGlbPath: '/models/glb/heavy-crusader-stompers.glb',
    name: 'Heavy Crusader Iron Stompers',
    triangleBudget: 1120,
    rarity: 'legendary',
    primaryColor: 0xf59e0b,
    glowColor: 0xfcd34d,
    socketTransform: {
      position: [0, -0.44, 0.1],
      rotation: [0, 0, 0],
      scale: 1.12,
      mirrorRight: true,
    },
    specialEffect: 'steam_vent',
  },

  // ==========================================
  // 7. WEAPONS (Waffen)
  // ==========================================
  item_sword_starter: {
    itemId: 'item_sword_starter',
    slot: 'weapon',
    weaponType: 'blade',
    glbPath: '/glb-assets/weapons/apprentice-steel-blade.glb',
    fallbackGlbPath: '/models/glb/aurion-blade.glb',
    name: 'Apprentice Steel Blade',
    triangleBudget: 460,
    rarity: 'common',
    primaryColor: 0x94a3b8,
    socketTransform: {
      position: [0, 0.25, 0],
      rotation: [0, 0, 0],
      scale: 1.0,
    },
  },
  item_sword_rare: {
    itemId: 'item_sword_rare',
    slot: 'weapon',
    weaponType: 'blade',
    glbPath: '/glb-assets/weapons/aurion-blade.glb',
    fallbackGlbPath: '/models/glb/aurion-blade.glb',
    name: 'Cog-Forged Bastard Sword',
    triangleBudget: 780,
    rarity: 'rare',
    primaryColor: 0x0284c7,
    glowColor: 0x00f0ff,
    glowIntensity: 1.8,
    socketTransform: {
      position: [0, 0.3, 0],
      rotation: [0, 0, 0],
      scale: 1.1,
    },
    specialEffect: 'pulsing_rune',
  },
  item_katana_epic: {
    itemId: 'item_katana_epic',
    slot: 'weapon',
    weaponType: 'blade',
    glbPath: '/glb-assets/weapons/vortex-steam-katana.glb',
    fallbackGlbPath: '/models/glb/aurion-blade.glb',
    name: 'Vortex Steam Katana',
    triangleBudget: 860,
    rarity: 'epic',
    primaryColor: 0x334155,
    glowColor: 0x00f0ff,
    glowIntensity: 2.0,
    socketTransform: {
      position: [0, 0.35, 0],
      rotation: [0, 0, -0.08],
      scale: 1.15,
    },
    specialEffect: 'steam_vent',
  },
  item_hammer_epic: {
    itemId: 'item_hammer_epic',
    slot: 'weapon',
    weaponType: 'blade',
    glbPath: '/glb-assets/weapons/hydraulic-warhammer.glb',
    fallbackGlbPath: '/models/glb/hydraulic-warhammer.glb',
    name: 'Hydraulic Titan Warhammer',
    triangleBudget: 1190,
    rarity: 'epic',
    primaryColor: 0xd97706,
    glowColor: 0x00f0ff,
    glowIntensity: 2.2,
    socketTransform: {
      position: [0, 0.35, 0],
      rotation: [0, 0, 0],
      scale: 1.25,
    },
    specialEffect: 'steam_vent',
  },
  item_legendary_blade: {
    itemId: 'item_legendary_blade',
    slot: 'weapon',
    weaponType: 'blade',
    glbPath: '/glb-assets/weapons/aurion-sunblade.glb',
    fallbackGlbPath: '/models/glb/aurion-sunblade.glb',
    name: 'Ignis Sunblade of the Colossus',
    triangleBudget: 1150,
    rarity: 'legendary',
    primaryColor: 0xf59e0b,
    glowColor: 0xfcd34d,
    glowIntensity: 2.6,
    socketTransform: {
      position: [0, 0.4, 0],
      rotation: [0, 0, 0],
      scale: 1.3,
    },
    specialEffect: 'aether_flame',
  },
  item_staff_starter: {
    itemId: 'item_staff_starter',
    slot: 'weapon',
    weaponType: 'arcane',
    glbPath: '/glb-assets/weapons/novice-aether-wand.glb',
    fallbackGlbPath: '/models/glb/chrono-aether-scepter.glb',
    name: 'Novice Aether Wand',
    triangleBudget: 420,
    rarity: 'common',
    primaryColor: 0x854d0e,
    socketTransform: {
      position: [0, 0.3, 0],
      rotation: [0, 0, 0],
      scale: 1.0,
    },
  },
  item_staff_epic: {
    itemId: 'item_staff_epic',
    slot: 'weapon',
    weaponType: 'arcane',
    glbPath: '/glb-assets/weapons/chrono-aether-scepter.glb',
    fallbackGlbPath: '/models/glb/chrono-aether-scepter.glb',
    name: 'Chronomancer Aether Scepter',
    triangleBudget: 950,
    rarity: 'epic',
    primaryColor: 0x0a192f,
    glowColor: 0x00f0ff,
    glowIntensity: 2.4,
    socketTransform: {
      position: [0, 0.45, 0],
      rotation: [0, 0, 0],
      scale: 1.2,
    },
    specialEffect: 'orbit_ring',
  },
  item_bow_starter: {
    itemId: 'item_bow_starter',
    slot: 'weapon',
    weaponType: 'marksmanship',
    glbPath: '/glb-assets/weapons/steam-assisted-bow.glb',
    fallbackGlbPath: '/models/glb/clockwork-repeater.glb',
    name: 'Steam-Assisted Hunting Bow',
    triangleBudget: 510,
    rarity: 'common',
    primaryColor: 0x78350f,
    socketTransform: {
      position: [0, 0.1, 0.1],
      rotation: [0, Math.PI / 2, 0],
      scale: 1.0,
    },
  },
  item_bow_epic: {
    itemId: 'item_bow_epic',
    slot: 'weapon',
    weaponType: 'marksmanship',
    glbPath: '/glb-assets/weapons/clockwork-repeater.glb',
    fallbackGlbPath: '/models/glb/clockwork-repeater.glb',
    name: 'Volt-Repeating Heavy Arbalest',
    triangleBudget: 1100,
    rarity: 'epic',
    primaryColor: 0xb45309,
    glowColor: 0x10b981,
    glowIntensity: 2.0,
    socketTransform: {
      position: [0, 0.1, 0.15],
      rotation: [0, 0, 0],
      scale: 1.15,
    },
    specialEffect: 'clockwork_spin',
  },
  item_daggers_epic: {
    itemId: 'item_daggers_epic',
    slot: 'weapon',
    weaponType: 'marksmanship',
    glbPath: '/glb-assets/weapons/twin-shadow-daggers.glb',
    fallbackGlbPath: '/models/glb/aurion-blade.glb',
    name: 'Twin Shadow Fang Daggers',
    triangleBudget: 740,
    rarity: 'epic',
    primaryColor: 0x18181b,
    glowColor: 0x10b981,
    socketTransform: {
      position: [0, 0.2, 0],
      rotation: [Math.PI, 0, 0],
      scale: 0.9,
    },
    specialEffect: 'pulsing_rune',
  },
  item_cannon_starter: {
    itemId: 'item_cannon_starter',
    slot: 'weapon',
    weaponType: 'heavy_tech',
    glbPath: '/glb-assets/weapons/hand-mortar-blunderbuss.glb',
    fallbackGlbPath: '/models/glb/steam-mortar-cannon.glb',
    name: 'Hand-Mortar Blunderbuss',
    triangleBudget: 620,
    rarity: 'common',
    primaryColor: 0x78350f,
    socketTransform: {
      position: [0, 0.1, 0.1],
      rotation: [0, 0, 0],
      scale: 1.0,
    },
  },
  item_cannon_epic: {
    itemId: 'item_cannon_epic',
    slot: 'weapon',
    weaponType: 'heavy_tech',
    glbPath: '/glb-assets/weapons/steam-mortar-cannon.glb',
    fallbackGlbPath: '/models/glb/steam-mortar-cannon.glb',
    name: 'Overcharged Steam Mortar',
    triangleBudget: 1150,
    rarity: 'epic',
    primaryColor: 0xd97706,
    glowColor: 0x00f0ff,
    glowIntensity: 2.3,
    socketTransform: {
      position: [0, 0.15, 0.2],
      rotation: [0, 0, 0],
      scale: 1.2,
    },
    specialEffect: 'steam_vent',
  },

  // ==========================================
  // 8. SHIELDS & OFFHANDS (Nebenhand / Schild)
  // ==========================================
  item_shield_starter: {
    itemId: 'item_shield_starter',
    slot: 'shield',
    glbPath: '/glb-assets/shields/brass-buckler.glb',
    fallbackGlbPath: '/models/glb/aegis-bulwark.glb',
    name: 'Brass Buckler',
    triangleBudget: 420,
    rarity: 'common',
    primaryColor: 0xb45309,
    socketTransform: {
      position: [0, -0.15, 0.12],
      rotation: [0, Math.PI / 2, 0],
      scale: 0.95,
    },
  },
  item_shield_epic: {
    itemId: 'item_shield_epic',
    slot: 'shield',
    glbPath: '/glb-assets/shields/aegis-bulwark.glb',
    fallbackGlbPath: '/models/glb/aegis-bulwark.glb',
    name: 'Aegis Antigravity Bulwark',
    triangleBudget: 980,
    rarity: 'epic',
    primaryColor: 0x0284c7,
    glowColor: 0x00f0ff,
    glowIntensity: 2.2,
    socketTransform: {
      position: [0, -0.15, 0.14],
      rotation: [0, Math.PI / 2, 0],
      scale: 1.1,
    },
    specialEffect: 'pulsing_rune',
  },
  item_tome_epic: {
    itemId: 'item_tome_epic',
    slot: 'shield',
    glbPath: '/glb-assets/shields/chrono-grimoire-offhand.glb',
    fallbackGlbPath: '/models/glb/chrono-grimoire-offhand.glb',
    name: 'Tome of Celestial Mechanics',
    triangleBudget: 720,
    rarity: 'mystic',
    primaryColor: 0x1e1b4b,
    glowColor: 0x00f0ff,
    glowIntensity: 2.3,
    socketTransform: {
      position: [0.12, -0.1, 0.22],
      rotation: [0, -Math.PI / 4, 0],
      scale: 0.95,
    },
    specialEffect: 'orbit_ring',
  },
  item_orb_epic: {
    itemId: 'item_orb_epic',
    slot: 'shield',
    glbPath: '/glb-assets/shields/aether-catalyst-orb.glb',
    fallbackGlbPath: '/models/glb/chrono-grimoire-offhand.glb',
    name: 'Floating Aether Catalyst Orb',
    triangleBudget: 650,
    rarity: 'rare',
    primaryColor: 0x06b6d4,
    glowColor: 0x00f0ff,
    glowIntensity: 2.4,
    socketTransform: {
      position: [0.15, -0.05, 0.25],
      rotation: [0, 0, 0],
      scale: 0.85,
    },
    specialEffect: 'orbit_ring',
  },
  item_dagger_offhand: {
    itemId: 'item_dagger_offhand',
    slot: 'shield',
    glbPath: '/glb-assets/shields/parrying-stiletto.glb',
    fallbackGlbPath: '/models/glb/aurion-blade.glb',
    name: 'Parrying Stiletto',
    triangleBudget: 460,
    rarity: 'rare',
    primaryColor: 0x475569,
    socketTransform: {
      position: [0, -0.2, 0.1],
      rotation: [Math.PI / 2, 0, 0],
      scale: 0.9,
    },
  },
};

/**
 * Helper to resolve an ItemGlbMapping for any item instance or dynamic ID
 */
export function resolveItemGlbMapping(item: RPGItem | null, slot: ItemSlot | string): ItemGlbMapping | null {
  if (!item) return null;

  // 1. Direct item ID lookup
  if (ITEM_TO_GLB_MAPPINGS[item.id]) {
    return ITEM_TO_GLB_MAPPINGS[item.id];
  }

  // 2. Direct model ID from dynamic GLB registration
  if (item.glbModelId && ITEM_TO_GLB_MAPPINGS[item.glbModelId]) {
    return ITEM_TO_GLB_MAPPINGS[item.glbModelId];
  }

  // 3. Normalized ID lookup (stripping glb_item_ prefix if any)
  const cleanId = item.id.replace(/^glb_item_/, '');
  if (ITEM_TO_GLB_MAPPINGS[cleanId]) {
    return ITEM_TO_GLB_MAPPINGS[cleanId];
  }

  // 4. Fallback for custom or procedurally generated items based on Slot & Rarity
  const normalizedSlot = (item.slot || slot) as ItemSlot;
  const glbUrl = item.glbModelUrl || (item.glbModelId ? `/glb-assets/${item.glbModelId}.glb` : undefined);

  return {
    itemId: item.id,
    slot: normalizedSlot,
    glbPath: glbUrl || `/glb-assets/${normalizedSlot}/${item.id}.glb`,
    fallbackGlbPath: `/models/glb/${cleanId}.glb`,
    name: item.name,
    triangleBudget: 1100,
    rarity: item.rarity || 'epic',
    weaponType: item.weaponType,
    socketTransform: getDefaultSocketTransform(normalizedSlot),
    specialEffect: item.rarity === 'mystic' || item.rarity === 'legendary' ? 'pulsing_rune' : 'none',
  };
}

export function getDefaultSocketTransform(slot: ItemSlot | string): GLBSocketTransform {
  switch (slot) {
    case 'helmet':
    case 'head':
      return { position: [0, 0.08, 0], rotation: [0, 0, 0], scale: 1.05 };
    case 'chest':
      return { position: [0, 0.35, 0], rotation: [0, 0, 0], scale: 1.1 };
    case 'shoulders':
      return { position: [0, 0.06, 0], rotation: [0, 0, 0], scale: 1.05, mirrorRight: true };
    case 'arms':
      return { position: [0, -0.2, 0], rotation: [0, 0, 0], scale: 1.05, mirrorRight: true };
    case 'legs':
      return { position: [0, -0.22, 0], rotation: [0, 0, 0], scale: 1.05, mirrorRight: true };
    case 'boots':
    case 'shoes':
      return { position: [0, -0.42, 0.08], rotation: [0, 0, 0], scale: 1.05, mirrorRight: true };
    case 'weapon':
      return { position: [0, 0.3, 0], rotation: [0, 0, 0], scale: 1.15 };
    case 'shield':
    case 'offhand':
      return { position: [0, -0.15, 0.12], rotation: [0, Math.PI / 2, 0], scale: 1.0 };
    default:
      return { position: [0, 0, 0], rotation: [0, 0, 0], scale: 1.0 };
  }
}
