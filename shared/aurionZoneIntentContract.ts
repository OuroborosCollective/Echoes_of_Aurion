import { canonicalSha256 } from "./aurionCanonicalHash";

export type AurionZoneIntentKind = "move" | "attack" | "skill" | "resource_interact" | "mob_trigger" | "quest_accept" | "quest_hand_in";

export interface AurionQuestAcceptIntent {
  type: "quest_accept";
  connectionId: string;
  entityId: string;
  clientSeq: number;
  arrivalSeq: number;
  questId: string;
  timestamp?: number;
}

export interface AurionQuestHandInIntent {
  type: "quest_hand_in";
  connectionId: string;
  entityId: string;
  clientSeq: number;
  arrivalSeq: number;
  questId: string;
  timestamp?: number;
}

export interface AurionMoveIntent {
  type: "move";
  connectionId: string;
  entityId: string;
  clientSeq: number;
  arrivalSeq: number;
  input: { x: number; z: number };
  timestamp?: number;
}

export interface AurionAttackIntent {
  type: "attack";
  connectionId: string;
  entityId: string;
  clientSeq: number;
  arrivalSeq: number;
  targetEntityId: string;
  timestamp?: number;
}

export interface AurionSkillIntent {
  type: "skill";
  connectionId: string;
  entityId: string;
  clientSeq: number;
  arrivalSeq: number;
  skillId: string;
  targetEntityId: string;
  timestamp?: number;
}

export interface AurionResourceInteractIntent {
  type: "resource_interact";
  connectionId: string;
  entityId: string;
  clientSeq: number;
  arrivalSeq: number;
  nodeId: string;
  timestamp?: number;
}

export interface AurionMobTriggerIntent {
  type: "mob_trigger";
  connectionId: string;
  entityId: string;
  clientSeq: number;
  arrivalSeq: number;
  mobEntityId: string;
  triggerType: string;
  timestamp?: number;
}

export type AurionZoneIntent =
  | AurionMoveIntent
  | AurionAttackIntent
  | AurionSkillIntent
  | AurionResourceInteractIntent
  | AurionMobTriggerIntent
  | AurionQuestAcceptIntent
  | AurionQuestHandInIntent;

export interface CanonicalIntentQueueEntry {
  intent: AurionZoneIntent;
  receivedAtTick: number;
  validationHash: string;
}

/**
 * Pure, stable sorting function for zone intents.
 * 1. entityId binary ascending
 * 2. clientSeq ascending
 * 3. type binary ascending
 */
export function orderCanonicalZoneIntents(intents: readonly AurionZoneIntent[]): AurionZoneIntent[] {
  return [...intents].sort((a, b) => {
    if (a.entityId !== b.entityId) return a.entityId < b.entityId ? -1 : 1;
    if (a.clientSeq !== b.clientSeq) return a.clientSeq - b.clientSeq;
    if (a.type !== b.type) return a.type < b.type ? -1 : 1;
    return 0;
  });
}

/**
 * Returns a canonical representation stripped of transient socket references.
 */
export function sanitizeIntentForHash(intent: AurionZoneIntent): Record<string, unknown> {
  const base = {
    type: intent.type,
    entityId: intent.entityId,
    clientSeq: intent.clientSeq,
    arrivalSeq: intent.arrivalSeq,
  };
  if (intent.type === "move") {
    const move = intent as AurionMoveIntent;
    return { ...base, input: { x: move.input.x, z: move.input.z } };
  }
  if (intent.type === "attack") {
    const attack = intent as AurionAttackIntent;
    return { ...base, targetEntityId: attack.targetEntityId };
  }
  if (intent.type === "skill") {
    const skill = intent as AurionSkillIntent;
    return { ...base, skillId: skill.skillId, targetEntityId: skill.targetEntityId };
  }
  if (intent.type === "resource_interact") {
    const res = intent as AurionResourceInteractIntent;
    return { ...base, nodeId: res.nodeId };
  }
  if (intent.type === "quest_accept") {
    const q = intent as AurionQuestAcceptIntent;
    return { ...base, questId: q.questId };
  }
  if (intent.type === "quest_hand_in") {
    const q = intent as AurionQuestHandInIntent;
    return { ...base, questId: q.questId };
  }
  return base;
}

export function hashCanonicalIntents(intents: readonly AurionZoneIntent[]): string {
  const ordered = orderCanonicalZoneIntents(intents);
  const sanitized = ordered.map(sanitizeIntentForHash);
  return canonicalSha256(sanitized);
}

