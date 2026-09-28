import { and, desc, eq } from "drizzle-orm";
import { aurionDialogueCommandReceipts } from "../drizzle/schema";
import { getQuest, type QuestKey } from "./gameplayProtocol";
import { getDb, listActiveWorldPresence } from "./db";

export const QUEST_NPC_INTERACTION_RADIUS_FIXED = 4_000;

export type QuestNpcId = "lyra" | "orun" | "guard-north" | "farmer-north" | "tree-npc-south";
export type QuestNpcPosition = Readonly<{ x: number; z: number }>;

export const questNpcPositions: Readonly<Record<QuestNpcId, QuestNpcPosition>> = Object.freeze({
  lyra: Object.freeze({ x: 6_000, z: -7_000 }),
  orun: Object.freeze({ x: 42_000, z: -38_000 }),
  "guard-north": Object.freeze({ x: 0, z: 96_000 }),
  "farmer-north": Object.freeze({ x: 0, z: 108_000 }),
  "tree-npc-south": Object.freeze({ x: 0, z: -104_000 }),
});

type QuestMutationKind = "accept" | "complete";

function canonicalQuest(questKey: QuestKey): { npcId: QuestNpcId; giver: string } {
  const quest = getQuest(questKey);
  const npcId = quest.giver.toLowerCase();
  if (npcId === "lyra" || npcId === "orun") return { npcId, giver: quest.giver };
  if (questKey === "starter_wolves_6") return { npcId: "guard-north", giver: "Nordtorwache" };
  if (questKey === "starter_water_field") return { npcId: "farmer-north", giver: "Bauer" };
  if (questKey === "starter_apple_trees_10") return { npcId: "tree-npc-south", giver: "Apfelhain-Wächter" };
  throw new Error("QUEST_GIVER_UNSUPPORTED");
}

function actionKindFor(kind: QuestMutationKind) {
  return kind === "accept" ? "offer_quest" as const : "request_turn_in" as const;
}

function assertQuestNpcPosition(npcId: QuestNpcId) {
  const position = questNpcPositions[npcId];
  if (!position || !Number.isSafeInteger(position.x) || !Number.isSafeInteger(position.z)) {
    throw new Error("QUEST_NPC_POSITION_INVALID");
  }
  return position;
}

/**
 * Quest mutations are authorized by two independent server truths:
 * 1) an owned moderated dialogue command bound to the canonical giver/quest/action;
 * 2) the player's currently active server-confirmed world presence inside that giver's AOI.
 *
 * Client labels, selected panels and supplied giver strings are never authority.
 *
 * This module is an authority guard only. It must not define quest objectives or combat
 * completion rules; those belong to the canonical Aurion quest rules/persistence chain.
 */
export async function assertQuestNpcAuthority(values: {
  userId: number;
  questKey: QuestKey;
  kind: QuestMutationKind;
  clientGiver?: string;
}): Promise<{ npcId: QuestNpcId; dialogueCommandReceiptId: string }> {
  const canonical = canonicalQuest(values.questKey);
  if (values.clientGiver !== undefined && values.clientGiver !== canonical.giver) {
    throw new Error("QUEST_GIVER_MISMATCH");
  }

  const position = assertQuestNpcPosition(canonical.npcId);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  const command = (await db.select().from(aurionDialogueCommandReceipts).where(and(
    eq(aurionDialogueCommandReceipts.userId, values.userId),
    eq(aurionDialogueCommandReceipts.npcId, canonical.npcId),
    eq(aurionDialogueCommandReceipts.actionKind, actionKindFor(values.kind)),
    eq(aurionDialogueCommandReceipts.questKey, values.questKey),
  )).orderBy(desc(aurionDialogueCommandReceipts.createdAt), desc(aurionDialogueCommandReceipts.id)).limit(1))[0];
  if (!command) throw new Error("QUEST_DIALOGUE_AUTHORITY_REQUIRED");

  const presence = (await listActiveWorldPresence()).find(
    row => row.userId === values.userId && row.zoneId === "observatory_threshold",
  );
  if (!presence) throw new Error("QUEST_WORLD_PRESENCE_REQUIRED");

  const distance = Math.hypot(presence.position.x - position.x, presence.position.z - position.z);
  if (!Number.isFinite(distance) || distance > QUEST_NPC_INTERACTION_RADIUS_FIXED) {
    throw new Error("QUEST_GIVER_OUT_OF_RANGE");
  }

  return Object.freeze({ npcId: canonical.npcId, dialogueCommandReceiptId: command.id });
}
