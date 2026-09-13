import * as THREE from "three";
import type { GlbEquipmentSlot } from "@shared/glbImportContract";

/** Canonical presentation-only anchor aliases. Names are normalized before lookup. */
export const equipmentAnchorAliases: Readonly<Record<GlbEquipmentSlot, readonly string[]>> = Object.freeze({
  weapon: [
    "aurionslotmainhand", "aurionslotweapon", "socketweaponr", "slotmainhand", "slotweaponr", "slothandr",
    "handr", "righthand", "rightwrist", "wristr", "rightpalm", "palmr", "mixamorigrighthand",
    "bip001rhand", "bip01rhand", "biprhand", "ccbaserhand", "jbiprhand",
  ],
  shield: [
    "aurionslotshield", "aurionslotoffhand", "socketweaponl", "slotshield", "slotoffhand", "slothandl",
    "handl", "lefthand", "leftwrist", "wristl", "leftpalm", "palml", "mixamoriglefthand",
    "bip001lhand", "bip01lhand", "biplhand", "ccbaselhand", "jbiplhand",
  ],
  helmet: ["aurionslothead", "sockethead", "slothead", "head", "mixamorighead", "ccbasehead", "jbiphead"],
  chest: ["aurionslotchest", "socketchest", "slotchest", "upperchest", "chest", "spine2", "spine", "mixamorigspine2", "ccbasespine02"],
  shoulders: ["aurionslotshoulders", "socketshoulders", "slotshoulders", "upperchest", "spine2", "spine", "mixamorigspine2", "ccbasespine02"],
  arms: ["aurionslotarms", "socketarms", "slotarms", "upperchest", "spine2", "spine", "mixamorigspine2", "ccbasespine02"],
  legs: ["aurionslotlegs", "socketlegs", "slotlegs", "pelvis", "hips", "mixamorighips", "ccbasehip", "jbiphips"],
  boots: ["aurionslotboots", "socketboots", "slotboots", "pelvis", "hips", "mixamorighips", "ccbasehip", "jbiphips"],
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

const normalizeNodeName = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Asset-authored origin nodes let Blender exports define the exact grip/body
 * point that must land on the actor socket. This remains presentation-only.
 */
export const equipmentAttachmentOriginAliases: Readonly<Record<GlbEquipmentSlot, readonly string[]>> = Object.freeze({
  weapon: ["aurionattachmentorigin", "aurionequipmentorigin", "aurionweaponorigin", "aurionmainhandorigin"],
  shield: ["aurionattachmentorigin", "aurionequipmentorigin", "aurionshieldorigin", "aurionoffhandorigin"],
  helmet: ["aurionattachmentorigin", "aurionequipmentorigin", "aurionhelmetorigin", "aurionheadorigin"],
  chest: ["aurionattachmentorigin", "aurionequipmentorigin", "aurionchestorigin"],
  shoulders: ["aurionattachmentorigin", "aurionequipmentorigin", "aurionshouldersorigin"],
  arms: ["aurionattachmentorigin", "aurionequipmentorigin", "aurionarmsorigin"],
  legs: ["aurionattachmentorigin", "aurionequipmentorigin", "aurionlegsorigin"],
  boots: ["aurionattachmentorigin", "aurionequipmentorigin", "aurionbootsorigin"],
});

function findAuthoredAttachmentOrigin(slot: GlbEquipmentSlot, visual: THREE.Object3D): THREE.Object3D | null {
  const aliases = new Set(equipmentAttachmentOriginAliases[slot]);
  let found: THREE.Object3D | null = null;
  visual.traverse(node => {
    if (found || !node.name) return;
    if (aliases.has(normalizeNodeName(node.name))) found = node;
  });
  return found;
}

/**
 * Returns the local translation to apply after uniform scaling so the authored
 * attachment origin lands on the runtime socket. Legacy assets without an
 * explicit origin keep the previous bounds-centering behavior byte-for-byte.
 */
export function equipmentAttachmentOffset(
  slot: GlbEquipmentSlot,
  visual: THREE.Group,
  bounds: THREE.Box3,
  scale: number,
): THREE.Vector3 | null {
  if (!Number.isFinite(scale) || scale <= 0 || bounds.isEmpty()) return null;
  visual.updateMatrixWorld(true);
  const origin = findAuthoredAttachmentOrigin(slot, visual);
  if (origin) {
    origin.updateWorldMatrix(true, false);
    const localOrigin = visual.worldToLocal(origin.getWorldPosition(new THREE.Vector3()));
    if (![localOrigin.x, localOrigin.y, localOrigin.z].every(Number.isFinite)) return null;
    return localOrigin.multiplyScalar(-scale);
  }
  return bounds.getCenter(new THREE.Vector3()).multiplyScalar(-scale);
}

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
