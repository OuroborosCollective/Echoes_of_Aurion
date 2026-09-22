import { z } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";

const HASH = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const BARE_HASH = z.string().regex(/^[a-f0-9]{64}$/);
const REVISION = z.string().regex(/^[a-f0-9]{40}$/);

export const AURION_QUEST_CAUSAL_ANCHOR_SCHEMA = "aurion.quest.causal-anchor.v1" as const;

export const QuestCausalAnchorSchema = z.object({
  schema: z.literal(AURION_QUEST_CAUSAL_ANCHOR_SCHEMA),
  questReceiptId: z.string().min(1).max(128),
  worldId: z.string().min(1).max(64),
  epoch: z.number().int().positive(),
  zoneId: z.string().min(1).max(128),
  tick: z.number().int().positive(),
  causalReceiptHash: HASH,
  sourceWorldRoot: HASH,
  sourceRevision: REVISION,
  rulesetVersion: z.string().min(1).max(64),
  sourceEvidenceId: z.string().min(1).max(128),
  sourceEvidenceDigest: BARE_HASH,
  sourceLogicalRevision: z.number().int().nonnegative(),
  triggerEventId: z.string().min(1).max(128),
  triggerEventDigest: z.string().min(1).max(128),
  compilerVersion: z.string().min(1).max(64),
  templateSetHash: z.string().regex(/^[a-f0-9]{64}$/),
  candidateSetHash: z.string().regex(/^[a-f0-9]{64}$/),
  seedDigest: z.string().regex(/^[a-f0-9]{64}$/),
  roleBindingHash: z.string().regex(/^[a-f0-9]{64}$/),
  commandId: HASH,
  planHash: z.string().regex(/^[a-f0-9]{64}$/),
  graphHash: z.string().regex(/^[a-f0-9]{64}$/),
  previousStateHash: z.string().regex(/^[a-f0-9]{64}$/),
  resultStateHash: z.string().regex(/^[a-f0-9]{64}$/),
  anchorHash: HASH,
}).strict();

export type QuestCausalAnchor = z.infer<typeof QuestCausalAnchorSchema>;

export function computeQuestCausalAnchorHash(
  value: Omit<QuestCausalAnchor, "anchorHash">,
): string {
  const normalized = QuestCausalAnchorSchema.omit({ anchorHash: true }).parse(value);
  return canonicalSha256({
    schema: AURION_QUEST_CAUSAL_ANCHOR_SCHEMA,
    ...normalized,
  });
}

export function createQuestCausalAnchor(
  value: Omit<QuestCausalAnchor, "anchorHash">,
): QuestCausalAnchor {
  const normalized = QuestCausalAnchorSchema.omit({ anchorHash: true }).parse(value);
  return QuestCausalAnchorSchema.parse({
    ...normalized,
    anchorHash: computeQuestCausalAnchorHash(normalized),
  });
}

export function verifyQuestCausalAnchor(value: QuestCausalAnchor): boolean {
  try {
    const normalized = QuestCausalAnchorSchema.parse(value);
    const { anchorHash, ...identity } = normalized;
    return anchorHash === computeQuestCausalAnchorHash(identity);
  } catch {
    return false;
  }
}
