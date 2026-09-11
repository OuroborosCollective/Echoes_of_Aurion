export const AX1_ARMOR_MASTERY_SOURCE_REVISION = "286c575d3d0050ffa77b794d5b7a7e24858acee8" as const;
export const AX1_ARMOR_MASTERY_SOURCE_PATHS = Object.freeze([
  "src/data/mmorpgData.ts",
  "src/entities/OpenWorldPlayer.ts",
] as const);

export type Ax1ArmorMasteryType =
  | "shoulder"
  | "bracers"
  | "gloves"
  | "chest"
  | "shoes"
  | "legs"
  | "helmet"
  | "cape";

export type Ax1ArmorMasteryDefinition = Readonly<{
  type: Ax1ArmorMasteryType;
  name: string;
  initialLevel: 1;
  initialXp: 0;
  initialThresholdXp: 120;
  icon: string;
  description: string;
}>;

const mastery = (
  type: Ax1ArmorMasteryType,
  name: string,
  icon: string,
  description: string,
): Ax1ArmorMasteryDefinition => Object.freeze({
  type,
  name,
  initialLevel: 1,
  initialXp: 0,
  initialThresholdXp: 120,
  icon,
  description,
});

/**
 * Content identity imported from AX1 revision 286c575d... .
 *
 * Deliberately NOT imported from the AX1 player mutation code:
 * - local XP mutation
 * - local stat-point mutation
 * - local bonus-stat mutation
 * - the 1.45 exponential threshold multiplier
 *
 * Progression is authoritative Aurion state and must be advanced by confirmed
 * receipts/events. This module only preserves AX1's armor-mastery identity and UI content.
 */
export const AX1_ARMOR_MASTERIES = Object.freeze([
  mastery("shoulder", "Shoulder Armor Mastery", "🛡️", "Mastery of shoulder armor."),
  mastery("bracers", "Bracer Mastery", "🛡️", "Mastery of arm guards."),
  mastery("gloves", "Glove Mastery", "🧤", "Mastery of gloves."),
  mastery("chest", "Chestpiece Mastery", "🛡️", "Mastery of chest armor."),
  mastery("shoes", "Shoe Mastery", "🥾", "Mastery of shoes."),
  mastery("legs", "Legging Mastery", "👖", "Mastery of leg armor."),
  mastery("helmet", "Helmet Mastery", "🪖", "Mastery of helmets."),
  mastery("cape", "Cape Mastery", "🧥", "Mastery of capes."),
] as const);

export function ax1ArmorMasteryByType(type: string): Ax1ArmorMasteryDefinition | undefined {
  return AX1_ARMOR_MASTERIES.find(entry => entry.type === type);
}
