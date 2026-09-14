export const SHARED_HUMANOID_RIG_VERSION = "quaternius-universal-65-v1" as const;
export type SharedHumanoidRigVersion = typeof SHARED_HUMANOID_RIG_VERSION;

/**
 * Presentation-only rig contract for the owner-supplied CC0 Universal Base
 * Characters + Modular Character Outfits family. Ordered joint identity is
 * intentionally strict: a merely similar skeleton must fail closed.
 *
 * This contract grants no gameplay, inventory, equipment or progression
 * authority. It only permits render-side skin rebinding after the server has
 * already confirmed an equipment visual through the canonical GLB catalog.
 */
export const SHARED_HUMANOID_RIG_JOINTS = Object.freeze([
  "root", "pelvis", "spine_01", "spine_02", "spine_03", "neck_01", "Head",
  "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
  "index_01_l", "index_02_l", "index_03_l", "index_04_leaf_l",
  "middle_01_l", "middle_02_l", "middle_03_l", "middle_04_leaf_l",
  "pinky_01_l", "pinky_02_l", "pinky_03_l", "pinky_04_leaf_l",
  "ring_01_l", "ring_02_l", "ring_03_l", "ring_04_leaf_l",
  "thumb_01_l", "thumb_02_l", "thumb_03_l", "thumb_04_leaf_l",
  "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r",
  "index_01_r", "index_02_r", "index_03_r", "index_04_leaf_r",
  "middle_01_r", "middle_02_r", "middle_03_r", "middle_04_leaf_r",
  "pinky_01_r", "pinky_02_r", "pinky_03_r", "pinky_04_leaf_r",
  "ring_01_r", "ring_02_r", "ring_03_r", "ring_04_leaf_r",
  "thumb_01_r", "thumb_02_r", "thumb_03_r", "thumb_04_leaf_r",
  "thigh_l", "calf_l", "foot_l", "ball_l", "ball_leaf_l",
  "thigh_r", "calf_r", "foot_r", "ball_r", "ball_leaf_r",
] as const);

export const SHARED_HUMANOID_RIG_JOINT_DIGEST = "e993e496e339d79f4eb0c51c018d36b724f0e27afcec0095604c35737d06099e" as const;

export function matchesSharedHumanoidRigJointNames(names: readonly string[]): boolean {
  return names.length === SHARED_HUMANOID_RIG_JOINTS.length
    && names.every((name, index) => name === SHARED_HUMANOID_RIG_JOINTS[index]);
}
