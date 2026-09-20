import { z } from "zod";

export const GLB_EXTERNAL_PROVENANCE_VERSION = "aurion.glb-external-provenance.v1" as const;

export const glbExternalProvenanceInputSchema = z.object({
  version: z.literal(GLB_EXTERNAL_PROVENANCE_VERSION),
  sourceKind: z.literal("os3a-cc0"),
  registryRepository: z.literal("ToxSam/open-source-3D-assets"),
  registryRevision: z.string().regex(/^[a-f0-9]{40}$/),
  modelRepository: z.literal("ToxSam/cc0-models-Polygonal-Mind"),
  modelRevision: z.string().regex(/^[a-f0-9]{40}$/),
  licensePath: z.literal("License.md"),
  projectId: z.string().regex(/^pm-[a-z0-9-]{2,80}$/),
  sourceAssetId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,95}$/),
  sourcePath: z.string().min(8).max(512).regex(/^projects\/[A-Za-z0-9._/-]+\.glb$/),
  license: z.literal("CC0-1.0"),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceBytes: z.number().int().positive().max(24 * 1024 * 1024),
  sourceMetadataSha256: z.string().regex(/^[a-f0-9]{64}$/),
  fallbackPlanSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type GlbExternalProvenanceInput = z.infer<typeof glbExternalProvenanceInputSchema>;

export const glbExternalProvenanceReadbackSchema = glbExternalProvenanceInputSchema.extend({
  assetId: z.string().min(8).max(64),
  receiptSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type GlbExternalProvenanceReadback = z.infer<typeof glbExternalProvenanceReadbackSchema>;
