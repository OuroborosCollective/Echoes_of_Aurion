import { z } from "zod";

const hash64=z.string().regex(/^[a-f0-9]{64}$/);
const action=z.enum(["consume","produce","trade","caravan","patrol","rest","socialize"]);
const row=z.object({
  npcId:z.string().min(1).max(96),
  actionReceiptId:z.string().min(1).max(96),
  resolutionIndex:z.number().int().nonnegative(),
  action,
  effectsHash:hash64,
  readbackHash:hash64,
  sourceRevision:z.string().regex(/^[a-f0-9]{40}$/),
}).strict();
const packet=z.object({
  userId:z.number().int().positive(),
  format:z.literal("aurion-public-npc-actions.v1"),
  actions:z.array(row).max(6),
}).strict();

export type PublicNpcAction=z.infer<typeof row>;
export type PublicNpcActionPacket=z.infer<typeof packet>;

export function decodeOwnedNpcActions(input:unknown,userId:number):PublicNpcActionPacket {
  const value=packet.parse(input);
  if(value.userId!==userId) throw new Error("NPC_ACTION_PACKET_OWNER_INVALID");
  if(value.actions.some((entry,index)=>index>0&&value.actions[index-1]!.npcId>=entry.npcId)) throw new Error("NPC_ACTION_PACKET_ORDER_INVALID");
  if(new Set(value.actions.map(entry=>entry.npcId)).size!==value.actions.length) throw new Error("NPC_ACTION_PACKET_DUPLICATE_NPC");
  return value;
}
