import { decodeValidatedGlbBase64 } from "./adminProtocol";
import type { GlbEquipmentSlot } from "../shared/glbImportContract";

export type GlbAssetType = "character" | "enemy" | "weapon" | "armor" | "arena";
export type GlbWorldFamily = "environment" | "nature" | null;

export type GlbAssetClassification = Readonly<{
  assetType: GlbAssetType;
  subcategory: string;
  confidence: "high" | "medium";
  animationNames: readonly string[];
  nodeNames: readonly string[];
  skinCount: number;
  socketCount: number;
  lod: number | null;
  equipmentSlot: GlbEquipmentSlot | null;
  worldFamily: GlbWorldFamily;
}>;

const JSON_CHUNK_TYPE = 0x4e4f534a;
const WEAPON_KEYWORDS = ["weapon", "sword", "spear", "staff", "blade", "bow", "axe", "dagger", "focus", "rifle", "pistol", "cannon", "hammer", "wand", "lance", "mace"] as const;
const MONSTER_KEYWORDS = ["monster", "beast", "creature", "mob", "spider", "golem", "demon"] as const;
const EQUIPMENT_SLOT_RULES: readonly [GlbEquipmentSlot, readonly string[]][] = [
  ["shield", ["shield", "buckler", "offhand", "tome", "grimoire", "orb", "book", "catalyst"]],
  ["helmet", ["helmet", "helm", "hat", "cowl", "hood", "crown", "goggles", "headpiece", "mask"]],
  ["chest", ["chest", "cuirass", "chestplate", "breastplate", "robe", "gambeson", "jerkin", "torso", "bodyarmor"]],
  ["shoulders", ["shoulder", "pauldron", "pauldrons", "mantle", "shoulderguard"]],
  ["arms", ["gauntlet", "gauntlets", "bracer", "bracers", "glove", "gloves", "vambrace", "arms"]],
  ["legs", ["greave", "greaves", "leggings", "pants", "trousers", "legarmor", "legs"]],
  ["boots", ["boot", "boots", "shoe", "shoes", "sabatons", "footwear"]],
];
const NATURE_RULES = [
  ["tree", ["tree", "oak", "pine", "spruce", "birch", "willow", "trunk", "stump"]],
  ["plant", ["plant", "flower", "grass", "bush", "shrub", "fern", "mushroom", "cactus", "reed", "vine", "moss", "foliage"]],
  ["rock", ["rock", "stone", "boulder", "cliff"]],
  ["nature-prop", ["nature", "forest", "woodland", "log"]],
] as const;
const ENVIRONMENT_RULES = [
  ["teleporter", ["teleporter", "portal", "waygate", "warp", "gateway"]],
  ["fountain", ["fountain", "brunnen", "well"]],
  ["building", ["building", "house", "hut", "home", "tower", "castle", "keep", "temple", "inn", "shop", "forge", "smithy", "warehouse"]],
  ["structure", ["wall", "gate", "bridge", "arch", "stairs", "stair", "roof", "door", "window"]],
  ["street-prop", ["market", "stall", "bench", "lamp", "lantern", "statue", "sign", "crate", "barrel", "cart", "prop"]],
  ["environment", ["arena", "courtyard", "terrain", "environment", "level", "world", "zone", "map", "city", "village", "street", "road"]],
] as const;

function parseGlbJson(bytes: Buffer): Record<string, unknown> {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd > bytes.length) throw new Error("GLB chunk length is invalid");
    if (chunkType === JSON_CHUNK_TYPE) {
      const raw = bytes.subarray(dataStart, dataEnd).toString("utf8").replace(/[\u0000\u0020]+$/g, "");
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        return parsed as Record<string, unknown>;
      } catch {
        throw new Error("GLB JSON chunk is invalid");
      }
    }
    offset = dataEnd;
  }
  throw new Error("GLB JSON chunk is missing");
}

function namedEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(entry => entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string" ? [(entry as { name: string }).name] : []);
}

function hasKeyword(haystack: string, keywords: readonly string[]): boolean {
  return keywords.some(keyword => haystack.includes(keyword));
}

function detectRule<T extends string>(haystack: string, rules: readonly (readonly [T, readonly string[]])[]): T | null {
  for (const [value, keywords] of rules) if (hasKeyword(haystack, keywords)) return value;
  return null;
}

function detectLod(names: readonly string[]): number | null {
  for (const name of names) {
    const match = name.match(/(?:^|[_ -])lod[_ -]?([0-9]+)(?:$|[_ -])/i) ?? name.match(/lod([0-9]+)/i);
    if (match) return Number.parseInt(match[1]!, 10);
  }
  return null;
}

const normalizeAnimationName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

