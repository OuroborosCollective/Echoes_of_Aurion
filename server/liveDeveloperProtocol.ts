import { createHash } from "node:crypto";
import { z } from "zod";

export const LIVE_DEVELOPER_CHANGE_KINDS = ["world", "quest", "npc_behavior", "content_model"] as const;
export type LiveDeveloperChangeKind = (typeof LIVE_DEVELOPER_CHANGE_KINDS)[number];

export const LiveDeveloperOperationSchema = z.object({
  action: z.enum(["add", "adjust"]),
  target: z.string().trim().min(3).max(96),
  summary: z.string().trim().min(8).max(280),
  constraints: z.array(z.string().trim().min(3).max(120)).max(6),
});

export const LiveDeveloperProposalSchema = z.object({
  kind: z.enum(LIVE_DEVELOPER_CHANGE_KINDS),
  title: z.string().trim().min(6).max(120),
  summary: z.string().trim().min(24).max(600),
  operations: z.array(LiveDeveloperOperationSchema).min(1).max(6),
  gameplayImpact: z.string().trim().min(12).max(360),
  reviewNotes: z.array(z.string().trim().min(4).max(180)).min(1).max(6),
  requiresHumanReview: z.literal(true),
});

export type LiveDeveloperProposal = z.infer<typeof LiveDeveloperProposalSchema>;

export function validateLiveDeveloperProposal(value: unknown): LiveDeveloperProposal {
  return LiveDeveloperProposalSchema.parse(value);
}

export function buildLiveDeveloperGuardrails() {
  return [
    "Generate a review-only proposal, never an instruction to edit code, files, secrets, infrastructure, or databases.",
    "Use only the supplied change kind and the allowed add/adjust operation actions.",
    "Keep all gameplay changes bounded to Aurion world content, quest content, NPC behavior, or content-model specifications.",
    "Every proposal must require human review before any application.",
  ].join(" ");
}


const GAME_DEV_DESIGN_PURPOSES = [
  "npc-fallback",
  "world-environment",
  "world-nature",
  "player-public",
  "equipment",
] as const;

export const GameDevAssetDesignWorkOrderSchema = z.object({
  title: z.string().trim().min(6).max(120),
  suggestedDisplayName: z.string().trim().min(3).max(120),
  suggestedPurpose: z.enum(GAME_DEV_DESIGN_PURPOSES),
  designIntent: z.string().trim().min(24).max(800),
  acceptanceCriteria: z.array(z.string().trim().min(6).max(180)).min(1).max(8),
  riskNotes: z.array(z.string().trim().min(4).max(180)).max(8),
  requiresHumanReview: z.literal(true),
}).strict();

export type GameDevAssetDesignWorkOrder = z.infer<typeof GameDevAssetDesignWorkOrderSchema>;

export function validateGameDevAssetDesignWorkOrder(value: unknown): GameDevAssetDesignWorkOrder {
  return GameDevAssetDesignWorkOrderSchema.parse(value);
}

export function hashGameDevAssetDesignWorkOrder(value: unknown): string {
  const workOrder = validateGameDevAssetDesignWorkOrder(value);
  return createHash("sha256").update(JSON.stringify(workOrder)).digest("hex");
}

export function buildGameDevAssetDesignGuardrails(): string {
  return [
    "Design one bounded presentation asset work order for Echoes of Aurion.",
    "Do not claim or infer a license; licensing is entered and confirmed separately by the human operator.",
    "Do not execute tools, spend provider funds, edit code, mutate databases, or claim that an asset is live.",
    "Choose only a presentation purpose and acceptance criteria; gameplay authority remains outside the asset.",
    "Every work order requires a human review and an independent Game Development Studio validation/admission step.",
  ].join(" ");
}
