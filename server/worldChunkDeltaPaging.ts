import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { aurionWorldChunkDeltaConflicts, aurionWorldChunkDeltas } from "../drizzle/schema";
import { getDb } from "./db";
import { npcHash } from "./npcPersistenceProtocol";

const id = z.string().trim().min(1).max(128);
const delta = z.object({ id, worldId: id, chunkX: z.number().int(), chunkZ: z.number().int(), baseRevision: z.number().int().nonnegative(), sequence: z.number().int().positive(), kind: z.enum(["resource_depleted", "structure_placed", "structure_removed", "road_built"]), targetId: id, actorUserId: z.number().int().positive(), idempotencyKey: id, payloadJson: z.string().min(2), deterministicHash: z.string().regex(/^[a-f0-9]{64}$/i) }).strict();
export const chunkDeltaPageInputSchema = z.object({ worldId: id, chunkX: z.number().int(), chunkZ: z.number().int(), expectedBaseRevision: z.number().int().nonnegative(), afterSequence: z.number().int().nonnegative().default(0), afterId: id.nullable().default(null), limit: z.number().int().min(1).max(100).default(50) }).strict();
export type ChunkDeltaPageInput = z.infer<typeof chunkDeltaPageInputSchema>;
export type ChunkDeltaPage = Readonly<{ worldId: string; chunkX: number; chunkZ: number; baseRevision: number; deltas: readonly unknown[]; nextCursor: string | null; pageHash: string }>;

export function resolveChunkDeltaConflict(left: unknown, right: unknown) {
  const a = delta.parse(left); const b = delta.parse(right);
  if (a.worldId !== b.worldId || a.chunkX !== b.chunkX || a.chunkZ !== b.chunkZ || a.baseRevision !== b.baseRevision || a.sequence !== b.sequence) throw new Error("CHUNK_CONFLICT_SCOPE_MISMATCH");
  const winner = a.deterministicHash < b.deterministicHash ? a : b;
  return Object.freeze({ winnerId: winner.id, loserId: winner.id === a.id ? b.id : a.id, strategy: "lowest_deterministic_hash" as const, resolutionHash: npcHash({ scope: [a.worldId, a.chunkX, a.chunkZ, a.baseRevision, a.sequence], winnerId: winner.id, loserId: winner.id === a.id ? b.id : a.id }) });
}

export async function readChunkDeltaPage(input: ChunkDeltaPageInput): Promise<ChunkDeltaPage> {
  const request = chunkDeltaPageInputSchema.parse(input);
  const db = await getDb(); if (!db) throw new Error("Game database is not available");
  const conditions = [eq(aurionWorldChunkDeltas.worldId, request.worldId), eq(aurionWorldChunkDeltas.chunkX, request.chunkX), eq(aurionWorldChunkDeltas.chunkZ, request.chunkZ), eq(aurionWorldChunkDeltas.baseRevision, request.expectedBaseRevision)];
  if (request.afterId !== null) conditions.push(gt(aurionWorldChunkDeltas.sequence, request.afterSequence));
  const rows = await db.select().from(aurionWorldChunkDeltas).where(and(...conditions)).orderBy(asc(aurionWorldChunkDeltas.sequence), asc(aurionWorldChunkDeltas.id)).limit(request.limit + 1);
  const hasMore = rows.length > request.limit; const page = rows.slice(0, request.limit);
  const last = page.at(-1); const nextCursor = hasMore && last ? `${last.sequence}:${last.id}` : null;
  return Object.freeze({ worldId: request.worldId, chunkX: request.chunkX, chunkZ: request.chunkZ, baseRevision: request.expectedBaseRevision, deltas: Object.freeze(page), nextCursor, pageHash: npcHash({ request, deltas: page }) });
}

export async function recordChunkDeltaConflict(input: { worldId: string; chunkX: number; chunkZ: number; baseRevision: number; sequence: number; leftHash: string; rightHash: string; winnerId: string; resolutionHash: string; idempotencyKey: string }) {
  const db = await getDb(); if (!db) throw new Error("Game database is not available");
  const idValue = `chunk_conflict_${npcHash(input).slice(0, 48)}`;
  await db.insert(aurionWorldChunkDeltaConflicts).values({ id: idValue, worldId: input.worldId, chunkX: input.chunkX, chunkZ: input.chunkZ, baseRevision: input.baseRevision, sequence: input.sequence, leftHash: input.leftHash, rightHash: input.rightHash, winnerId: input.winnerId, resolutionHash: input.resolutionHash, idempotencyKey: input.idempotencyKey }).onDuplicateKeyUpdate({ set: { id: idValue } });
  return Object.freeze({ id: idValue, resolutionHash: input.resolutionHash });
}
