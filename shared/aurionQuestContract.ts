import { z } from 'zod';
import { replayVerdictSchema } from './aurionReplayContract';

/**
 * AIM-298: Shared Canonical Contract for Aurion-native Deterministic Quest Compiler & Story Chains.
 * Enforces strict parsing and domain integrity across client, server, and admin boundaries.
 */

export const WorldFactSchema = z.object({
  id: z.string(),
  subject: z.string(),
  predicate: z.string(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  validityRange: z.object({
    fromSequence: z.number().int().nonnegative(),
    toSequence: z.number().int().optional(),
  }).optional(),
  provenance: z.object({
    sourceEventId: z.string(),
    sequence: z.number().int().nonnegative(),
    source: z.string().default('aurion_world_event'),
  }),
});

export type WorldFact = z.infer<typeof WorldFactSchema>;

export const WorldEventSchema = z.object({
  id: z.string(),
  sequence: z.number().int().nonnegative(),
  type: z.string(),
  payloadHash: z.string(),
  source: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string().optional(),
});

export type WorldEvent = z.infer<typeof WorldEventSchema>;

export const WorldStateRevisionSchema = z.object({
  worldId: z.string(),
  revisionSequence: z.number().int().nonnegative(),
  factsHash: z.string(),
  lastEventSequence: z.number().int().nonnegative(),
  factsCount: z.number().int().nonnegative(),
});

export type WorldStateRevision = z.infer<typeof WorldStateRevisionSchema>;

export const QuestRolePredicateSchema = z.object({
  subjectField: z.string(),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains']),
  expectedValue: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

export type QuestRolePredicate = z.infer<typeof QuestRolePredicateSchema>;

export const QuestRoleSchema = z.object({
  roleName: z.string(), // e.g. "initiator", "giver", "victim", "witness", "recipient", "antagonist", "location", "required_item"
  entityType: z.enum(['npc', 'location', 'item', 'player', 'faction']),
  optional: z.boolean().default(false),
  predicates: z.array(QuestRolePredicateSchema).default([]),
});

export type QuestRole = z.infer<typeof QuestRoleSchema>;

export const QuestObjectiveRequirementSchema = z.object({
  key: z.string(),
  targetValue: z.union([z.number(), z.string(), z.boolean()]),
  description: z.string().optional(),
});

export type QuestObjectiveRequirement = z.infer<typeof QuestObjectiveRequirementSchema>;

export const QuestActionEffectSchema = z.object({
  targetSubject: z.string(),
  predicate: z.string(),
  value: z.union([z.string(), z.number(), z.boolean()]),
  effectType: z.enum(['assert_fact', 'retract_fact', 'emit_event', 'grant_reward']),
});

export type QuestActionEffect = z.infer<typeof QuestActionEffectSchema>;

export const QuestNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['start', 'objective', 'branch', 'subquest', 'end']),
  title: z.string(),
  objective: QuestObjectiveRequirementSchema.optional(),
  requirements: z.array(QuestRolePredicateSchema).default([]),
  actionsOnEnter: z.array(QuestActionEffectSchema).default([]),
  actionsOnExit: z.array(QuestActionEffectSchema).default([]),
  narrativeKey: z.string().optional(),
});

export type QuestNode = z.infer<typeof QuestNodeSchema>;

export const QuestEdgeSchema = z.object({
  id: z.string(),
  fromNodeId: z.string(),
  toNodeId: z.string(),
  conditionPredicate: QuestRolePredicateSchema.optional(),
  priority: z.number().int().default(0),
  choiceLabel: z.string().optional(),
});

export type QuestEdge = z.infer<typeof QuestEdgeSchema>;

export const QuestRewardSchema = z.object({
  type: z.enum(['xp', 'gold', 'item', 'reputation', 'standing']),
  amount: z.number().int().positive(),
  targetId: z.string().optional(),
});

export type QuestReward = z.infer<typeof QuestRewardSchema>;

export const QuestOutcomeSchema = z.object({
  id: z.string(),
  semanticFlag: z.string(),
  factEffects: z.array(QuestActionEffectSchema).default([]),
  rewards: z.array(QuestRewardSchema).default([]),
  narrativeKey: z.string().optional(),
});

export type QuestOutcome = z.infer<typeof QuestOutcomeSchema>;

export const QuestTemplateVersionSchema = z.object({
  templateId: z.string(),
  version: z.number().int().positive(),
  title: z.string(),
  description: z.string(),
  prerequisiteFacts: z.array(QuestRolePredicateSchema).default([]),
  roles: z.array(QuestRoleSchema),
  nodes: z.array(QuestNodeSchema),
  edges: z.array(QuestEdgeSchema),
  outcomes: z.array(QuestOutcomeSchema),
  maxCompositionDepth: z.number().int().positive().default(10),
  active: z.boolean().default(true),
  quarantined: z.boolean().default(false),
});

