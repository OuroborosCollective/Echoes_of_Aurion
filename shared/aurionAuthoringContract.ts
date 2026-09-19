import { z } from "zod";

export const AURION_AUTHORING_SCHEMA = "aurion.authoring.v1" as const;
export const AURION_WORLD_DESIGN_SCHEMA = "aurion.world-design.v1" as const;
export const AURION_DUNGEON_DESIGN_SCHEMA = "aurion.dungeon-design.v1" as const;
export const AURION_AUTHORING_RECEIPT_SCHEMA = "aurion.authoring-receipt.v1" as const;

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const canonicalId = z.string().regex(/^[a-z][a-z0-9._:-]{2,95}$/);
const authoredDungeonId = z.string().regex(/^dungeon_[a-z0-9][a-z0-9_]{2,79}$/);
const assetId = z.string().regex(/^glb_[a-z0-9._:-]{4,91}$/);
const localMm = z.number().int().min(0).max(63_999);
const layoutMm = z.number().int().min(-1_000_000).max(1_000_000);
const chunkCoordinate = z.number().int().min(-100_000).max(100_000);

export const WorldDesignPlacementSchema = z.object({
  placementKey: canonicalId,
  assetId,
  chunkX: chunkCoordinate,
  chunkZ: chunkCoordinate,
  xMm: localMm,
  zMm: localMm,
  rotationQuarterTurns: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  scalePermille: z.number().int().min(250).max(4_000).default(1_000),
}).strict();

export const WorldDesignDraftSchema = z.object({
  schemaVersion: z.literal(AURION_WORLD_DESIGN_SCHEMA).default(AURION_WORLD_DESIGN_SCHEMA),
  designKey: canonicalId,
  version: z.number().int().min(1).max(1_000_000),
  title: z.string().trim().min(3).max(160),
  expectedCatalogRevision: digest,
  placements: z.array(WorldDesignPlacementSchema).min(1).max(256),
}).strict().superRefine((value, ctx) => {
  const keys = value.placements.map(item => item.placementKey);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "WORLD_DESIGN_DUPLICATE_PLACEMENT_KEY", path: ["placements"] });
});

export type WorldDesignDraft = z.infer<typeof WorldDesignDraftSchema>;

export const WorldDesignPlanSchema = WorldDesignDraftSchema.extend({
  planHash: digest,
  referencedAssetHashes: z.array(digest).min(1).max(256),
  requiresHumanConfirmation: z.literal(true),
}).strict();

export type WorldDesignPlan = z.infer<typeof WorldDesignPlanSchema>;

export const WorldDesignReadbackSchema = z.object({
  schemaVersion: z.literal(AURION_WORLD_DESIGN_SCHEMA),
  revision: digest,
  designs: z.array(z.object({
    designKey: canonicalId,
    version: z.number().int().positive(),
    title: z.string(),
    designHash: digest,
    expectedCatalogRevision: digest,
    placements: z.array(WorldDesignPlacementSchema),
  }).strict()).max(64),
}).strict();

export type WorldDesignReadback = z.infer<typeof WorldDesignReadbackSchema>;

export const DungeonObjectiveSchema = z.object({
  kind: z.enum(["defeat", "interact", "collect", "survive", "reach"]),
  targetId: canonicalId,
  targetValue: z.number().int().min(1).max(100_000),
  description: z.string().trim().min(3).max(240),
}).strict();

export const DungeonRoomSchema = z.object({
  roomKey: canonicalId,
  kind: z.enum(["entrance", "combat", "puzzle", "objective", "treasure", "rest", "boss", "exit"]),
  title: z.string().trim().min(2).max(120),
  xMm: layoutMm,
  zMm: layoutMm,
  assetId: assetId.nullable().default(null),
  objective: DungeonObjectiveSchema.nullable().default(null),
}).strict();

export const DungeonConnectionSchema = z.object({
  fromRoomKey: canonicalId,
  toRoomKey: canonicalId,
  label: z.string().trim().min(1).max(80).nullable().default(null),
}).strict();

export const DungeonBossSchema = z.object({
  bossId: canonicalId,
  label: z.string().trim().min(2).max(120),
  roomKey: canonicalId,
  assetId: assetId.nullable().default(null),
}).strict();

