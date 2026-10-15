import { createHash } from "node:crypto";
import { aurionMonsterAssetRegistry, type AurionMonsterSpeciesId } from "../shared/aurionMonsterAssetRegistry";
import type { ZoneMobArchetype } from "../shared/zoneMobContract";

/** Aurion-owned gameplay source: Wolfram verifies arithmetic but never owns a live tick. */
export const AURION_MONSTER_RULESET = "aurion.monster-species.v1" as const;
export const aurionMonsterRegions = Object.freeze(["observatory_threshold","windhollow","emberfall","cinder_vault","clockwork_woods","frostcrown_march","sunwatch_bastion","whispering_frontier","tidescar_coast","starfall_ruins"] as const);
export type AurionMonsterRegion = typeof aurionMonsterRegions[number];
export type AurionMonsterHabitat = "field" | "forest" | "highlands" | "mountain" | "dungeon" | "coast" | "ruins" | "city-outskirts";
export type AurionMonsterBehavior = "bruiser" | "skirmisher" | "ambusher" | "caster" | "guardian" | "aerial";
export type AurionMonsterSpecies = Readonly<{
  speciesId: AurionMonsterSpeciesId; displayName: string; assetSha256: string;
  family: "big" | "blob" | "flying"; region: AurionMonsterRegion;
  habitat: AurionMonsterHabitat; behavior: AurionMonsterBehavior; archetype: ZoneMobArchetype;
  levelMin: number; levelMax: number; isElite: boolean; isBoss: boolean;
  spawnWeight: number; ordinal: number;
}>;

/** Hand-reviewed spawn regions/behaviors for the exact 49 imported physical models.
 * There are no hostile town-interior placements; a city-outskirts habitat
 * does not authorize spawns in settlement safe zones.
 */
