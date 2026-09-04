import type { CharacterClassId } from "../types";

export type AurionPlayerClass = "vanguard" | "seer" | "warden";
export type AurionQuestKey = "astral_call" | "archive_of_echoes" | "ember_key";
export type AurionZoneMovementInput = { x: -1 | 0 | 1; z: -1 | 0 | 1 };

const quantizeAxis = (value: number): -1 | 0 | 1 => value > 0.15 ? 1 : value < -0.15 ? -1 : 0;

/**
 * Uses the same camera-relative basis as -ax1 MMOEngine. Aurion receives only
 * a direction intent; authoritative coordinates continue to come from the
 * zone snapshot.
 */
export function ax1MovementToAurionIntent(cameraYaw: number, forward: number, right: number): AurionZoneMovementInput {
  const forwardX = -Math.sin(cameraYaw);
  const forwardZ = -Math.cos(cameraYaw);
  const rightX = Math.cos(cameraYaw);
  const rightZ = -Math.sin(cameraYaw);
  return {
    x: quantizeAxis(forward * forwardX + right * rightX),
    z: quantizeAxis(forward * forwardZ + right * rightZ),
  };
}

export function aurionClassForAx1(classId: CharacterClassId): AurionPlayerClass | null {
  if (classId === "knight") return "vanguard";
  if (classId === "mage") return "seer";
  if (classId === "ranger") return "warden";
  return null;
}

export function aurionQuestKey(value: string): AurionQuestKey | null {
  return value === "astral_call" || value === "archive_of_echoes" || value === "ember_key" ? value : null;
}

/** Preserve -ax1 key semantics while preventing the engine from committing local gameplay truth. */
export function aurionCommandForAx1Key(key: string, code: string): "1" | "2" | "3" | "4" | "5" | "E" | null {
  if (key === "1" || key === "2" || key === "3" || key === "4" || key === "5") return key;
  if (code === "Space") return "3";
  if (key === "f") return "E";
  return null;
}

export function isAx1LocalGameplayMutationKey(key: string, code: string): boolean {
  return aurionCommandForAx1Key(key, code) !== null || key === "z";
}
