import { z } from "zod";

export const AURION_QUEST_DOMAIN_COMMAND_SCHEMA = "aurion.quest-domain-command.v1" as const;

const commandIdentitySchema = z.object({
  schemaVersion: z.literal(AURION_QUEST_DOMAIN_COMMAND_SCHEMA),
  commandId: z.string().regex(/^[a-f0-9]{64}$/),
  instanceId: z.string().min(1).max(128),
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  graphHash: z.string().regex(/^[a-f0-9]{64}$/),
  expectedStateHash: z.string().regex(/^[a-f0-9]{64}$/),
  idempotencyKey: z.string().trim().min(1).max(128),
  eventSequence: z.number().int().nonnegative(),
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
  commandIdentitySchema.extend({ kind: z.literal("complete") }),
]);

export type QuestDomainCommand = z.infer<typeof QuestDomainCommandSchema>;