export const DungeonDesignDraftSchema = z.object({
  schemaVersion: z.literal(AURION_DUNGEON_DESIGN_SCHEMA).default(AURION_DUNGEON_DESIGN_SCHEMA),
  dungeonId: authoredDungeonId,
  version: z.number().int().min(1).max(1_000_000),
  label: z.string().trim().min(3).max(160),
  zone: canonicalId,
  expectedCatalogRevision: digest,
  rooms: z.array(DungeonRoomSchema).min(4).max(9),
  connections: z.array(DungeonConnectionSchema).min(3).max(24),
  bosses: z.array(DungeonBossSchema).min(2).max(4),
  partyCapabilities: z.tuple([z.literal(1), z.literal(1), z.literal(3)]).default([1, 1, 3]),
}).strict().superRefine((value, ctx) => {
  const roomKeys = value.rooms.map(room => room.roomKey);
  const roomSet = new Set(roomKeys);
  if (roomSet.size !== roomKeys.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DUNGEON_DUPLICATE_ROOM_KEY", path: ["rooms"] });
  if (value.rooms.filter(room => room.kind === "entrance").length !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DUNGEON_EXACTLY_ONE_ENTRANCE_REQUIRED", path: ["rooms"] });
  if (value.rooms.filter(room => room.kind === "exit").length !== 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DUNGEON_EXACTLY_ONE_EXIT_REQUIRED", path: ["rooms"] });
  for (const [index, edge] of value.connections.entries()) {
    if (!roomSet.has(edge.fromRoomKey) || !roomSet.has(edge.toRoomKey) || edge.fromRoomKey === edge.toRoomKey) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DUNGEON_CONNECTION_INVALID", path: ["connections", index] });
    }
  }
  for (const [index, boss] of value.bosses.entries()) {
    if (!roomSet.has(boss.roomKey)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "DUNGEON_BOSS_ROOM_UNKNOWN", path: ["bosses", index] });
  }
});

export type DungeonDesignDraft = z.infer<typeof DungeonDesignDraftSchema>;

export const DungeonDesignPlanSchema = DungeonDesignDraftSchema.extend({
  planHash: digest,
  referencedAssetHashes: z.array(digest).max(32),
  graphHash: digest,
  requiresHumanConfirmation: z.literal(true),
}).strict();

export type DungeonDesignPlan = z.infer<typeof DungeonDesignPlanSchema>;

export const ActiveDungeonDesignSchema = z.object({
  schemaVersion: z.literal(AURION_DUNGEON_DESIGN_SCHEMA),
  dungeonId: authoredDungeonId,
  version: z.number().int().min(1).max(1_000_000),
  label: z.string().trim().min(3).max(160),
  zone: canonicalId,
  expectedCatalogRevision: digest,
  rooms: z.array(DungeonRoomSchema).min(4).max(9),
  connections: z.array(DungeonConnectionSchema).min(3).max(24),
  bosses: z.array(DungeonBossSchema).min(2).max(4),
  partyCapabilities: z.tuple([z.literal(1), z.literal(1), z.literal(3)]),
  planHash: digest,
  referencedAssetHashes: z.array(digest).max(32),
  graphHash: digest,
  designHash: digest,
}).strict();

export type ActiveDungeonDesign = z.infer<typeof ActiveDungeonDesignSchema>;

export const AuthoringReceiptSchema = z.object({
  schemaVersion: z.literal(AURION_AUTHORING_RECEIPT_SCHEMA),
  receiptId: z.string().min(8).max(128),
  kind: z.enum(["world", "quest", "dungeon"]),
  action: z.enum(["apply", "publish"]),
  targetId: z.string().min(3).max(128),
  actorUserId: z.number().int().positive(),
  planHash: digest,
  previousHash: digest.nullable(),
  resultHash: digest,
  receiptHash: digest,
  humanConfirmed: z.literal(true),
}).strict();

export type AuthoringReceipt = z.infer<typeof AuthoringReceiptSchema>;

export const AuthoringProposalInputSchema = z.object({
  kind: z.enum(["world", "quest", "dungeon"]),
  request: z.string().trim().min(12).max(4_000),
}).strict();

export const AuthoringApplyConfirmationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("world"), confirmation: z.literal("APPLY_WORLD_DESIGN") }).strict(),
  z.object({ kind: z.literal("quest"), confirmation: z.literal("PUBLISH_QUEST_TEMPLATE") }).strict(),
  z.object({ kind: z.literal("dungeon"), confirmation: z.literal("PUBLISH_DUNGEON") }).strict(),
]);
