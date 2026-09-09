import { z } from "zod";

export const encounterKeys = ["asterion", "archive", "solarium", "cinder_vault", "starfall_crater", "sunwatch_bastion"] as const;
export const encounterKeySchema = z.enum(encounterKeys);
export type EncounterKey = z.infer<typeof encounterKeySchema>;
const positive = z.number().int().positive().max(2_147_483_647);
export const encounterSessionSchema = z.object({
  id: z.string().min(8).max(64), userId: positive, encounterKey: encounterKeySchema,
  status: z.literal("active"), bossHp: positive, maxBossHp: positive, nextSequence: positive,
}).refine(session => session.bossHp <= session.maxBossHp, "INVALID_ENCOUNTER_HP");
export const encounterReadbackSchema = z.object({
  active: encounterSessionSchema.nullable(),
  encounters: z.array(z.object({ key: encounterKeySchema, name: z.string().min(1).max(128), enemyName: z.string().min(1).max(128), available: z.boolean() })).length(encounterKeys.length),
}).refine(value => new Set(value.encounters.map(encounter => encounter.key)).size === encounterKeys.length, "DUPLICATE_ENCOUNTER");
export function parseOwnedEncounterReadback(value: unknown, userId: number) {
  return encounterReadbackSchema.refine(value => !value.active || value.active.userId === userId, "ENCOUNTER_OWNER_MISMATCH").parse(value);
}
