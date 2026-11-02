import { z } from "zod";
import { chunkCoordinateSchema, causalSha256Schema, causalRevisionSchema } from "./aurionChunkStateContract";
import { chunkAssetPayloadSchema } from "./worldChunkProjectionPayload";
import { GLOBAL_WORLD_ID } from "./worldIdentity";
import { splitWorldChunkPositionMm } from "./worldChunkProtocol";

export const WORLD_SLICE_SCHEMA = "aurion.world-slice.v1" as const;
export const WORLD_SLICE_POLICY = "actor-observed-current-epoch.v1" as const;
export const WORLD_SLICE_MAX_BYTES = 65_536;
export const WORLD_SLICE_ZONE = "observatory_threshold" as const;
const epoch = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const mm = z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

export const worldSliceQuerySchema = z.strictObject({
  worldId: z.literal(GLOBAL_WORLD_ID), zoneId: z.literal(WORLD_SLICE_ZONE),
  coordinate: chunkCoordinateSchema, radius: z.number().int().min(0).max(1),
  lod: z.enum(["full", "map"]),
  expectedEpoch: epoch.optional(), expectedWorldRoot: causalSha256Schema.optional(),
});
export type WorldSliceQuery = z.infer<typeof worldSliceQuerySchema>;

const tile = z.strictObject({
  x: z.number().int().min(0).max(15), z: z.number().int().min(0).max(15),
  heightMm: z.number().int().min(-100_000).max(100_000),
  surface: z.enum(["grass", "forest_floor", "riverbank", "stone", "ash", "ruin_path"]),
});
export const worldSliceSchema = z.strictObject({
  schema: z.literal(WORLD_SLICE_SCHEMA), policy: z.literal(WORLD_SLICE_POLICY),
  worldId: z.literal(GLOBAL_WORLD_ID), zoneId: z.literal(WORLD_SLICE_ZONE),
  actorId: z.string().regex(/^player:[1-9][0-9]{0,15}$/),
  epoch, worldRoot: causalSha256Schema, sourceRevision: causalRevisionSchema,
  observedAtTick: epoch, coordinate: chunkCoordinateSchema,
  radius: z.number().int().min(0).max(1), lod: z.enum(["full", "map"]),
  knowledgeHash: causalSha256Schema.nullable(),
  // V1 deliberately discloses only the actor's independently observed current
  // chunk. A radius-1 window grants no neighbor data or arbitrary camera fetch.
  chunks: z.array(z.strictObject({
    coordinate: chunkCoordinateSchema, authorityReceiptHash: causalSha256Schema,
    tiles: z.array(tile).length(256),
    structures: chunkAssetPayloadSchema.shape.structures,
    roads: chunkAssetPayloadSchema.shape.roads,
  })).max(1),
  // Own position only; no foreign players, private NPC semantics or quest state.
  entities: z.array(z.strictObject({
    entityId: z.string().regex(/^player:[1-9][0-9]{0,15}$/),
    position: z.strictObject({ x: mm, z: mm }),
  })).length(1),
});

/** Same v1 wire, now checked as a complete consumer boundary before rendering. */
export const worldSliceReadbackSchema = z.strictObject({
  status: z.enum(["VERIFIED", "FOGGED"]), connectionId: z.string().min(1).max(128),
  slice: worldSliceSchema, fingerprint: causalSha256Schema, mutationAuthority: z.literal("none"),
}).superRefine((reply, ctx) => {
  const { slice } = reply;
  const invalid = (message: string) => ctx.addIssue({ code: "custom", message });
  if (slice.entities[0].entityId !== slice.actorId) invalid("WORLD_SLICE_FOREIGN_ENTITY");
  const ownChunk = splitWorldChunkPositionMm(slice.entities[0].position).coordinate;
  if (ownChunk.x !== slice.coordinate.x || ownChunk.z !== slice.coordinate.z) invalid("WORLD_SLICE_ACTOR_SCOPE_MISMATCH");
  if (reply.status === "FOGGED" ? slice.chunks.length !== 0 || slice.knowledgeHash !== null
    : slice.chunks.length !== 1 || slice.knowledgeHash === null) invalid("WORLD_SLICE_KNOWLEDGE_MISMATCH");
  for (const chunk of slice.chunks) {
    if (chunk.coordinate.x !== slice.coordinate.x || chunk.coordinate.z !== slice.coordinate.z) invalid("WORLD_SLICE_CHUNK_SCOPE_MISMATCH");
    if (new Set(chunk.tiles.map(tile => tile.z * 16 + tile.x)).size !== 256) invalid("WORLD_SLICE_TILE_COVERAGE_INVALID");
    for (const rows of [chunk.structures, chunk.roads]) {
      if (new Set(rows.map(row => row.id)).size !== rows.length) invalid("WORLD_SLICE_DUPLICATE_OVERLAY");
    }
  }
});

/** Native HTTP spelling is strict too; no actor/world override or coercive floats. */
export function parseWorldSliceHttpQuery(input: unknown): WorldSliceQuery {
  const integerText = z.string().regex(/^(?:0|-?[1-9][0-9]{0,6})$/);
  const query = z.strictObject({
    x: integerText, z: integerText, radius: z.enum(["0", "1"]), lod: z.enum(["full", "map"]),
    expectedEpoch: z.string().regex(/^[1-9][0-9]{0,15}$/).optional(),
    expectedWorldRoot: causalSha256Schema.optional(),
  }).parse(input);
  return worldSliceQuerySchema.parse({
    worldId: GLOBAL_WORLD_ID, zoneId: WORLD_SLICE_ZONE,
    coordinate: { x: Number(query.x), z: Number(query.z) }, radius: Number(query.radius), lod: query.lod,
    ...(query.expectedEpoch === undefined ? {} : { expectedEpoch: Number(query.expectedEpoch) }),
    ...(query.expectedWorldRoot === undefined ? {} : { expectedWorldRoot: query.expectedWorldRoot }),
  });
}
