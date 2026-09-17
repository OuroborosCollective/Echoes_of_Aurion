import { canonicalJson, canonicalSha256 } from "./aurionCanonicalHash";

export type AurionZoneIntentKind =
  | "move"
  | "attack"
  | "skill"
  | "resource_interact"
  | "mob_trigger"
  | "quest_accept"
  | "quest_hand_in";

type OperationalIntentMetadata = {
  connectionId: string;
  entityId: string;
  clientSeq: number;
  /** Arrival order is diagnostic transport metadata, never canonical gameplay truth. */
  arrivalSeq: number;
  timestamp?: number;
};

export interface AurionQuestAcceptIntent extends OperationalIntentMetadata {
  type: "quest_accept";
  questId: string;
}
export interface AurionQuestHandInIntent extends OperationalIntentMetadata {
  type: "quest_hand_in";
  questId: string;
}
export interface AurionMoveIntent extends OperationalIntentMetadata {
  type: "move";
  input: { x: number; z: number };
}
export interface AurionAttackIntent extends OperationalIntentMetadata {
  type: "attack";
  targetEntityId: string;
}
export interface AurionSkillIntent extends OperationalIntentMetadata {
  type: "skill";
  skillId: string;
  targetEntityId: string;
}
export interface AurionResourceInteractIntent extends OperationalIntentMetadata {
  type: "resource_interact";
  nodeId: string;
}
export interface AurionMobTriggerIntent extends OperationalIntentMetadata {
  type: "mob_trigger";
  mobEntityId: string;
  triggerType: string;
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

function assertIntentIdentity(intent: AurionZoneIntent): void {
  if (!intent.entityId.trim()) throw new Error("AURION_INTENT_ENTITY_REQUIRED");
  if (!Number.isSafeInteger(intent.clientSeq) || intent.clientSeq < 0)
    throw new Error("AURION_INTENT_CLIENT_SEQUENCE_INVALID");
  if (!Number.isSafeInteger(intent.arrivalSeq) || intent.arrivalSeq < 0)
    throw new Error("AURION_INTENT_ARRIVAL_SEQUENCE_INVALID");
}

/**
 * Canonical gameplay form. Connection identity, wall time and arrival scheduling
 * are deliberately omitted. They may be retained in transport diagnostics only.
 */
export function sanitizeIntentForHash(intent: AurionZoneIntent): Record<string, unknown> {
  assertIntentIdentity(intent);
  const base = { type: intent.type, entityId: intent.entityId, clientSeq: intent.clientSeq };
  switch (intent.type) {
    case "move":
      return { ...base, input: { x: intent.input.x, z: intent.input.z } };
    case "attack":
      return { ...base, targetEntityId: intent.targetEntityId };
    case "skill":
      return { ...base, skillId: intent.skillId, targetEntityId: intent.targetEntityId };
    case "resource_interact":
      return { ...base, nodeId: intent.nodeId };
    case "mob_trigger":
      return { ...base, mobEntityId: intent.mobEntityId, triggerType: intent.triggerType };
    case "quest_accept":
    case "quest_hand_in":
      return { ...base, questId: intent.questId };
  }
}

/**
 * Order depends only on logical actor sequence and canonical payload, never on
 * network arrival timing. Identical logical inputs therefore order identically
 * even when their packets arrive in a different scheduling order.
 */
export function orderCanonicalZoneIntents(intents: readonly AurionZoneIntent[]): AurionZoneIntent[] {
  return [...intents].sort((left, right) => {
    assertIntentIdentity(left);
    assertIntentIdentity(right);
    if (left.entityId !== right.entityId) return left.entityId < right.entityId ? -1 : 1;
    if (left.clientSeq !== right.clientSeq) return left.clientSeq - right.clientSeq;
    if (left.type !== right.type) return left.type < right.type ? -1 : 1;
    const leftPayload = canonicalJson(sanitizeIntentForHash(left));
    const rightPayload = canonicalJson(sanitizeIntentForHash(right));
    return leftPayload < rightPayload ? -1 : leftPayload > rightPayload ? 1 : 0;
  });
}

export function hashCanonicalIntents(intents: readonly AurionZoneIntent[]): string {
  return canonicalSha256(orderCanonicalZoneIntents(intents).map(sanitizeIntentForHash));
}
