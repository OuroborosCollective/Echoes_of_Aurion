import { z } from "zod";
import { computeCanonicalHash } from "./aurionQuestCanonicalHash";
import { encounterKeySchema } from "./encounterReadback";

export const legacyQuestKeys = [
  "astral_call",
  "archive_of_echoes",
  "ember_key",
  "starfall_resonance",
  "clockwork_core",
  "sunwatch_vanguard",
] as const;

export const legacyQuestKeySchema = z.enum(legacyQuestKeys);
export type LegacyQuestKey = z.infer<typeof legacyQuestKeySchema>;

const positiveInt = z.number().int().positive().max(2_147_483_647);

export const legacyQuestBridgeSchema = z.object({
  key: legacyQuestKeySchema,
  giver: z.enum(["Lyra", "Orun"]),
  title: z.string().min(1).max(160),
  objective: z.string().min(1).max(1_000),
  requiredLevel: positiveInt,
  requires: legacyQuestKeySchema.nullable(),
  reward: z.object({
    xp: z.number().int().nonnegative().max(1_000_000),
    points: z.number().int().nonnegative().max(1_000_000),
    dungeonKey: z.literal("ember_key").optional(),
  }).strict(),
  encounterKey: encounterKeySchema,
  eventBinding: z.object({
    source: z.literal("encounter"),
    event: z.literal("completed"),
    matchField: z.literal("encounterKey"),
    matchValue: encounterKeySchema,
  }).strict(),
}).strict();

export type LegacyQuestBridge = z.infer<typeof legacyQuestBridgeSchema>;

export const encounterCompletionEvidenceSchema = z.object({
  schema: z.literal("aurion.encounter.completion.v1"),
  eventId: z.string().regex(/^evt_encounter_complete_[A-Za-z0-9_-]{8,64}$/),
  sessionId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  userId: positiveInt,
  encounterKey: encounterKeySchema,
  completionSequence: positiveInt,
  finalActionReceiptId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/),
  finalBossHp: z.literal(0),
  maxBossHp: positiveInt,
  actionCount: positiveInt,
  actionChainHash: z.string().regex(/^[a-f0-9]{64}$/),
  evidenceHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type EncounterCompletionEvidence = z.infer<typeof encounterCompletionEvidenceSchema>;

export const encounterCompletionEvidenceIdentitySchema = encounterCompletionEvidenceSchema.omit({ evidenceHash: true });

export function computeEncounterCompletionEvidenceHash(
  identity: z.infer<typeof encounterCompletionEvidenceIdentitySchema>,
): string {
  return computeCanonicalHash("aurion.encounter.completion.v1", identity);
}

export function verifyEncounterCompletionEvidenceIdentity(value: EncounterCompletionEvidence): boolean {
  const normalized = encounterCompletionEvidenceSchema.parse(value);
  const { evidenceHash, ...identity } = normalized;
  return normalized.eventId === `evt_encounter_complete_${normalized.sessionId}`
    && evidenceHash === computeEncounterCompletionEvidenceHash(
      encounterCompletionEvidenceIdentitySchema.parse(identity),
    );
}
