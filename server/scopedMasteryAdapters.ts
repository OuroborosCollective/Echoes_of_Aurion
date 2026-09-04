import type { LivingWorldSocialAction } from "./ax1LivingWorldProtocol";
import type { ClasslessWeaponTrack } from "./ax1ClasslessItemization";
import { masteryKeys, scopedMasteryKey, type ScopedMasteryKey } from "./scopedMasteryProtocol";

/** Compatibility mapping: old fixed discipline surfaces become scoped keys, not a second progression engine. */
export function legacyDisciplineMasteryKey(disciplineId: string): ScopedMasteryKey {
  if (disciplineId.endsWith("_armor_mastery")) return scopedMasteryKey("item", disciplineId);
  if (disciplineId.endsWith("_mastery")) return masteryKeys.weapon(disciplineId.slice(0, -"_mastery".length));
  if (["woodworking", "smithing", "weaving", "alchemy", "rune_crafting", "shaping"].includes(disciplineId)) return masteryKeys.profession(disciplineId);
  if (["council", "administration", "sovereignty", "diplomacy", "stewardship"].includes(disciplineId)) return masteryKeys.politics(disciplineId);
  if (disciplineId.endsWith("_magic")) return scopedMasteryKey("action", disciplineId);
  return scopedMasteryKey("action", disciplineId);
}

export function classlessWeaponMasteryKey(track: ClasslessWeaponTrack): ScopedMasteryKey {
  return masteryKeys.weapon(track);
}

export function livingWorldSocialMasteryKeys(action: LivingWorldSocialAction, subjectId?: string): readonly ScopedMasteryKey[] {
  const keys: ScopedMasteryKey[] = [masteryKeys.social(action)];
  if (subjectId) keys.push(action === "politics" || action === "leadership" ? masteryKeys.faction(subjectId) : masteryKeys.npcRelation(subjectId));
  return Object.freeze(keys);
}

export function craftingMasteryKeys(professionId: string, recipeId: string, itemId?: string): readonly ScopedMasteryKey[] {
  const keys: ScopedMasteryKey[] = [masteryKeys.profession(professionId), masteryKeys.recipe(recipeId)];
  if (itemId) keys.push(masteryKeys.item(itemId));
  return Object.freeze(keys);
}
