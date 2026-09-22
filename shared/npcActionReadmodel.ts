import { z } from "zod";

const actionRow = z
  .object({
    npcId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/),
    actionReceiptId: z.string().regex(/^nar_[a-f0-9]{56}$/),
    resolutionIndex: z.number().int().min(0),
    action: z.string().min(1).max(64),
    effectsHash: z.string().regex(/^[a-f0-9]{64}$/),
    readbackHash: z.string().regex(/^[a-f0-9]{64}$/),
    sourceRevision: z.string().regex(/^[a-f0-9]{40}$/),
  })
  .strict();

const actionPacket = z
  .object({
    userId: z.number().int().positive(),
    format: z.literal("aurion-public-npc-actions.v1"),
    actions: z.array(actionRow).max(6),
  })
  .strict();

export type PublicNpcAction = z.infer<typeof actionRow>;

export function decodeOwnedNpcActions(
  input: unknown,
  userId: number
): { userId: number; format: "aurion-public-npc-actions.v1"; actions: PublicNpcAction[] } {
  const parsed = actionPacket.parse(input);
  if (parsed.userId !== userId) throw new Error("NPC_ACTIONS_PACKET_INVALID");
  return parsed;
}
