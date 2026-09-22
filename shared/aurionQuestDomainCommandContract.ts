import { z } from "zod";

export const AURION_QUEST_DOMAIN_COMMAND_SCHEMA = "aurion.quest-domain-command.v1" as const;

const HASH64 = z.string().regex(/^[a-f0-9]{64}$/);
const REVISION = z.string().regex(/^[a-f0-9]{40}$/);

const commandIdentitySchema = z.object({
  schemaVersion: z.literal(AURION_QUEST_DOMAIN_COMMAND_SCHEMA),
  commandId: z.string().regex(/^[a-f0-9]{64}$/),
  instanceId: z.string().min(1).max(128),
  planHash: HASH64,
  graphHash: HASH64,
  expectedStateHash: HASH64,
  idempotencyKey: z.string().trim().min(1).max(128),
  eventSequence: z.number().int().nonnegative(),
}).strict();

const completeSourceSchema = z.object({
  triggerEventId: z.string().min(1).max(128),
  triggerEventDigest: z.string().min(1).max(128),
  sourceEvidenceId: z.string().min(1).max(128),
  sourceEvidenceDigest: HASH64,
  sourceLogicalRevision: z.number().int().nonnegative(),
  compilerVersion: z.string().min(1).max(64),
  sourceRevision: REVISION,
  templateSetHash: HASH64,
  candidateSetHash: HASH64,
  seedDigest: HASH64,
  roleBindingHash: HASH64,
}).strict();

export const QuestDomainCommandSchema = z.discriminatedUnion("kind", [
  commandIdentitySchema.extend({ kind: z.literal("accept") }),
  commandIdentitySchema.extend({
    kind: z.literal("progress"),
    objectiveKey: z.string().trim().min(1).max(128),
    amount: z.number().int().min(1).max(1_000),
  }),
  commandIdentitySchema.extend({
    kind: z.literal("choice"),
    edgeId: z.string().trim().min(1).max(96),
  }),
  commandIdentitySchema.extend({
    kind: z.literal("complete"),
    ...completeSourceSchema.shape,
  }),
]);

export type QuestDomainCommand = z.infer<typeof QuestDomainCommandSchema>;
export type QuestCompleteSource = z.infer<typeof completeSourceSchema>;
