import { WASD_GAMEPLAY_SOURCE_REVISION } from "./wasdAREDeterminism";

/** Exact bounded port of Wasd StaminaRegen.tick. */
export const WASD_STAMINA_SOURCE_REVISION = WASD_GAMEPLAY_SOURCE_REVISION;
export const WASD_STAMINA_SOURCE_PATH = "server/src/modules/player/StaminaRegen.ts" as const;
export const WASD_STAMINA_SOURCE_GIT_BLOB_SHA = "079e410f2a287070055ce173e27c6a1442abacd4" as const;
export const WASD_MAX_STAMINA = 100 as const;
export function regenerateWasdStamina(stamina:number):number{return Math.min(WASD_MAX_STAMINA,(Number.isFinite(stamina)?stamina:0)+1);}
