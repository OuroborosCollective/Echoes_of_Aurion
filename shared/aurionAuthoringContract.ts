import { z } from "zod";

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
  worldId: z.string().trim().min(3).max(96).default("aurion-main"),
  title: z.string().trim().min(3).max(255),
  expectedCatalogRevision: z.string().trim().min(8).max(64),
  placements: z.array(WorldDesignPlacementSchema).min(1).max(500),
});
export type WorldDesignDraft = z.infer<typeof WorldDesignDraftSchema>;

export const WorldDesignVersionSchema = z.object({
  id: z.string(),
  designKey: z.string(),
  version: z.number().int(),
  worldId: z.string(),
  title: z.string(),
  expectedCatalogRevision: z.string(),
  designJson: z.string().optional(),
  designHash: z.string(),
  active: z.boolean(),
  placements: z.array(WorldDesignPlacementSchema),
  createdByUserId: z.number().int().optional(),
  createdAt: z.string().or(z.date()).optional(),
});
export type WorldDesignVersion = z.infer<typeof WorldDesignVersionSchema>;

export const WorldDesignReadbackSchema = z.object({
  revision: z.string(),
  designs: z.array(WorldDesignVersionSchema),
});
export type WorldDesignReadback = z.infer<typeof WorldDesignReadbackSchema>;

export const DungeonRoomSchema = z.object({
  roomId: z.string().trim().min(2).max(64),
  label: z.string().trim().min(2).max(120),
  connectedRoomIds: z.array(z.string().trim().min(2).max(64)).default([]),
  assetIds: z.array(z.string().trim().min(8).max(64)).default([]),
  boss: z.boolean().default(false),
  encounterKey: z.string().optional(),
});
export type DungeonRoom = z.infer<typeof DungeonRoomSchema>;

export const DungeonDesignDraftSchema = z.object({
  dungeonId: z.string().trim().min(3).max(96),
  label: z.string().trim().min(3).max(255),
  zone: z.string().trim().min(3).max(96),
  expectedCatalogRevision: z.string().trim().min(8).max(64),
  rooms: z.array(DungeonRoomSchema).min(1).max(50),
  objectives: z.array(z.string().trim().min(2).max(200)).default([]),
});
export type DungeonDesignDraft = z.infer<typeof DungeonDesignDraftSchema>;

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
  objectives: z.array(z.string()),
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
  id: z.string(),
  kind: z.enum(["world", "quest", "dungeon"]),
  action: z.string(),
  targetId: z.string(),
  actorUserId: z.number().int(),
  planHash: z.string(),
  previousHash: z.string().nullable().optional(),
  resultHash: z.string(),
  payloadJson: z.string(),
  receiptHash: z.string(),
  createdAt: z.string().or(z.date()).optional(),
});
export type AuthoringReceipt = z.infer<typeof AuthoringReceiptSchema>;
