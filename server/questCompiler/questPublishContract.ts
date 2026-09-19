import { z } from "zod";
import { QuestTemplateVersionSchema } from "../../shared/aurionQuestContract";
import { AURION_AUTHORING_SCHEMA } from "../../shared/aurionAuthoringContract";

const digest = z.string().regex(/^[a-f0-9]{64}$/);

export const QuestPublishPlanSchema = z.object({
  schemaVersion: z.literal(AURION_AUTHORING_SCHEMA),
  proposalId: z.string().min(8).max(128),
  expectedTemplateSetHash: digest,
  proposalReceiptHash: digest,
  template: QuestTemplateVersionSchema,
  templateHash: digest,
  planHash: digest,
  requiresHumanConfirmation: z.literal(true),
}).strict();

export type QuestPublishPlan = z.infer<typeof QuestPublishPlanSchema>;
