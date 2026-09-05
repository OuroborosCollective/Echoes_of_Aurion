import { z } from "zod";

export const GLB_IMPORT_VERSION = "aurion.glb-import.v1" as const;
export const glbTargetTypes = ["character", "enemy", "weapon", "armor", "arena"] as const;
export const glbImportReceiptSchema = z.object({
  version: z.literal(GLB_IMPORT_VERSION),
  assetId: z.string().min(8).max(64),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(24 * 1024 * 1024),
  storageUrl: z.string().regex(/^\/api\/assets\/glb\/[a-f0-9]{64}\.glb$/),
  assetType: z.enum(glbTargetTypes),
  targetKey: z.string().max(120).nullable(),
  planSha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.enum(["assigned", "catalog", "conflict", "archived"]),
  activeAssetId: z.string().max(64).nullable(),
  deduplicated: z.boolean(),
});
export type GlbImportReceipt = z.infer<typeof glbImportReceiptSchema>;
export const glbCatalogEntrySchema = z.object({
  assetId: z.string().min(8).max(64),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  displayName: z.string().max(120),
  assetType: z.enum(glbTargetTypes),
  storageUrl: z.string().regex(/^\/api\/assets\/glb\/[a-f0-9]{64}\.glb$/),
  targetKey: z.string().max(120).nullable(),
});
export const glbRuntimeCatalogSchema = z.object({
  version: z.literal(GLB_IMPORT_VERSION),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  entries: z.array(glbCatalogEntrySchema).max(500),
});
export type GlbRuntimeCatalog = z.infer<typeof glbRuntimeCatalogSchema>;