export function classifyGlbBase64(contentBase64: string, sourceName = ""): GlbAssetClassification {
  const { bytes } = decodeValidatedGlbBase64(contentBase64);
  const json = parseGlbJson(bytes);
  const nodeNames = namedEntries(json.nodes);
  const meshNames = namedEntries(json.meshes);
  const skinNames = namedEntries(json.skins);
  const sceneNames = namedEntries(json.scenes);
  const animationNames = namedEntries(json.animations);
  const skinCount = Array.isArray(json.skins) ? json.skins.length : 0;
  const allNames = [...nodeNames, ...meshNames, ...skinNames, ...sceneNames, sourceName];
  const searchable = allNames.join(" ").toLowerCase().replace(/[_-]+/g, " ");
  const socketCount = nodeNames.filter(name => /^(?:socket|slot)_/i.test(name)).length;
  const animationSet = new Set(animationNames.map(name => name.toLowerCase()));
  const normalizedAnimationSet = new Set(animationNames.map(normalizeAnimationName));
  const lod = detectLod(allNames);
  const base = { animationNames: Object.freeze(animationNames), nodeNames: Object.freeze(nodeNames), skinCount, socketCount, lod } as const;

  if (skinCount > 0 && hasKeyword(searchable, ["blacksmith", "schmied"]) && animationSet.has("idle") && animationSet.has("shopinteract")) {
    return Object.freeze({ assetType: "character", subcategory: "blacksmith-npc", confidence: "high", ...base, equipmentSlot: null, worldFamily: null });
  }

  const combatSet = ["idle", "walk", "attack", "death"].every(name => animationSet.has(name));
  const explicitMonster = hasKeyword(searchable, MONSTER_KEYWORDS);
  if (skinCount > 0 && combatSet && explicitMonster) {
    const spiderSignals = searchable.includes("spider") || nodeNames.filter(name => /^leg_[lr][1-4]_/i.test(name)).length >= 8;
    return Object.freeze({ assetType: "enemy", subcategory: spiderSignals ? "spider" : lod === null ? "rigged-monster" : `rigged-monster-lod${lod}`, confidence: "high", ...base, equipmentSlot: null, worldFamily: null });
  }

  const humanoidBoneSignals = ["head", "hand_l", "hand_r", "upperarm_l", "upperarm_r", "thigh_l", "thigh_r"]
    .filter(name => nodeNames.some(nodeName => nodeName.toLowerCase() === name)).length;
  const universalHumanoidClips = ["idle", "walk", "run", "fight", "attack2", "castspell", "death"]
    .every(name => normalizedAnimationSet.has(name));
  const universalHumanoidSignals = universalHumanoidClips && humanoidBoneSignals >= 6;
  const playerSignals = socketCount >= 4
    || (searchable.includes("aurion humanoid rig") && (animationSet.has("attackcombo") || animationSet.has("fight")))
    || hasKeyword(searchable, ["player", "explorer", "character", "humanoid"])
    || universalHumanoidSignals;
  if (skinCount > 0 && playerSignals) {
    const subcategory = universalHumanoidSignals && socketCount < 4 ? "universal-humanoid" : socketCount >= 4 ? "standardized-humanoid" : "rigged-character";
    return Object.freeze({ assetType: "character", subcategory, confidence: "high", ...base, equipmentSlot: null, worldFamily: null });
  }

  if (skinCount > 0 && combatSet) {
    const spiderSignals = searchable.includes("spider") || nodeNames.filter(name => /^leg_[lr][1-4]_/i.test(name)).length >= 8;
    return Object.freeze({ assetType: "enemy", subcategory: spiderSignals ? "spider" : lod === null ? "rigged-monster" : `rigged-monster-lod${lod}`, confidence: "high", ...base, equipmentSlot: null, worldFamily: null });
  }

  if (skinCount === 0) {
    if (hasKeyword(searchable, WEAPON_KEYWORDS)) {
      return Object.freeze({ assetType: "weapon", subcategory: "equipment-weapon", confidence: "medium", ...base, equipmentSlot: "weapon", worldFamily: null });
    }
    const equipmentSlot = detectRule(searchable, EQUIPMENT_SLOT_RULES);
    if (equipmentSlot) {
      return Object.freeze({ assetType: "armor", subcategory: `equipment-${equipmentSlot}`, confidence: "medium", ...base, equipmentSlot, worldFamily: null });
    }
    const natureKind = detectRule(searchable, NATURE_RULES);
    if (natureKind) {
      return Object.freeze({ assetType: "arena", subcategory: natureKind, confidence: "medium", ...base, equipmentSlot: null, worldFamily: "nature" });
    }
    const environmentKind = detectRule(searchable, ENVIRONMENT_RULES);
    if (environmentKind) {
      return Object.freeze({ assetType: "arena", subcategory: environmentKind, confidence: "medium", ...base, equipmentSlot: null, worldFamily: "environment" });
    }
  }

  throw new Error("GLB asset type could not be classified safely");
}
