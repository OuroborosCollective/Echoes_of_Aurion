import type { GlbEquipmentSlot } from "@shared/glbImportContract";

/** Canonical presentation-only anchor aliases. Names are normalized before lookup. */
export const equipmentAnchorAliases: Readonly<Record<GlbEquipmentSlot, readonly string[]>> = Object.freeze({
  weapon: ["aurionslotmainhand", "aurionslotweapon", "socketweaponr", "slotmainhand", "slotweaponr", "slothandr", "handr", "righthand"],
  shield: ["aurionslotshield", "aurionslotoffhand", "socketweaponl", "slotshield", "slotoffhand", "slothandl", "handl", "lefthand"],
  helmet: ["aurionslothead", "sockethead", "slothead", "head"],
  chest: ["aurionslotchest", "socketchest", "slotchest", "upperchest", "chest", "spine2", "spine"],
  shoulders: ["aurionslotshoulders", "socketshoulders", "slotshoulders", "upperchest", "spine2", "spine"],
  arms: ["aurionslotarms", "socketarms", "slotarms", "upperchest", "spine2", "spine"],
  legs: ["aurionslotlegs", "socketlegs", "slotlegs", "pelvis", "hips"],
  boots: ["aurionslotboots", "socketboots", "slotboots", "pelvis", "hips"],
});

/** Maximum visual dimension as a fraction of the normalized avatar height. */
export const equipmentTargetHeightFraction: Readonly<Record<GlbEquipmentSlot, number>> = Object.freeze({
  weapon: 0.75,
  shield: 0.55,
  helmet: 0.32,
  chest: 0.65,
  shoulders: 0.70,
  arms: 0.55,
  legs: 0.65,
  boots: 0.42,
});

/**
 * Converts a world-space size budget into the local scale required under an
 * animated attachment node. This prevents source-unit drift (cm/m/etc.) from
 * making equipment larger than the avatar while keeping the rule presentation-only.
 */
export function equipmentLocalScale(
  slot: GlbEquipmentSlot,
  visualMaxDimension: number,
  avatarHeightMeters: number,
  anchorWorldScale: number,
): number | null {
  if (![visualMaxDimension, avatarHeightMeters, anchorWorldScale].every(Number.isFinite)) return null;
  if (visualMaxDimension <= 0.000001 || avatarHeightMeters <= 0.1 || anchorWorldScale <= 0.000001) return null;
  const targetWorldDimension = avatarHeightMeters * equipmentTargetHeightFraction[slot];
  const localScale = targetWorldDimension / (visualMaxDimension * anchorWorldScale);
  if (!Number.isFinite(localScale) || localScale <= 0) return null;
  return Math.min(1000, Math.max(0.001, localScale));
}
