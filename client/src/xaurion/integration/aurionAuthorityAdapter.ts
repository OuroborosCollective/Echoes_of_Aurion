import type { MMOEngine } from "../core/MMOEngine";
import type { CharacterClassId } from "../types";
import { attachAurionWorldCore } from "./aurionWorldCore";

export type AurionPlayerClass = "vanguard" | "seer" | "warden";
export type AurionQuestKey = "astral_call" | "archive_of_echoes" | "ember_key";
export type AurionGameplayCommand = "1" | "2" | "3" | "4" | "5" | "E";
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
export function aurionCommandForAx1Key(key: string, code: string): AurionGameplayCommand | null {
  if (key === "1" || key === "2" || key === "3" || key === "4" || key === "5") return key;
  if (code === "Space") return "3";
  if (key === "f") return "E";
  return null;
}

export function isAx1LocalGameplayMutationKey(key: string, code: string): boolean {
  return aurionCommandForAx1Key(key, code) !== null || key === "z";
}

/**
 * The imported engine remains the input/render implementation, while durable
 * gameplay writes are delegated to Aurion. This is intentionally instance-
 * scoped so standalone -ax1 source remains available for later migration.
 */
export function bindAurionAuthorityProjection(
  engine: MMOEngine,
  handlers: {
    requestAction: (command: AurionGameplayCommand) => void;
    requestMount: () => void;
  },
): void {
  const player = engine.player;
  const reject = { success: false, message: "Aurion server authority is required for this action." } as const;
  const worldCore = attachAurionWorldCore(engine);
  const baseStop = engine.stop.bind(engine);
  let worldCoreStopped = false;
  engine.stop = () => {
    if (!worldCoreStopped) {
      worldCoreStopped = true;
      worldCore.stop();
    }
    baseStop();
  };

  engine.castClassSkill = index => {
    if (index >= 0 && index < 5) handlers.requestAction(String(index + 1) as AurionGameplayCommand);
  };
  engine.toggleMount = () => handlers.requestMount();
  engine.interactNearby = () => {
    if (engine.nearbyNPC) return { npcOpened: engine.nearbyNPC };
    if (engine.nearbyLoot) handlers.requestAction("E");
    return {};
  };
  engine.equipItem = () => null;
  engine.unequipItem = () => null;

  player.takeDamage = () => ({ damageTaken: 0, isDead: false, dodged: false });
  player.heal = () => {};
  player.restoreResource = () => {};
  player.consumeResource = () => false;
  player.gainXp = () => false;
  player.useConsumable = () => {};
  player.toggleMount = () => player.stats.isMounted;
  player.equipItem = () => null;
  player.unequipItem = () => null;
  player.unequipSlot = () => null;
  player.allocateStatPoint = () => reject;
  player.unlockMilestoneSkill = () => reject;
  player.equipSkillToHotbar = () => {};
}
