import { z } from "zod";

export const contextEvidenceClassSchema = z.enum([
  "reported",
  "observed",
  "verified",
  "contradicted",
  "invalidated",
]);
export type ContextEvidenceClass = z.infer<typeof contextEvidenceClassSchema>;

export const contextSourceKindSchema = z.enum([
  "world_event",
  "world_fact",
  "npc_memory",
  "semantic_relation",
  "quest_event",
  "quest_fact",
  "relationship",
  "location_fact",
  "episode",
]);
export type ContextSourceKind = z.infer<typeof contextSourceKindSchema>;

export const contextSourceRefSchema = z.object({
  sourceId: z.string().min(1).max(160),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  kind: contextSourceKindSchema,
  evidenceClass: contextEvidenceClassSchema,
  worldId: z.string().min(1).max(96),
  actorIds: z.array(z.string().min(1).max(96)).max(32),
  logicalSequence: z.number().int().nonnegative(),
}).strict();
export type ContextSourceRef = z.infer<typeof contextSourceRefSchema>;

export const worldContextPurposeSchema = z.enum([
  "npc_dialogue",
  "npc_planning",
  "quest_compilation",
  "quest_explanation",
  "historical_narrative",
  "admin_explanation",
]);
export type WorldContextPurpose = z.infer<typeof worldContextPurposeSchema>;

export const worldContextBudgetSchema = z.object({
  maxEstimatedTokens: z.number().int().positive().max(200_000),
  maxUtf8Bytes: z.number().int().positive().max(2_000_000),
  tokenizerId: z.string().min(1).max(96),
}).strict();
export type WorldContextBudget = z.infer<typeof worldContextBudgetSchema>;

export const worldContextQuerySchema = z.object({
  schemaVersion: z.literal("aurion.world-context-query.v1"),
  worldId: z.string().min(1).max(96),
  worldRevision: z.string().min(1).max(160),
  logicalTick: z.number().int().nonnegative(),
  actorId: z.string().min(1).max(96),
  purpose: worldContextPurposeSchema,
  subjectIds: z.array(z.string().min(1).max(96)).max(64),
  queryHash: z.string().regex(/^[a-f0-9]{64}$/),
  policyVersion: z.string().min(1).max(64),
  budget: worldContextBudgetSchema,
}).strict();
export type WorldContextQuery = z.infer<typeof worldContextQuerySchema>;

export const contextImportanceScoreSchema = z.object({
  causal: z.number().int().min(0).max(1000),
  actorRelevance: z.number().int().min(0).max(1000),
  questRelevance: z.number().int().min(0).max(1000),
  relationship: z.number().int().min(0).max(1000),
  salience: z.number().int().min(0).max(1000),
  uniqueness: z.number().int().min(0).max(1000),
  recencyBucket: z.number().int().min(0).max(1000),
  evidence: z.number().int().min(0).max(1000),
  total: z.number().int().nonnegative(),
  policyVersion: z.literal("aurion.context-importance.v1"),
}).strict();
export type ContextImportanceScore = z.infer<typeof contextImportanceScoreSchema>;

export const canonicalContextSourceSchema = z.object({
  sourceId: z.string().min(1).max(160),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  kind: contextSourceKindSchema,
  evidenceClass: contextEvidenceClassSchema,
  worldId: z.string().min(1).max(96),
  actorIds: z.array(z.string().min(1).max(96)).max(32),
  logicalSequence: z.number().int().nonnegative(),
  logicalSequenceMax: z.number().int().nonnegative().optional(),
  canonicalText: z.string().min(1).max(32_000),
  nonDroppable: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict();
export type CanonicalContextSource = z.infer<typeof canonicalContextSourceSchema>;

export const worldContextEntrySchema = z.object({
  entryId: z.string().min(1).max(160),
  entryKind: z.enum(["source", "episode", "structured_extract"]),
  sourceRefs: z.array(contextSourceRefSchema),
  canonicalText: z.string(),
  logicalSequenceMin: z.number().int().nonnegative(),
  logicalSequenceMax: z.number().int().nonnegative(),
  importance: contextImportanceScoreSchema,
  nonDroppable: z.boolean(),
  estimatedTokens: z.number().int().nonnegative(),
  entryHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type WorldContextEntry = z.infer<typeof worldContextEntrySchema>;

export const structuredEpisodeSchema = z.object({
  schemaVersion: z.literal("aurion.context-episode.v1"),
  episodeId: z.string().min(1).max(160),
  kind: z.string().min(1).max(96),
  worldId: z.string().min(1).max(96),
  actorIds: z.array(z.string().min(1).max(96)).max(32),
  sourceSequenceMin: z.number().int().nonnegative(),
  sourceSequenceMax: z.number().int().nonnegative(),
  sourceRefs: z.array(contextSourceRefSchema),
  outcomes: z.array(z.string()),
  relationshipEffects: z.array(z.object({
    from: z.string().min(1).max(96),
    to: z.string().min(1).max(96),
    relation: z.string().min(1).max(64),
    confirmedDelta: z.number(),
  }).strict()),
  tags: z.array(z.string()),
  canonicalSummary: z.string(),
  sourceRootHash: z.string().regex(/^[a-f0-9]{64}$/),
  episodeHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type StructuredEpisode = z.infer<typeof structuredEpisodeSchema>;

export const worldContextCapsuleSchema = z.object({
  schemaVersion: z.literal("aurion.world-context-capsule.v1"),
  worldId: z.string().min(1).max(96),
  worldRevision: z.string().min(1).max(160),
  logicalTick: z.number().int().nonnegative(),
  actorId: z.string().min(1).max(96),
  purpose: worldContextPurposeSchema,
  queryHash: z.string().regex(/^[a-f0-9]{64}$/),
  policyVersion: z.string().min(1).max(64),
  budget: worldContextBudgetSchema,

  selected: z.array(worldContextEntrySchema),
  selectedSourceCount: z.number().int().nonnegative(),
  omittedSourceCount: z.number().int().nonnegative(),

  sourceRootHash: z.string().regex(/^[a-f0-9]{64}$/),
  selectedSourceRootHash: z.string().regex(/^[a-f0-9]{64}$/),
  omittedSourceRootHash: z.string().regex(/^[a-f0-9]{64}$/),
  capsuleHash: z.string().regex(/^[a-f0-9]{64}$/),

  estimatedInputTokens: z.number().int().nonnegative(),
  utf8Bytes: z.number().int().nonnegative(),
  reversible: z.literal(true),
}).strict();
export type WorldContextCapsule = z.infer<typeof worldContextCapsuleSchema>;

export const worldContextExpansionSchema = z.object({
  capsuleId: z.string().min(1).max(160),
  capsuleHash: z.string().regex(/^[a-f0-9]{64}$/),
  expandedSources: z.array(canonicalContextSourceSchema),
  unprovableSources: z.array(z.string()),
  status: z.enum(["COMPLETE", "PARTIAL", "UNPROVABLE"]),
}).strict();
export type WorldContextExpansion = z.infer<typeof worldContextExpansionSchema>;
