import { wasdGlbCatalog, wasdGlbCatalogSummary, wasdGlbSourceRevision } from "./wasdGlbCatalog";
import { aurionApiOrigin } from "./runtimeConfig";

const staticDistribution = import.meta.env.VITE_AURION_STATIC_DISTRIBUTION === "true";

export function hasAurionApi(): boolean {
  return !staticDistribution || Boolean(aurionApiOrigin());
}

function resolveAurionAsset(filename: string, manuscriptPath: string): string {
  if (!staticDistribution) return manuscriptPath;
  if (typeof window !== "undefined" && window.location.hostname === "arelogic.space") return `/aurion-assets/${filename}`;
  return `${import.meta.env.BASE_URL}aurion-assets/${filename}`;
}

function resolveOnlineAsset(path: string): string {
  if (!staticDistribution || !aurionApiOrigin()) return path;
  return `${aurionApiOrigin()}${path}`;
}

export const aurionAssets = {
  expeditionTheme: resolveAurionAsset("ambient-forest.wav", "/audio/ambient-forest.wav"),
  audio: {
    tower: resolveAurionAsset("ambient-tower.wav", "/audio/ambient-tower.wav"),
    plains: resolveAurionAsset("ambient-plains.wav", "/audio/ambient-plains.wav"),
    forest: resolveAurionAsset("ambient-forest-world.wav", "/audio/ambient-forest-world.wav"),
    cave: resolveAurionAsset("ambient-cave-world.wav", "/audio/ambient-cave-world.wav"),
    city: resolveAurionAsset("ambient-city-world.wav", "/audio/ambient-city-world.wav"),
    boss: resolveAurionAsset("ambient-boss-dungeon-world.wav", "/audio/ambient-boss-dungeon-world.wav"),
    cinderVault: resolveAurionAsset("ambient-cinder-vault.wav", "/audio/ambient-cinder-vault.wav"),
    sfx: {
      "combat.attack.sharp": resolveAurionAsset("combat-attack-sharp.wav", "/audio/sfx/combat-attack-sharp.wav"),
      "combat.attack.pointed": resolveAurionAsset("combat-attack-pointed.wav", "/audio/sfx/combat-attack-pointed.wav"),
      "combat.attack.blunt": resolveAurionAsset("combat-attack-blunt.wav", "/audio/sfx/combat-attack-blunt.wav"),
      "combat.spell.heal": resolveAurionAsset("combat-spell-heal.wav", "/audio/sfx/combat-spell-heal.wav"),
      "combat.spell.buff": resolveAurionAsset("combat-spell-buff.wav", "/audio/sfx/combat-spell-buff.wav"),
      "combat.creature.wolf.attack": resolveAurionAsset("combat-creature-wolf-attack.wav", "/audio/sfx/combat-creature-wolf-attack.wav"),
      "combat.creature.human.attack": resolveAurionAsset("combat-creature-human-attack.wav", "/audio/sfx/combat-creature-human-attack.wav"),
      "combat.creature.monster.attack": resolveAurionAsset("combat-creature-monster-attack.wav", "/audio/sfx/combat-creature-monster-attack.wav"),
      "combat.creature.wolf.death": resolveAurionAsset("combat-creature-wolf-death.wav", "/audio/sfx/combat-creature-wolf-death.wav"),
      "combat.creature.human.death": resolveAurionAsset("combat-creature-human-death.wav", "/audio/sfx/combat-creature-human-death.wav"),
      "combat.creature.monster.death": resolveAurionAsset("combat-creature-monster-death.wav", "/audio/sfx/combat-creature-monster-death.wav"),
      "movement.run.earth": resolveAurionAsset("movement-run-earth.wav", "/audio/sfx/movement-run-earth.wav"),
      "movement.run.grass": resolveAurionAsset("movement-run-grass.wav", "/audio/sfx/movement-run-grass.wav"),
      "movement.run.stone": resolveAurionAsset("movement-run-stone.wav", "/audio/sfx/movement-run-stone.wav"),
      "movement.run.wood": resolveAurionAsset("movement-run-wood.wav", "/audio/sfx/movement-run-wood.wav"),
      "movement.run.water": resolveAurionAsset("movement-run-water.wav", "/audio/sfx/movement-run-water.wav"),
      "interaction.loot.screw_pouch": resolveAurionAsset("interaction-loot-screw-pouch.wav", "/audio/sfx/interaction-loot-screw-pouch.wav"),
      "resource.harvest.plant": resolveAurionAsset("resource-harvest-plant.wav", "/audio/sfx/resource-harvest-plant.wav"),
      "resource.harvest.wood": resolveAurionAsset("resource-harvest-wood.wav", "/audio/sfx/resource-harvest-wood.wav"),
      "resource.mine.ore": resolveAurionAsset("resource-mine-ore.wav", "/audio/sfx/resource-mine-ore.wav"),
      "crafting.workbench.saw": resolveAurionAsset("crafting-workbench-saw.wav", "/audio/sfx/crafting-workbench-saw.wav"),
    },
  },
  trailer: resolveAurionAsset("aurion-hero-trailer-en-de_c44ee2e1.mp4", "/manus-storage/aurion-hero-trailer-en-de_c44ee2e1.mp4"),
  trailerPoster: resolveAurionAsset("aurion-social-keyframe_5edc4882.png", "/manus-storage/aurion-social-keyframe_5edc4882.png"),
  expanseReference: resolveOnlineAsset("/manus-storage/aurion-expanse-windhollow-reference_fed3662e.jpg"),
  terrain: {
    grass: resolveOnlineAsset("/manus-storage/aurion-terrain-grass_811245e1.png"),
    flowerMeadow: resolveOnlineAsset("/manus-storage/aurion-terrain-flower-meadow_c5078eb0.png"),
    earth: resolveOnlineAsset("/manus-storage/aurion-terrain-earth_f53862cb.png"),
    farmland: resolveOnlineAsset("/manus-storage/aurion-terrain-farmland_2c4edf2e.png"),
    gardenParcels: resolveOnlineAsset("/manus-storage/aurion-terrain-garden-parcels_8810616b.png"),
    starpath: resolveOnlineAsset("/manus-storage/aurion-terrain-starpath_37c69d4b.png"),
    starpathCrossing: resolveOnlineAsset("/manus-storage/aurion-terrain-starpath-crossing_ead3a305.png"),
  },
  wasdGlb: {
    sourceRevision: wasdGlbSourceRevision,
    summary: wasdGlbCatalogSummary,
    catalog: wasdGlbCatalog,
    streamable: wasdGlbCatalog.filter(asset => asset.budgetStatus === "streamable"),
  },
} as const;
