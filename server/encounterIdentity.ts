import { createHash } from "node:crypto";

/** Durable append order is read under the player row lock; wall time and entropy never enter the seed. */
export function encounterSessionIdentity(userId: number, ordinal: number, encounterKey: string): string {
  if (!Number.isSafeInteger(userId) || userId < 1 || !Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > 2_147_483_647 || !["asterion", "archive", "solarium", "cinder_vault"].includes(encounterKey)) throw new Error("INVALID_ENCOUNTER_IDENTITY_CONTEXT");
  return `game_${createHash("sha256").update(JSON.stringify(["aurion-encounter.v2", userId, ordinal, encounterKey])).digest("hex").slice(0, 48)}`;
}
export function encounterActionIdentity(sessionId: string, sequence: number): string {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(sessionId) || !Number.isSafeInteger(sequence) || sequence < 1 || sequence >= 2_147_483_647) throw new Error("INVALID_ACTION_IDENTITY_CONTEXT");
  return `gact_${createHash("sha256").update(JSON.stringify(["aurion-action.v2", sessionId, sequence])).digest("hex").slice(0, 48)}`;
}