const authoredSpecies = [
  { speciesId: "monster_big_alien", region: "starfall_ruins", habitat: "ruins", behavior: "bruiser", archetype: "corrupted_golem", levelMin: 10, levelMax: 16, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_big_birb", region: "observatory_threshold", habitat: "field", behavior: "bruiser", archetype: "corrupted_golem", levelMin: 3, levelMax: 9, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_big_bluedemon", region: "cinder_vault", habitat: "dungeon", behavior: "guardian", archetype: "titan_boss", levelMin: 22, levelMax: 32, isElite: true, isBoss: true, spawnWeight: 1 },
  { speciesId: "monster_big_bunny", region: "observatory_threshold", habitat: "field", behavior: "bruiser", archetype: "corrupted_golem", levelMin: 5, levelMax: 11, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_big_cactoro", region: "emberfall", habitat: "highlands", behavior: "bruiser", archetype: "corrupted_golem", levelMin: 18, levelMax: 24, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_big_demon", region: "cinder_vault", habitat: "dungeon", behavior: "caster", archetype: "aether_wisp", levelMin: 20, levelMax: 28, isElite: true, isBoss: false, spawnWeight: 2 },
  { speciesId: "monster_big_dino", region: "emberfall", habitat: "highlands", behavior: "bruiser", archetype: "corrupted_golem", levelMin: 22, levelMax: 28, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_big_fish", region: "tidescar_coast", habitat: "coast", behavior: "ambusher", archetype: "clockwork_stalker", levelMin: 24, levelMax: 30, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_big_frog", region: "observatory_threshold", habitat: "field", behavior: "bruiser", archetype: "corrupted_golem", levelMin: 2, levelMax: 8, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_big_monkroose", region: "windhollow", habitat: "forest", behavior: "bruiser", archetype: "corrupted_golem", levelMin: 12, levelMax: 18, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_big_mushroomking", region: "clockwork_woods", habitat: "forest", behavior: "guardian", archetype: "titan_boss", levelMin: 22, levelMax: 32, isElite: true, isBoss: true, spawnWeight: 1 },
  { speciesId: "monster_big_ninja", region: "whispering_frontier", habitat: "field", behavior: "ambusher", archetype: "clockwork_stalker", levelMin: 16, levelMax: 22, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_big_orc", region: "whispering_frontier", habitat: "field", behavior: "bruiser", archetype: "corrupted_golem", levelMin: 18, levelMax: 24, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_big_orc_skull", region: "cinder_vault", habitat: "dungeon", behavior: "bruiser", archetype: "corrupted_golem", levelMin: 20, levelMax: 28, isElite: true, isBoss: false, spawnWeight: 2 },
  { speciesId: "monster_big_tribal", region: "whispering_frontier", habitat: "field", behavior: "bruiser", archetype: "corrupted_golem", levelMin: 22, levelMax: 28, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_big_yeti", region: "frostcrown_march", habitat: "mountain", behavior: "bruiser", archetype: "corrupted_golem", levelMin: 24, levelMax: 32, isElite: true, isBoss: false, spawnWeight: 2 },
  { speciesId: "monster_blob_alien", region: "observatory_threshold", habitat: "field", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 2, levelMax: 8, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_birb", region: "observatory_threshold", habitat: "field", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 3, levelMax: 9, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_cactoro", region: "emberfall", habitat: "highlands", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 4, levelMax: 10, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_cat", region: "observatory_threshold", habitat: "field", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 5, levelMax: 11, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_chicken", region: "observatory_threshold", habitat: "field", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 2, levelMax: 8, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_dog", region: "observatory_threshold", habitat: "field", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 3, levelMax: 9, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_fish", region: "tidescar_coast", habitat: "coast", behavior: "ambusher", archetype: "clockwork_stalker", levelMin: 8, levelMax: 14, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_greenblob", region: "observatory_threshold", habitat: "field", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 5, levelMax: 11, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_greenspikyblob", region: "observatory_threshold", habitat: "field", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 2, levelMax: 8, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_mushnub", region: "observatory_threshold", habitat: "field", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 3, levelMax: 9, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_mushnub_evolved", region: "clockwork_woods", habitat: "forest", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 12, levelMax: 20, isElite: true, isBoss: false, spawnWeight: 2 },
  { speciesId: "monster_blob_ninja", region: "whispering_frontier", habitat: "field", behavior: "ambusher", archetype: "clockwork_stalker", levelMin: 4, levelMax: 10, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_orc", region: "whispering_frontier", habitat: "field", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 5, levelMax: 11, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_pigeon", region: "sunwatch_bastion", habitat: "city-outskirts", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 6, levelMax: 12, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_pinkblob", region: "observatory_threshold", habitat: "field", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 4, levelMax: 10, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_wizard", region: "clockwork_woods", habitat: "forest", behavior: "caster", archetype: "aether_wisp", levelMin: 8, levelMax: 14, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_blob_yeti", region: "frostcrown_march", habitat: "mountain", behavior: "skirmisher", archetype: "clockwork_stalker", levelMin: 9, levelMax: 17, isElite: true, isBoss: false, spawnWeight: 2 },
  { speciesId: "monster_flying_alpaking", region: "frostcrown_march", habitat: "mountain", behavior: "aerial", archetype: "steam_drake", levelMin: 21, levelMax: 27, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_flying_alpaking_evolved", region: "frostcrown_march", habitat: "mountain", behavior: "aerial", archetype: "steam_drake", levelMin: 23, levelMax: 31, isElite: true, isBoss: false, spawnWeight: 2 },
  { speciesId: "monster_flying_armabee", region: "sunwatch_bastion", habitat: "city-outskirts", behavior: "aerial", archetype: "steam_drake", levelMin: 25, levelMax: 31, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_flying_armabee_evolved", region: "sunwatch_bastion", habitat: "city-outskirts", behavior: "aerial", archetype: "steam_drake", levelMin: 9, levelMax: 17, isElite: true, isBoss: false, spawnWeight: 2 },
  { speciesId: "monster_flying_dragon", region: "emberfall", habitat: "highlands", behavior: "aerial", archetype: "steam_drake", levelMin: 11, levelMax: 17, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_flying_dragon_evolved", region: "emberfall", habitat: "highlands", behavior: "aerial", archetype: "titan_boss", levelMin: 22, levelMax: 32, isElite: true, isBoss: true, spawnWeight: 1 },
  { speciesId: "monster_flying_ghost", region: "cinder_vault", habitat: "dungeon", behavior: "aerial", archetype: "steam_drake", levelMin: 15, levelMax: 21, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_flying_ghost_skull", region: "cinder_vault", habitat: "dungeon", behavior: "aerial", archetype: "steam_drake", levelMin: 17, levelMax: 23, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_flying_glub", region: "tidescar_coast", habitat: "coast", behavior: "aerial", archetype: "steam_drake", levelMin: 19, levelMax: 25, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_flying_glub_evolved", region: "tidescar_coast", habitat: "coast", behavior: "aerial", archetype: "steam_drake", levelMin: 21, levelMax: 29, isElite: true, isBoss: false, spawnWeight: 2 },
  { speciesId: "monster_flying_goleling", region: "starfall_ruins", habitat: "ruins", behavior: "aerial", archetype: "steam_drake", levelMin: 23, levelMax: 29, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_flying_goleling_evolved", region: "starfall_ruins", habitat: "ruins", behavior: "aerial", archetype: "steam_drake", levelMin: 25, levelMax: 33, isElite: true, isBoss: false, spawnWeight: 2 },
  { speciesId: "monster_flying_hywirl", region: "sunwatch_bastion", habitat: "city-outskirts", behavior: "aerial", archetype: "steam_drake", levelMin: 9, levelMax: 15, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_flying_pigeon", region: "sunwatch_bastion", habitat: "city-outskirts", behavior: "aerial", archetype: "steam_drake", levelMin: 11, levelMax: 17, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_flying_squidle", region: "tidescar_coast", habitat: "coast", behavior: "aerial", archetype: "steam_drake", levelMin: 13, levelMax: 19, isElite: false, isBoss: false, spawnWeight: 6 },
  { speciesId: "monster_flying_tribal", region: "whispering_frontier", habitat: "field", behavior: "aerial", archetype: "steam_drake", levelMin: 15, levelMax: 21, isElite: false, isBoss: false, spawnWeight: 6 },
] as const;

export const aurionMonsterSpecies: readonly AurionMonsterSpecies[] = Object.freeze(authoredSpecies.map((row, index) => {
  const asset = aurionMonsterAssetRegistry[index];
  if (!asset || asset.speciesId !== row.speciesId) throw new Error("AURION_MONSTER_ASSET_ORDER_INVALID");
  return Object.freeze({ ...row, family: asset.family, displayName: asset.displayName, assetSha256: asset.sha256, ordinal: index + 1 });
}));

const speciesById = new Map(aurionMonsterSpecies.map(species => [species.speciesId, species] as const));
export function requireAurionMonsterSpecies(speciesId: string): AurionMonsterSpecies {
  const species = speciesById.get(speciesId as AurionMonsterSpeciesId);
  if (!species) throw new Error("AURION_MONSTER_SPECIES_UNKNOWN");
  return species;
}

const healthScaleBps = Object.freeze({ big: 14500, blob: 9000, flying: 11000 } as const);
const damageScaleBps = Object.freeze({ big: 11500, blob: 9000, flying: 10500 } as const);
/** Wolfram-verified integer-only curves. Level is bounded by each authored species profile. */
export function aurionMonsterCombatStats(species: AurionMonsterSpecies, level: number) {
  if (!Number.isSafeInteger(level) || level < species.levelMin || level > species.levelMax) throw new Error("AURION_MONSTER_LEVEL_OUT_OF_RANGE");
  const hpNumerator = 110 + 33 * level + 3 * level * level + 5 * species.ordinal;
  const attackNumerator = 1 + Math.floor(level / 3) + species.ordinal % 5;
  const maxHealth = Math.floor(hpNumerator * healthScaleBps[species.family] / 10000);
  const attackBonus = Math.floor(attackNumerator * damageScaleBps[species.family] / 10000);
  const attackRangeFixed = species.behavior === "aerial" ? 4000 : species.behavior === "ambusher" ? 2800 : species.behavior === "guardian" ? 3400 : 3000;
  const attackCooldownTicks = species.behavior === "skirmisher" ? 15 : species.behavior === "bruiser" ? 23 : species.behavior === "guardian" ? 26 : species.behavior === "aerial" ? 20 : 18;
  const chaseStepFixed = species.behavior === "aerial" ? 650 : species.behavior === "skirmisher" ? 550 : species.behavior === "bruiser" ? 360 : species.behavior === "ambusher" ? 520 : 420;
  const aggroRadiusFixed = species.isBoss ? 28000 : species.isElite ? 22000 : species.behavior === "ambusher" ? 14000 : 16000;
  return Object.freeze({ maxHealth, attackBonus, attackRangeFixed, attackCooldownTicks, chaseStepFixed, aggroRadiusFixed });
}

/** Deterministic spawn *selection plan*, not a direct authority mutation or a world-coordinate grant.
 * A region runtime may materialize these only after canonical world/biome and
 * collision/readback validation. Existing observable zone actors remain unchanged.
 */
export function planAurionMonsterEncounter(region: AurionMonsterRegion, seed: string, count: number) {
  if (!aurionMonsterRegions.includes(region) || !/^[A-Za-z0-9:._-]{1,120}$/.test(seed) || !Number.isSafeInteger(count) || count < 1 || count > 16)
    throw new Error("AURION_MONSTER_SPAWN_PLAN_INVALID");
  const pool = aurionMonsterSpecies.filter(species => species.region === region).sort((a, b) => a.speciesId < b.speciesId ? -1 : a.speciesId > b.speciesId ? 1 : 0);
  if (!pool.length) throw new Error("AURION_MONSTER_REGION_EMPTY");
  const totalWeight = pool.reduce((sum, row) => sum + row.spawnWeight, 0);
  return Object.freeze(Array.from({ length: count }, (_, slot) => {
    const hash = (suffix: string) => createHash("sha256").update(`${AURION_MONSTER_RULESET}:${region}:${seed}:${slot}:${suffix}`).digest().readUInt32BE(0);
    let ticket = hash("species") % totalWeight;
    const species = pool.find(candidate => { ticket -= candidate.spawnWeight; return ticket < 0; });
    if (!species) throw new Error("AURION_MONSTER_SPAWN_WEIGHT_INVALID");
    const level = species.levelMin + hash("level") % (species.levelMax - species.levelMin + 1);
    return Object.freeze({ slot, speciesId: species.speciesId, region, habitat: species.habitat, level, ...aurionMonsterCombatStats(species, level) });
  }));
}

/** Exact arbitrary-precision combat scaling: authored spawn bands are recommended
 * starting regions, not maximum monster or player levels.
 */
export function aurionMonsterCombatStatsExact(species: AurionMonsterSpecies, levelExact: string) {
  if (!/^[1-9][0-9]*$/.test(levelExact) || levelExact.length > 128) throw new Error("AURION_MONSTER_EXACT_LEVEL_INVALID");
  const level = BigInt(levelExact);
  if (level < BigInt(species.levelMin)) throw new Error("AURION_MONSTER_EXACT_LEVEL_INVALID");
  const hpBase = 110n + 33n * level + 3n * level * level + 5n * BigInt(species.ordinal);
  const attackBase = 1n + level / 3n + BigInt(species.ordinal % 5);
  const hp = hpBase * BigInt(healthScaleBps[species.family]) / 10000n;
  const attack = attackBase * BigInt(damageScaleBps[species.family]) / 10000n;
  const MAX = BigInt(Number.MAX_SAFE_INTEGER);
  const presentation = aurionMonsterCombatStats(species, species.levelMin);
  return Object.freeze({ ...presentation, levelExact: level.toString(),
    maxHealthExact: hp.toString(), attackBonusExact: attack.toString(),
    maxHealth: Number(hp > MAX ? MAX : hp), attackBonus: Number(attack > MAX ? MAX : attack),
    levelNumberProjectionExact: level <= MAX,
    statsNumberProjectionExact: hp <= MAX && attack <= MAX,
  });
}

/** Deterministic high-level authored-region scaling. Does not create actors or
 * bypass 10 Hz zone, collision, quest or persistence authority.
 */
export function planAurionScaledMonsterEncounter(region: AurionMonsterRegion, seed: string, count: number, baseLevelExact: string) {
  if (!/^[1-9][0-9]*$/.test(baseLevelExact) || baseLevelExact.length > 128) throw new Error("AURION_MONSTER_SCALE_LEVEL_INVALID");
  const baseLevel = BigInt(baseLevelExact);
  const planned = planAurionMonsterEncounter(region, seed, count);
  return Object.freeze(planned.map((entry) => {
    const species = requireAurionMonsterSpecies(entry.speciesId);
    const resolved = baseLevel + BigInt(entry.level) - 1n;
    const level = resolved < BigInt(species.levelMin) ? BigInt(species.levelMin) : resolved;
    const stats = aurionMonsterCombatStatsExact(species, level.toString());
    return Object.freeze({ ...entry, levelExact: level.toString(), ...stats });
  }));
}