export type QuestTemplateVersion = z.infer<typeof QuestTemplateVersionSchema>;

export const BoundRoleSchema = z.object({
  roleName: z.string(),
  entityId: z.string(),
  entityName: z.string().optional(),
  entityType: z.string(),
});

export type BoundRole = z.infer<typeof BoundRoleSchema>;

export const QuestPlanSchema = z.object({
  templateId: z.string(),
  templateVersion: z.number().int().positive(),
  templateSetHash: z.string(),
  candidateSetHash: z.string(),
  seedDigest: z.string(),
  roleBindingHash: z.string(),
  planHash: z.string(),
  graphHash: z.string(),
  boundRoles: z.array(BoundRoleSchema),
  nodes: z.array(QuestNodeSchema),
  edges: z.array(QuestEdgeSchema),
  outcomes: z.array(QuestOutcomeSchema),
});

export type QuestPlan = z.infer<typeof QuestPlanSchema>;

export const QuestInstanceSchema = z.object({
  id: z.string(),
  worldId: z.string(),
  playerUserId: z.number().int(),
  giverNpcId: z.string(),
  templateId: z.string(),
  templateVersion: z.number().int().positive(),
  seedDigest: z.string(),
  planHash: z.string(),
  graphHash: z.string(),
  currentNodeId: z.string(),
  completedNodeIds: z.array(z.string()).default([]),
  boundRoles: z.array(BoundRoleSchema),
  state: z.enum(['offered', 'active', 'completed', 'failed', 'quarantined']),
  objectiveProgress: z.record(z.string(), z.union([z.number(), z.string(), z.boolean()])).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type QuestInstance = z.infer<typeof QuestInstanceSchema>;

export const QuestRuntimeEventSchema = z.object({
  id: z.string(),
  instanceId: z.string(),
  sequence: z.number().int().nonnegative(),
  type: z.enum(['accept', 'progress', 'choice', 'complete', 'fail', 'admin_override']),
  actorId: z.string(),
  nodeId: z.string(),
  choiceEdgeId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
  previousStateHash: z.string(),
  resultingStateHash: z.string(),
  timestamp: z.string(),
});

export type QuestRuntimeEvent = z.infer<typeof QuestRuntimeEventSchema>;

export const QuestReceiptSchema = z.object({
  id: z.string(),
  instanceId: z.string(),
  eventSequence: z.number().int().nonnegative(),
  planHash: z.string(),
  graphHash: z.string(),
  previousStateHash: z.string(),
  resultStateHash: z.string(),
  idempotencyKey: z.string(),
  receiptHash: z.string(),
  createdAt: z.string(),
});

export type QuestReceipt = z.infer<typeof QuestReceiptSchema>;

export const QuestReplayReceiptSchema = z.object({
  instanceId: z.string(),
  sourceTuple: z.object({
    worldId: z.string(),
    worldStateRevision: z.number().int(),
    triggerEventId: z.string(),
    compilerVersion: z.string(),
    templateSetHash: z.string(),
    candidateSetHash: z.string(),
    seedDigest: z.string(),
    roleBindingHash: z.string(),
    expectedPlanHash: z.string(),
  }),
  replayedPlanHash: z.string(),
  replayedGraphHash: z.string(),
  replayedOutcomeHash: z.string(),
  replayVerdict: replayVerdictSchema,
  /** Compatibility projection; must equal replayVerdict.status. */
  verdict: z.enum(['MATCH', 'FIRST_DIVERGENCE', 'UNPROVABLE']),
  firstDivergenceDetails: z.string().optional(),
  timestamp: z.string(),
}).superRefine((value, ctx) => {
  if (value.verdict !== value.replayVerdict.status) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'QUEST_REPLAY_VERDICT_PROJECTION_MISMATCH', path: ['verdict'] });
  }
});

export type QuestReplayReceipt = z.infer<typeof QuestReplayReceiptSchema>;

export const QuestAdminProposalSchema = z.object({
  id: z.string(),
  proposalType: z.enum(['create_template_draft', 'quarantine_template', 'activate_template_set']),
  authorUserId: z.number().int(),
  templateId: z.string(),
  templateVersion: z.number().int().positive(),
  expectedTemplateSetHash: z.string(),
  proposedDataJson: z.string(),
  status: z.enum(['draft', 'active', 'rejected']),
  receiptHash: z.string(),
  createdAt: z.string(),
});

export type QuestAdminProposal = z.infer<typeof QuestAdminProposalSchema>;
