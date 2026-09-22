import { z } from "zod";

export const AURION_AUTHORING_SCHEMA = "aurion.authoring.v1" as const;
export const AURION_AUTHORING_RECEIPT_SCHEMA = "aurion.authoring.receipt.v1" as const;
export const AURION_WORLD_DESIGN_SCHEMA = "aurion.world.design.v1" as const;
export const AURION_DUNGEON_DESIGN_SCHEMA = "aurion.dungeon.design.v1" as const;

export const WorldDesignPlacementSchema = z.object({
  placementKey: z.string().trim().min(2).max(64),
  assetId: z.string().trim().min(8).max(64),
  chunkX: z.number().int().min(-1000).max(1000),
  chunkZ: z.number().int().min(-1000).max(1000),
  xMm: z.number().int().min(0).max(64_000),
  zMm: z.number().int().min(0).max(64_000),
  rotationQuarterTurns: z.number().int().min(0).max(3).default(0),
  scalePermille: z.number().int().min(100).max(10_000).default(1000),
});
export type WorldDesignPlacement = z.infer<typeof WorldDesignPlacementSchema>;

export const WorldDesignDraftSchema = z.object({
  designKey: z.string().trim().min(3).max(96),
  version: z.number().int().min(1).default(1),
  worldId: z.string().trim().min(3).max(96).default("aurion-main"),
  title: z.string().trim().min(3).max(255),
  expectedCatalogRevision: z.string().trim().min(8).max(64),
  placements: z.array(WorldDesignPlacementSchema).min(1).max(500),
});
export type WorldDesignDraft = z.infer<typeof WorldDesignDraftSchema>;

export const WorldDesignPlanSchema = WorldDesignDraftSchema.extend({
  referencedAssetHashes: z.array(z.string()),
  requiresHumanConfirmation: z.literal(true),
  planHash: z.string(),
});
export type WorldDesignPlan = z.infer<typeof WorldDesignPlanSchema>;

export const WorldDesignVersionSchema = z.object({
  id: z.string().optional(),
  designKey: z.string(),
  version: z.number().int(),
  worldId: z.string().optional(),
  title: z.string(),
  expectedCatalogRevision: z.string(),
  designJson: z.string().optional(),
  designHash: z.string(),
  active: z.boolean().optional(),
  placements: z.array(WorldDesignPlacementSchema),
  createdByUserId: z.number().int().optional(),
  createdAt: z.string().or(z.date()).optional(),
});
export type WorldDesignVersion = z.infer<typeof WorldDesignVersionSchema>;

export const WorldDesignReadbackSchema = z.object({
  schemaVersion: z.string().optional(),
  revision: z.string(),
  designs: z.array(WorldDesignVersionSchema),
});
export type WorldDesignReadback = z.infer<typeof WorldDesignReadbackSchema>;

export const DungeonRoomKindSchema = z.enum(["entrance", "normal", "boss", "exit"]);
export type DungeonRoomKind = z.infer<typeof DungeonRoomKindSchema>;

export const DungeonRoomSchema = z.object({
  roomKey: z.string().trim().min(2).max(64),
  kind: DungeonRoomKindSchema.default("normal"),
  xMm: z.number().int().default(0),
  zMm: z.number().int().default(0),
  label: z.string().trim().min(2).max(120).optional(),
  assetId: z.string().trim().min(8).max(64).nullable().optional(),
  connectedRoomIds: z.array(z.string().trim().min(2).max(64)).default([]),
  boss: z.boolean().default(false),
  encounterKey: z.string().optional(),
});
export type DungeonRoom = z.infer<typeof DungeonRoomSchema>;

export const DungeonConnectionDraftSchema = z.object({
  fromRoomKey: z.string().trim().min(2).max(64),
  toRoomKey: z.string().trim().min(2).max(64),
});
export type DungeonConnectionDraft = z.infer<typeof DungeonConnectionDraftSchema>;

export const DungeonBossDraftSchema = z.object({
  bossId: z.string().trim().min(2).max(64),
  roomKey: z.string().trim().min(2).max(64),
  assetId: z.string().trim().min(8).max(64).nullable().optional(),
});
export type DungeonBossDraft = z.infer<typeof DungeonBossDraftSchema>;

export const DungeonDesignDraftSchema = z.object({
  dungeonId: z.string().trim().min(3).max(96),
  version: z.number().int().min(1).default(1),
  label: z.string().trim().min(3).max(255),
  zone: z.string().trim().min(3).max(96),
  expectedCatalogRevision: z.string().trim().min(8).max(64),
  rooms: z.array(DungeonRoomSchema).min(1).max(50),
  connections: z.array(DungeonConnectionDraftSchema).default([]),
  bosses: z.array(DungeonBossDraftSchema).default([]),
  objectives: z.array(z.string().trim().min(2).max(200)).default([]),
});
export type DungeonDesignDraft = z.infer<typeof DungeonDesignDraftSchema>;

export const DungeonDesignPlanSchema = DungeonDesignDraftSchema.extend({
  referencedAssetHashes: z.array(z.string()),
  graphHash: z.string(),
  requiresHumanConfirmation: z.literal(true),
  planHash: z.string(),
});
export type DungeonDesignPlan = z.infer<typeof DungeonDesignPlanSchema>;

export const ActiveDungeonDesignSchema = DungeonDesignPlanSchema.extend({
  designHash: z.string(),
});
export type ActiveDungeonDesign = z.infer<typeof ActiveDungeonDesignSchema>;

export const DungeonDesignVersionSchema = z.object({
  id: z.string(),
  dungeonId: z.string(),
  version: z.number().int(),
  label: z.string(),
  zone: z.string(),
  expectedCatalogRevision: z.string(),
  designJson: z.string().optional(),
  designHash: z.string(),
  active: z.boolean(),
  rooms: z.array(DungeonRoomSchema),
  objectives: z.array(z.string()).default([]),
  createdByUserId: z.number().int().optional(),
  createdAt: z.string().or(z.date()).optional(),
});
export type DungeonDesignVersion = z.infer<typeof DungeonDesignVersionSchema>;

export const DungeonDesignReadbackSchema = z.object({
  revision: z.string(),
  dungeons: z.array(DungeonDesignVersionSchema),
});
export type DungeonDesignReadback = z.infer<typeof DungeonDesignReadbackSchema>;

export const AuthoringReceiptSchema = z.object({
  schemaVersion: z.string().default(AURION_AUTHORING_RECEIPT_SCHEMA),
  receiptId: z.string(),
  id: z.string().optional(),
  kind: z.enum(["world", "quest", "dungeon"]),
  action: z.string(),
  targetId: z.string(),
  actorUserId: z.number().int(),
  planHash: z.string(),
  previousHash: z.string().nullable().optional(),
  resultHash: z.string(),
  humanConfirmed: z.literal(true).default(true),
  receiptHash: z.string(),
  payloadJson: z.string().optional(),
  createdAt: z.string().or(z.date()).optional(),
});
export type AuthoringReceipt = z.infer<typeof AuthoringReceiptSchema>;
