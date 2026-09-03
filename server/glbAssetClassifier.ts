import { decodeValidatedGlbBase64 } from "./adminProtocol";

export type GlbAssetType = "character" | "enemy" | "weapon" | "armor" | "arena";

export type GlbAssetClassification = Readonly<{
  assetType: GlbAssetType;
  subcategory: string;
  confidence: "high" | "medium";
  animationNames: readonly string[];
  nodeNames: readonly string[];
  skinCount: number;
  socketCount: number;
  lod: number | null;
}>;

const JSON_CHUNK_TYPE = 0x4e4f534a;
const STATIC_KEYWORDS = {
  weapon: ["weapon", "sword", "spear", "staff", "blade", "bow", "axe", "dagger", "focus"],
  armor: ["armor", "armour", "helmet", "helm", "chestplate", "boots", "gauntlet", "shoulderpad"],
  arena: ["arena", "courtyard", "terrain", "environment", "level", "world", "zone", "map"],
} as const;

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

function detectLod(names: readonly string[]): number | null {
  for (const name of names) {
    const match = name.match(/(?:^|[_ -])lod[_ -]?([0-9]+)(?:$|[_ -])/i) ?? name.match(/lod([0-9]+)/i);
    if (match) return Number.parseInt(match[1]!, 10);
  }
  return null;
}

export function classifyGlbBase64(contentBase64: string): GlbAssetClassification {
  const { bytes } = decodeValidatedGlbBase64(contentBase64);
  const json = parseGlbJson(bytes);
  const nodeNames = namedEntries(json.nodes);
  const meshNames = namedEntries(json.meshes);
  const skinNames = namedEntries(json.skins);
  const sceneNames = namedEntries(json.scenes);
  const animationNames = namedEntries(json.animations);
  const skinCount = Array.isArray(json.skins) ? json.skins.length : 0;
  const allNames = [...nodeNames, ...meshNames, ...skinNames, ...sceneNames];
  const searchable = allNames.join(" ").toLowerCase();
  const socketCount = nodeNames.filter(name => /^socket_/i.test(name)).length;
  const animationSet = new Set(animationNames.map(name => name.toLowerCase()));
  const lod = detectLod(allNames);

  const playerSignals = socketCount >= 4
    || (searchable.includes("aurion_humanoid_rig") && (animationSet.has("attackcombo") || animationSet.has("fight")))
    || hasKeyword(searchable, ["player", "explorer", "character"]);
  if (skinCount > 0 && playerSignals) {
    return Object.freeze({ assetType: "character", subcategory: socketCount >= 4 ? "standardized-humanoid" : "rigged-character", confidence: "high", animationNames: Object.freeze(animationNames), nodeNames: Object.freeze(nodeNames), skinCount, socketCount, lod });
  }

  const combatSet = ["idle", "walk", "attack", "death"].every(name => animationSet.has(name));
  if (skinCount > 0 && combatSet) {
    const spiderSignals = searchable.includes("spider")
      || nodeNames.filter(name => /^leg_[lr][1-4]_/i.test(name)).length >= 8;
    return Object.freeze({ assetType: "enemy", subcategory: spiderSignals ? "spider" : lod === null ? "rigged-monster" : `rigged-monster-lod${lod}`, confidence: "high", animationNames: Object.freeze(animationNames), nodeNames: Object.freeze(nodeNames), skinCount, socketCount, lod });
  }

  if (skinCount === 0) {
    for (const assetType of ["weapon", "armor", "arena"] as const) {
      if (hasKeyword(searchable, STATIC_KEYWORDS[assetType])) {
        return Object.freeze({ assetType, subcategory: assetType === "arena" ? "environment" : `static-${assetType}`, confidence: "medium", animationNames: Object.freeze(animationNames), nodeNames: Object.freeze(nodeNames), skinCount, socketCount, lod });
      }
    }
  }

  throw new Error("GLB asset type could not be classified safely");
}
