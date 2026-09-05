import { parseOwnedEncounterReadback } from "@shared/encounterReadback";
import type { CompanionAction, CompanionStateMask, CompanionStateVector } from "./companionLearning";

export const WORLD_DEMONSTRATION_EVENT = "aurion:world-demonstration";
export function actionFromWorldIntent(input: unknown): CompanionAction | null {
  if (!input || typeof input !== "object" || !("kind" in input)) return null;
  if (input.kind === "move" && "x" in input && "z" in input && [-1, 0, 1].includes(input.x as number) && [-1, 0, 1].includes(input.z as number)) {
    const x = input.x as number, z = input.z as number;
    return x || z ? [(x + 1) / 2, (z + 1) / 2, 1, 1] : null;
  }
  if (input.kind === "action" && "command" in input && typeof input.command === "string" && /^[EF1-9]$/.test(input.command)) return [0.5, 0.5, 1, 1];
  return null;
}
/** Zero with mask=0 is unknown, never a claim of zero health or invented default health. */
export function observedWorldState(input: unknown, userId: number, fresh: boolean): { vector: CompanionStateVector; mask: CompanionStateMask } {
  const vector: CompanionStateVector = [0, 0, 0, 0, 0, 0];
  const mask: CompanionStateMask = [0, 0, 0, 0, 0, 0];
  if (fresh) {
    try { const current = parseOwnedEncounterReadback(input, userId).active; if (current) { vector[2] = current.bossHp / current.maxBossHp; mask[2] = 1; } }
    catch { /* Invalid/foreign data cannot label a demonstration. */ }
  }
  return { vector, mask };
}
