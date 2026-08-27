/**
 * Aurion audio protocol v1.
 * Audio is presentation-only: events originate from confirmed local/server gameplay state.
 * No audio event is allowed to authorize gameplay, rewards, movement, or mutations.
 */

export const AURION_AUDIO_PROTOCOL_VERSION = "aurion-audio.v1" as const;

export type AudioCategory = "ambient" | "interaction" | "combat" | "movement" | "progression";
export type AudioBiome = "tower" | "plains" | "forest" | "wetland" | "stone_ruins" | "cinder_vault";
export type AudioSurface = "earth" | "grass" | "stone" | "wood" | "water";
export type AudioWeapon = "blade" | "staff" | "spear" | "focus";
export type AudioNpcVoice = "masculine" | "feminine" | "neutral";
export type AudioCueId =
  | "ambient.tower"
  | "ambient.plains"
  | "ambient.forest"
  | "ambient.wetland"
  | "ambient.stone_ruins"
  | "ambient.cinder_vault"
  | "interaction.npc.masculine"
  | "interaction.npc.feminine"
  | "interaction.npc.neutral"
  | "combat.monster"
  | "combat.magic"
  | "combat.attack.blade"
  | "combat.attack.staff"
  | "combat.attack.spear"
  | "combat.attack.focus"
  | "movement.footstep.earth"
  | "movement.footstep.grass"
  | "movement.footstep.stone"
  | "movement.footstep.wood"
  | "movement.footstep.water"
  | "progression.level_up";

export type AudioEvent =
  | { readonly cue: "ambient.tower" | "ambient.plains" | "ambient.forest" | "ambient.wetland" | "ambient.stone_ruins" | "ambient.cinder_vault"; readonly category: "ambient"; readonly biome: AudioBiome; readonly intensity?: number }
  | { readonly cue: "interaction.npc.masculine" | "interaction.npc.feminine" | "interaction.npc.neutral"; readonly category: "interaction"; readonly voice: AudioNpcVoice }
  | { readonly cue: "combat.monster"; readonly category: "combat"; readonly monsterClass?: string }
  | { readonly cue: "combat.magic"; readonly category: "combat"; readonly element?: "resonance" | "fire" | "frost" | "void" }
  | { readonly cue: "combat.attack.blade" | "combat.attack.staff" | "combat.attack.spear" | "combat.attack.focus"; readonly category: "combat"; readonly weapon: AudioWeapon }
  | { readonly cue: "movement.footstep.earth" | "movement.footstep.grass" | "movement.footstep.stone" | "movement.footstep.wood" | "movement.footstep.water"; readonly category: "movement"; readonly surface: AudioSurface; readonly stride?: number }
  | { readonly cue: "progression.level_up"; readonly category: "progression"; readonly level: number };

export function audioCueForFootstep(surface: AudioSurface): AudioEvent {
  return { cue: `movement.footstep.${surface}`, category: "movement", surface } as AudioEvent;
}

export function audioCueForWeapon(weapon: AudioWeapon): AudioEvent {
  return { cue: `combat.attack.${weapon}`, category: "combat", weapon } as AudioEvent;
}

export function isAudioEvent(value: unknown): value is AudioEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<AudioEvent>;
  return typeof event.cue === "string" && typeof event.category === "string" && event.cue.startsWith(`${event.category}.`);
}
