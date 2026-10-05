import type { DialogueQuestKey } from "./wasdAurionDialogueQuestIntentProtocol";
import { and, desc, eq } from "drizzle-orm";
import { aurionDialogueCommandReceipts } from "../drizzle/schema";
import { getQuest } from "./gameplayProtocol";
import { getDb, listActiveWorldPresence } from "./db";
import {
  aurionQuestNpcForGiver,
  aurionStarterVillageQuestNpcs,
  type AurionQuestNpcId,
} from "./aurionStarterVillageContract";

export const QUEST_NPC_INTERACTION_RADIUS_FIXED = 4_000;
export const questNpcPositions = Object.freeze(Object.fromEntries(
  Object.entries(aurionStarterVillageQuestNpcs).map(([id, npc]) => [id, npc.position]),
)) as Readonly<Record<AurionQuestNpcId, Readonly<{ x: number; z: number }>>>;

type QuestMutationKind = "accept" | "complete";
type QuestDialogueAuthorityEvidence = Readonly<{
  id: string;
  userId: number;
  npcId: string;
  actionKind: "offer_quest" | "request_turn_in";
  questKey: string;
}>;
type QuestWorldPresenceEvidence = Readonly<{
  userId: number;
  zoneId: string;
  position: Readonly<{ x: number; z: number }>;
}>;

function canonicalQuest(questKey: DialogueQuestKey) {
  if (questKey === "starter-wolves-6") {
    const npc = aurionStarterVillageQuestNpcs.starter_village_north_gate_guard;
    return { npcId: npc.id, giver: npc.displayName, zoneId: npc.zoneId, position: npc.position };
  }
  const quest = getQuest(questKey);
  const npc = aurionQuestNpcForGiver(quest.giver);
  if (!npc) throw new Error("QUEST_GIVER_UNSUPPORTED");
  return { npcId: npc.id, giver: npc.displayName, zoneId: npc.zoneId, position: npc.position };
}

function actionKindFor(kind: QuestMutationKind) {
  return kind === "accept" ? "offer_quest" as const : "request_turn_in" as const;
}

export function assertQuestNpcAuthorityEvidence(values: {
  userId: number;
  questKey: DialogueQuestKey;
  kind: QuestMutationKind;
  command?: QuestDialogueAuthorityEvidence;
  presence?: QuestWorldPresenceEvidence;
}): { npcId: AurionQuestNpcId; dialogueCommandReceiptId: string } {
  const canonical = canonicalQuest(values.questKey);
  const command = values.command;
  if (!command) throw new Error("QUEST_DIALOGUE_AUTHORITY_REQUIRED");
  if (command.npcId !== canonical.npcId) throw new Error("QUEST_GIVER_MISMATCH");
  if (command.userId !== values.userId) throw new Error("QUEST_DIALOGUE_USER_MISMATCH");
  if (command.questKey !== values.questKey) throw new Error("QUEST_DIALOGUE_QUEST_MISMATCH");
  if (command.actionKind !== actionKindFor(values.kind)) throw new Error("QUEST_DIALOGUE_ACTION_MISMATCH");

  const presence = values.presence;
  if (!presence || presence.userId !== values.userId) throw new Error("QUEST_WORLD_PRESENCE_REQUIRED");
  if (presence.zoneId !== canonical.zoneId) throw new Error("QUEST_WORLD_ZONE_MISMATCH");
  const distance = Math.hypot(presence.position.x - canonical.position.x, presence.position.z - canonical.position.z);
  if (!Number.isFinite(distance) || distance > QUEST_NPC_INTERACTION_RADIUS_FIXED) throw new Error("QUEST_GIVER_OUT_OF_RANGE");
  return Object.freeze({ npcId: canonical.npcId, dialogueCommandReceiptId: command.id });
}

/**
 * Quest mutations are authorized by two independent server truths:
 * 1) an owned moderated dialogue command bound to the canonical giver/quest/action;
 * 2) the player's currently active server-confirmed world presence inside that giver's AOI.
 * Client labels, selected panels and supplied giver strings are never authority.
 *
 * This module is an authority guard only. It must not define quest objectives or combat
 * completion rules; Aurion alone owns those quest and combat rules. WASD is historical
 * implementation provenance only and has no active authority.
 */
export async function assertQuestNpcAuthority(values: {
  userId: number;
  questKey: DialogueQuestKey;
  kind: QuestMutationKind;
  clientGiver?: string;
}): Promise<{ npcId: AurionQuestNpcId; dialogueCommandReceiptId: string }> {
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
  const presence = (await listActiveWorldPresence()).find(row => row.userId === values.userId);
  return assertQuestNpcAuthorityEvidence({
    userId: values.userId,
    questKey: values.questKey,
    kind: values.kind,
    ...(command ? { command } : {}),
    ...(presence ? { presence } : {}),
  });
}
