export const AX1_ECOLOGY_SOURCE_REVISION = "286c575d3d0050ffa77b794d5b7a7e24858acee8" as const;
export const AX1_ECOLOGY_SOURCE_PATHS = Object.freeze([
  "src/world/WorldChunkManager.ts",
  "src/data/mmorpgData.ts",
] as const);

export type Ax1ResourceKind = "wood" | "herb" | "ore" | "fabric" | "leather";
export type Ax1BiomeId =
  | "whispering_forest"
  | "emberfall_march"
  | "void_crater"
  | "sanctum_capital"
  | "clockwork_woods"
  | "scorched_quarry"
  | "sunwatch_bastion"
  | "ancient_dungeon"
  | "frontier_border";

export type Ax1ResourceDensity = Readonly<Record<Ax1ResourceKind, number>>;

const density = (wood: number, herb: number, ore: number, fabric = 1, leather = 1): Ax1ResourceDensity =>
  Object.freeze({ wood, herb, ore, fabric, leather });

/**
 * Immutable content copied from AX1 revision 286c575d... .
 * It is a world-content contract only: availability, depletion, rewards and respawn
 * remain server-confirmed Aurion state and are deliberately absent here.
 */
export const AX1_RESOURCE_DENSITY_BY_BIOME = Object.freeze({
  whispering_forest: density(1.8, 1.5, 0.5),
  emberfall_march: density(0.2, 1.0, 2.0),
  void_crater: density(0.0, 0.2, 2.5),
  sanctum_capital: density(1.0, 1.0, 1.0),
  clockwork_woods: density(1.5, 0.8, 1.2),
  scorched_quarry: density(0.1, 0.3, 2.2),
  sunwatch_bastion: density(1.0, 1.0, 1.0),
  ancient_dungeon: density(0.0, 0.1, 2.0),
  frontier_border: density(1.2, 1.2, 1.2),
} satisfies Record<Ax1BiomeId, Ax1ResourceDensity>);

export type Ax1GatheringProfessionId = "miner" | "farmer" | "hunter";
export type Ax1GatheringToolCategory = "Pickaxe" | "Sickle" | "Skinning Knife";

export type Ax1ResourceNodeDefinition = Readonly<{
  id: string;
  name: string;
  nodeKind: "ore" | "plant" | "carcass";
  xFixed: number;
  yFixed: number;
  zFixed: number;
  resourceItemId: string;
  requiredProfession: Ax1GatheringProfessionId;
  requiredToolCategory: Ax1GatheringToolCategory;
  capacity: number;
  visualColor: string;
}>;

const node = (value: Ax1ResourceNodeDefinition): Ax1ResourceNodeDefinition => Object.freeze(value);

/**
 * AX1's initial resource-node content, normalized to fixed millimetre coordinates.
 * Runtime amount/depletion/respawn fields from AX1 are intentionally not imported:
 * those are gameplay truth and must come from a confirmed server snapshot/receipt.
 */
export const AX1_INITIAL_RESOURCE_NODES = Object.freeze([
  node({ id: "node_copper_1", name: "Bronze Ore Vein", nodeKind: "ore", xFixed: 10_000, yFixed: 0, zFixed: -20_000, resourceItemId: "res_copper_tin_ore", requiredProfession: "miner", requiredToolCategory: "Pickaxe", capacity: 5, visualColor: "#cd7f32" }),
  node({ id: "node_iron_1", name: "Iron Ore Vein", nodeKind: "ore", xFixed: 25_000, yFixed: 0, zFixed: -30_000, resourceItemId: "res_iron_ore", requiredProfession: "miner", requiredToolCategory: "Pickaxe", capacity: 5, visualColor: "#a0aec0" }),
  node({ id: "node_steel_1", name: "High-Yield Iron Vein", nodeKind: "ore", xFixed: -15_000, yFixed: 0, zFixed: -40_000, resourceItemId: "res_steel_ore", requiredProfession: "miner", requiredToolCategory: "Pickaxe", capacity: 5, visualColor: "#4a5568" }),
  node({ id: "node_cotton_1", name: "Cotton Plant", nodeKind: "plant", xFixed: 30_000, yFixed: 0, zFixed: 10_000, resourceItemId: "res_cotton", requiredProfession: "farmer", requiredToolCategory: "Sickle", capacity: 5, visualColor: "#f8fafc" }),
  node({ id: "node_beast_1", name: "Beast Carcass", nodeKind: "carcass", xFixed: -20_000, yFixed: 0, zFixed: 25_000, resourceItemId: "res_hide", requiredProfession: "hunter", requiredToolCategory: "Skinning Knife", capacity: 5, visualColor: "#8b5a2b" }),
] as const);

export function ax1ResourceDensityForBiome(biome: string): Ax1ResourceDensity | undefined {
  return Object.prototype.hasOwnProperty.call(AX1_RESOURCE_DENSITY_BY_BIOME, biome)
    ? AX1_RESOURCE_DENSITY_BY_BIOME[biome as Ax1BiomeId]
    : undefined;
}

export function ax1ResourceNodeById(nodeId: string): Ax1ResourceNodeDefinition | undefined {
  return AX1_INITIAL_RESOURCE_NODES.find(entry => entry.id === nodeId);
}
