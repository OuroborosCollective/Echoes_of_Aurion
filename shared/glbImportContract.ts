import { z } from "zod";

export const GLB_IMPORT_VERSION = "aurion.glb-import.v1" as const;
export const glbTargetTypes = ["character", "enemy", "weapon", "armor", "arena"] as const;
export const glbImportPurposes = [
  "auto",
  "npc-fallback",
  "world-environment",
  "world-nature",
  "player-public",
  "equipment",
] as const;
export type GlbImportPurpose = (typeof glbImportPurposes)[number];

export const glbEquipmentSlots = ["weapon", "shield", "helmet", "chest", "shoulders", "arms", "legs", "boots"] as const;
export type GlbEquipmentSlot = (typeof glbEquipmentSlots)[number];

export const glbLodLevels = [0, 1, 2, 3] as const;
export type GlbLodLevel = (typeof glbLodLevels)[number];

/** Server-authored catalog markers. They encode visual authority only; none of
 * these prefixes grants gameplay state, inventory ownership or interaction. */
export const NPC_FALLBACK_DISPLAY_PREFIX = "NPC Fallback · " as const;
export const WORLD_ENVIRONMENT_DISPLAY_PREFIX = "World Environment · " as const;
export const WORLD_NATURE_DISPLAY_PREFIX = "World Nature · " as const;
export const PUBLIC_PLAYER_DISPLAY_PREFIX = "Player Public · " as const;
export const EQUIPMENT_DISPLAY_PREFIX = "Equipment · " as const;

export function glbPurposeFromDisplayName(displayName: string): GlbImportPurpose {
  if (displayName.startsWith(NPC_FALLBACK_DISPLAY_PREFIX)) return "npc-fallback";
  if (displayName.startsWith(WORLD_ENVIRONMENT_DISPLAY_PREFIX)) return "world-environment";
  if (displayName.startsWith(WORLD_NATURE_DISPLAY_PREFIX)) return "world-nature";
  if (displayName.startsWith(PUBLIC_PLAYER_DISPLAY_PREFIX)) return "player-public";
  if (displayName.startsWith(EQUIPMENT_DISPLAY_PREFIX)) return "equipment";
  return "auto";
}

export function glbEquipmentSlotFromDisplayName(displayName: string): GlbEquipmentSlot | null {
  if (!displayName.startsWith(EQUIPMENT_DISPLAY_PREFIX)) return null;
  const slot = displayName.slice(EQUIPMENT_DISPLAY_PREFIX.length).split(" · ", 1)[0];
  return (glbEquipmentSlots as readonly string[]).includes(slot) ? slot as GlbEquipmentSlot : null;
}

export function glbSubcategoryFromDisplayName(displayName: string): string | null {
  const purpose = glbPurposeFromDisplayName(displayName);
  if (purpose === "world-environment") return displayName.slice(WORLD_ENVIRONMENT_DISPLAY_PREFIX.length).split(" · ", 1)[0] || null;
  if (purpose === "world-nature") return displayName.slice(WORLD_NATURE_DISPLAY_PREFIX.length).split(" · ", 1)[0] || null;
  if (purpose === "equipment") return glbEquipmentSlotFromDisplayName(displayName);
  return null;
}

const LOD_TOKEN = /(?:^|\s)LOD\s*([0-3])(?=\s|$)/i;
export function glbLodDescriptor(displayName: string): Readonly<{ baseDisplayName: string; lodLevel: GlbLodLevel | null }> {
  const match = displayName.match(LOD_TOKEN);
  const raw = match ? Number.parseInt(match[1]!, 10) : null;
  const lodLevel = raw !== null && (glbLodLevels as readonly number[]).includes(raw) ? raw as GlbLodLevel : null;
  const baseDisplayName = (match ? displayName.replace(LOD_TOKEN, " ") : displayName)
    .replace(/\s+/g, " ")
    .replace(/\s*·\s*/g, " · ")
    .trim();
  return Object.freeze({ baseDisplayName, lodLevel });
}

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

export const glbCatalogLodVariantSchema = z.object({
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  assetId: z.string().min(8).max(64),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive().max(24 * 1024 * 1024).nullable(),
  storageUrl: z.string().regex(/^\/api\/assets\/glb\/[a-f0-9]{64}\.glb$/),
  targetKey: z.string().max(120).nullable(),
}).strict();
export type GlbCatalogLodVariant = z.infer<typeof glbCatalogLodVariantSchema>;

export const glbCatalogEntrySchema = z.object({
  assetId: z.string().min(8).max(64),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  displayName: z.string().max(120),
  assetType: z.enum(glbTargetTypes),
  storageUrl: z.string().regex(/^\/api\/assets\/glb\/[a-f0-9]{64}\.glb$/),
  targetKey: z.string().max(120).nullable(),
  // Defaults preserve rolling compatibility with an older server during deploy.
  purpose: z.enum(glbImportPurposes).default("auto"),
  subcategory: z.string().max(64).nullable().default(null),
  equipmentSlot: z.enum(glbEquipmentSlots).nullable().default(null),
  // One logical catalog model may contain up to four immutable physical GLBs.
  // Existing servers/entries omit this field and are treated as one LOD0 asset.
  lods: z.array(glbCatalogLodVariantSchema).max(4).default([]),
});
export type GlbCatalogEntry = z.infer<typeof glbCatalogEntrySchema>;

export function glbCatalogLods(entry: GlbCatalogEntry): readonly GlbCatalogLodVariant[] {
  if (entry.lods.length) return entry.lods;
  return Object.freeze([Object.freeze({
    level: 0 as const,
    assetId: entry.assetId,
    sha256: entry.sha256,
    bytes: null,
    storageUrl: entry.storageUrl,
    targetKey: entry.targetKey,
  })]);
}

/** Presentation-only selection. Missing levels resolve deterministically to the
 * nearest available variant, preferring the cheaper/higher LOD on equal distance. */
export function selectGlbCatalogLod(entry: GlbCatalogEntry, preferredLevel: GlbLodLevel): GlbCatalogLodVariant {
  const variants = glbCatalogLods(entry).slice().sort((left, right) => left.level - right.level || left.sha256.localeCompare(right.sha256));
  const exact = variants.find(variant => variant.level === preferredLevel);
  if (exact) return exact;
  return variants.slice().sort((left, right) => Math.abs(left.level - preferredLevel) - Math.abs(right.level - preferredLevel) || right.level - left.level || left.sha256.localeCompare(right.sha256))[0]!;
}

export const glbRuntimeCatalogSchema = z.object({
  version: z.literal(GLB_IMPORT_VERSION),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  entries: z.array(glbCatalogEntrySchema).max(500),
});
export type GlbRuntimeCatalog = z.infer<typeof glbRuntimeCatalogSchema>;
