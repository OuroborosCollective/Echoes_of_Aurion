import { and, desc, eq } from "drizzle-orm";
import { aurionDialogueCommandReceipts } from "../drizzle/schema";
import { getQuest, type QuestKey } from "./gameplayProtocol";
import { getDb, listActiveWorldPresence } from "./db";

export const QUEST_NPC_INTERACTION_RADIUS_FIXED = 4_000;
export const questNpcPositions = Object.freeze({
  lyra: Object.freeze({ x: 6_000, z: -7_000 }),
  orun: Object.freeze({ x: 42_000, z: -38_000 }),
} as const);

type QuestMutationKind = "accept" | "complete";

function canonicalQuest(questKey: QuestKey): { npcId: "lyra" | "orun"; giver: "Lyra" | "Orun" } {
  const quest = getQuest(questKey);
  const npcId = quest.giver.toLowerCase();
  if (npcId !== "lyra" && npcId !== "orun") throw new Error("QUEST_GIVER_UNSUPPORTED");
  return { npcId, giver: quest.giver };
}

function actionKindFor(kind: QuestMutationKind) {
  return kind === "accept" ? "offer_quest" as const : "request_turn_in" as const;
}

/**
 * Quest mutations are authorized by two independent server truths:
 * 1) an owned moderated dialogue command bound to the canonical giver/quest/action;
 * 2) the player's currently active server-confirmed world presence inside that giver's AOI.
 * Client labels, selected panels and supplied giver strings are never authority.
 *
 * This module is an authority guard only. It must not define quest objectives or combat
 * completion rules; those belong to the WASD gameplay ruleset and are persisted by Aurion.
 */
export async function assertQuestNpcAuthority(values: {
  userId: number;
  questKey: QuestKey;
  kind: QuestMutationKind;
  clientGiver?: string;
}): Promise<{ npcId: "lyra" | "orun"; dialogueCommandReceiptId: string }> {
  const canonical = canonicalQuest(values.questKey);
  if (values.clientGiver !== undefined && values.clientGiver !== canonical.giver) throw new Error("QUEST_GIVER_MISMATCH");

  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const command = (await db.select().from(aurionDialogueCommandReceipts).where(and(
    eq(aurionDialogueCommandReceipts.userId, values.userId),
    eq(aurionDialogueCommandReceipts.npcId, canonical.npcId),
    eq(aurionDialogueCommandReceipts.actionKind, actionKindFor(values.kind)),
    eq(aurionDialogueCommandReceipts.questKey, values.questKey),
  )).orderBy(desc(aurionDialogueCommandReceipts.createdAt), desc(aurionDialogueCommandReceipts.id)).limit(1))[0];
  if (!command) throw new Error("QUEST_DIALOGUE_AUTHORITY_REQUIRED");

  const presence = (await listActiveWorldPresence()).find(row => row.userId === values.userId && row.zoneId === "observatory_threshold");
  if (!presence) throw new Error("QUEST_WORLD_PRESENCE_REQUIRED");
  const npc = questNpcPositions[canonical.npcId];
  const distance = Math.hypot(presence.position.x - npc.x, presence.position.z - npc.z);
  if (!Number.isFinite(distance) || distance > QUEST_NPC_INTERACTION_RADIUS_FIXED) throw new Error("QUEST_GIVER_OUT_OF_RANGE");
  return Object.freeze({ npcId: canonical.npcId, dialogueCommandReceiptId: command.id });
}
