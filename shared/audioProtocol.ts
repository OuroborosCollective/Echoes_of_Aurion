/**
 * Aurion audio protocol v1.
 * Audio is presentation-only: events originate from confirmed local/server gameplay state.
 * No audio event is allowed to authorize gameplay, rewards, movement, or mutations.
 */

export const AURION_AUDIO_PROTOCOL_VERSION = "aurion-audio.v1" as const;

export type AudioCategory = "ambient" | "interaction" | "combat" | "movement" | "progression" | "resource" | "crafting";
export type AudioBiome = "tower" | "plains" | "forest" | "cave" | "city" | "wetland" | "stone_ruins" | "cinder_vault";
export type AudioSurface = "earth" | "grass" | "stone" | "wood" | "water";
export type AudioWeapon = "blade" | "staff" | "spear" | "focus" | "sharp" | "pointed" | "blunt";
export type AudioNpcVoice = "masculine" | "feminine" | "neutral";
export type AudioCreature = "wolf" | "human" | "monster";
export type AudioGatheringAction = "plant" | "wood" | "ore";
export type AudioCueId =
  | "ambient.tower"
  | "ambient.plains"
  | "ambient.forest"
  | "ambient.cave"
  | "ambient.city"
  | "ambient.wetland"
  | "ambient.stone_ruins"
  | "ambient.cinder_vault"
  | "interaction.npc.masculine"
  | "interaction.npc.feminine"
  | "interaction.npc.neutral"
  | "interaction.loot.screw_pouch"
  | "combat.monster"
  | "combat.magic"
  | "combat.spell.heal"
  | "combat.spell.buff"
  | "combat.attack.blade"
  | "combat.attack.staff"
  | "combat.attack.spear"
  | "combat.attack.focus"
  | "combat.attack.sharp"
  | "combat.attack.pointed"
  | "combat.attack.blunt"
  | "combat.creature.wolf.attack"
  | "combat.creature.human.attack"
  | "combat.creature.monster.attack"
  | "combat.creature.wolf.death"
  | "combat.creature.human.death"
  | "combat.creature.monster.death"
  | "movement.footstep.earth"
  | "movement.footstep.grass"
  | "movement.footstep.stone"
  | "movement.footstep.wood"
  | "movement.footstep.water"
  | "movement.run.earth"
  | "movement.run.grass"
  | "movement.run.stone"
  | "movement.run.wood"
  | "movement.run.water"
  | "resource.harvest.plant"
  | "resource.harvest.wood"
  | "resource.mine.ore"
  | "crafting.workbench.saw"
  | "progression.level_up";

export type AudioEvent =
  | { readonly cue: "ambient.tower" | "ambient.plains" | "ambient.forest" | "ambient.cave" | "ambient.city" | "ambient.wetland" | "ambient.stone_ruins" | "ambient.cinder_vault"; readonly category: "ambient"; readonly biome: AudioBiome; readonly intensity?: number }
  | { readonly cue: "interaction.npc.masculine" | "interaction.npc.feminine" | "interaction.npc.neutral"; readonly category: "interaction"; readonly voice: AudioNpcVoice }
  | { readonly cue: "interaction.loot.screw_pouch"; readonly category: "interaction"; readonly lootKind: "screw_pouch" }
  | { readonly cue: "combat.monster"; readonly category: "combat"; readonly monsterClass?: string }
  | { readonly cue: "combat.magic"; readonly category: "combat"; readonly element?: "resonance" | "fire" | "frost" | "void" }
  | { readonly cue: "combat.spell.heal" | "combat.spell.buff"; readonly category: "combat"; readonly spell: "heal" | "buff" }
  | { readonly cue: "combat.attack.blade" | "combat.attack.staff" | "combat.attack.spear" | "combat.attack.focus" | "combat.attack.sharp" | "combat.attack.pointed" | "combat.attack.blunt"; readonly category: "combat"; readonly weapon: AudioWeapon }
  | { readonly cue: "combat.creature.wolf.attack" | "combat.creature.human.attack" | "combat.creature.monster.attack" | "combat.creature.wolf.death" | "combat.creature.human.death" | "combat.creature.monster.death"; readonly category: "combat"; readonly creature: AudioCreature; readonly action: "attack" | "death" }
  | { readonly cue: "movement.footstep.earth" | "movement.footstep.grass" | "movement.footstep.stone" | "movement.footstep.wood" | "movement.footstep.water" | "movement.run.earth" | "movement.run.grass" | "movement.run.stone" | "movement.run.wood" | "movement.run.water"; readonly category: "movement"; readonly surface: AudioSurface; readonly stride?: number }
  | { readonly cue: "resource.harvest.plant" | "resource.harvest.wood" | "resource.mine.ore"; readonly category: "resource"; readonly resource: AudioGatheringAction }
  | { readonly cue: "crafting.workbench.saw"; readonly category: "crafting"; readonly station: "workbench" }
  | { readonly cue: "progression.level_up"; readonly category: "progression"; readonly level: number };

export function audioCueForFootstep(surface: AudioSurface): AudioEvent {
  return { cue: `movement.footstep.${surface}`, category: "movement", surface } as AudioEvent;
}

export function audioCueForWeapon(weapon: AudioWeapon): AudioEvent {
  return { cue: `combat.attack.${weapon}`, category: "combat", weapon } as AudioEvent;
}

export function audioCueForCreature(creature: AudioCreature, action: "attack" | "death"): AudioEvent {
  return { cue: `combat.creature.${creature}.${action}`, category: "combat", creature, action } as AudioEvent;
}

export function isAudioEvent(value: unknown): value is AudioEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<AudioEvent>;
  return typeof event.cue === "string" && typeof event.category === "string" && event.cue.startsWith(`${event.category}.`);
}
