import { z } from "zod";
import { npcSnapshotGoals } from "./npcSnapshotProtocol";

// Transport limits validate the public projection; the memory rules remain in WASD.
const row = z.object({
  version:z.literal("wasd-npc-memory-public.v4"), npcId:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/),
  resolutionIndex:z.number().int().min(0).max(2147483647), goal:z.enum(npcSnapshotGoals), planStatus:z.enum(["planned","blocked"]),
  memoryHash:z.string().regex(/^[a-f0-9]{64}$/), sourceRevision:z.string().regex(/^[a-f0-9]{40}$/),
  counts:z.object({working:z.number().int().min(0).max(64),episodic:z.number().int().min(0).max(24),semantic:z.number().int().min(0).max(64),procedural:z.number().int().min(0).max(8)}).strict(),
  conflictedFacts:z.number().int().min(0).max(64), expiredFacts:z.number().int().min(0).max(64),
}).strict();
const packet = z.object({userId:z.number().int().positive(),format:z.literal("aurion-public-npc-memory.v4"),npcs:z.array(row).max(6)}).strict();
export type PublicNpcMultiMemory = z.infer<typeof row>;
export function decodeOwnedNpcMultiMemory(input: unknown, userId: number) {
  const parsed = packet.parse(input);
  if (parsed.userId !== userId || parsed.npcs.some((npc,i)=>i>0 && parsed.npcs[i-1]!.npcId>=npc.npcId) ||
      parsed.npcs.some(npc=>npc.conflictedFacts>npc.counts.semantic || npc.expiredFacts>npc.counts.semantic)) throw Error("NPC_MULTI_MEMORY_PACKET_INVALID");
  return parsed;
}
