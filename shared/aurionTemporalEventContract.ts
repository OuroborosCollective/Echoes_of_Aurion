import { canonicalJson, canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_TEMPORAL_EVENT_SCHEMA = "aurion.temporal.event.v1" as const;

export type AurionTemporalDomain =
  | "world"
  | "zone"
  | "quest"
  | "npc"
  | "faction"
  | "economy"
  | "ownership"
  | "social";

export interface AurionTemporalEvent {
  schema: typeof AURION_TEMPORAL_EVENT_SCHEMA;
  eventId: string;
  worldId: string;
  epoch: number;
  domain: AurionTemporalDomain;
  subjectIds: string[];
  validFromEpoch: number;
  validToEpoch: number | null;
  sourceReceiptHash: string;
  sourceWorldRoot: string;
  predecessorEventIds: string[];
  payload: Record<string, unknown>;
  payloadHash: string;
  eventHash: string;
}

export function computeTemporalPayloadHash(payload: Record<string, unknown>): string {
  return canonicalSha256(payload);
}

export function computeTemporalEventHash(
  event: Omit<AurionTemporalEvent, "eventHash" | "payloadHash" | "schema">,
  payloadHash: string
): string {
  const structure = {
    schema: AURION_TEMPORAL_EVENT_SCHEMA,
    eventId: event.eventId,
    worldId: event.worldId,
    epoch: event.epoch,
    domain: event.domain,
    subjectIds: [...event.subjectIds].sort(),
    validFromEpoch: event.validFromEpoch,
    validToEpoch: event.validToEpoch,
    sourceReceiptHash: event.sourceReceiptHash,
    sourceWorldRoot: event.sourceWorldRoot,
    predecessorEventIds: [...event.predecessorEventIds].sort(),
    payloadHash,
  };
  return canonicalSha256(structure);
}

export function createTemporalEvent(params: {
  eventId: string;
  worldId: string;
  epoch: number;
  domain: AurionTemporalDomain;
  subjectIds: string[];
  validFromEpoch: number;
  validToEpoch?: number | null;
  sourceReceiptHash: string;
  sourceWorldRoot: string;
  predecessorEventIds?: string[];
  payload: Record<string, unknown>;
}): AurionTemporalEvent {
  const payloadHash = computeTemporalPayloadHash(params.payload);
  const predecessorEventIds = params.predecessorEventIds ? [...params.predecessorEventIds].sort() : [];
  const subjectIds = [...params.subjectIds].sort();
  const validToEpoch = params.validToEpoch !== undefined ? params.validToEpoch : null;

  const eventHash = computeTemporalEventHash(
    {
      eventId: params.eventId,
      worldId: params.worldId,
      epoch: params.epoch,
      domain: params.domain,
      subjectIds,
      validFromEpoch: params.validFromEpoch,
      validToEpoch,
      sourceReceiptHash: params.sourceReceiptHash,
      sourceWorldRoot: params.sourceWorldRoot,
      predecessorEventIds,
      payload: params.payload,
    },
    payloadHash
  );

  return {
    schema: AURION_TEMPORAL_EVENT_SCHEMA,
    eventId: params.eventId,
    worldId: params.worldId,
    epoch: params.epoch,
    domain: params.domain,
    subjectIds,
    validFromEpoch: params.validFromEpoch,
    validToEpoch,
    sourceReceiptHash: params.sourceReceiptHash,
    sourceWorldRoot: params.sourceWorldRoot,
    predecessorEventIds,
    payload: params.payload,
    payloadHash,
    eventHash,
  };
}

export function verifyTemporalEventIntegrity(event: AurionTemporalEvent): { valid: boolean; reason?: string } {
  if (event.schema !== AURION_TEMPORAL_EVENT_SCHEMA) {
    return { valid: false, reason: "INVALID_SCHEMA" };
  }
  if (!Number.isInteger(event.epoch) || event.epoch < 0) {
    return { valid: false, reason: "INVALID_EPOCH" };
  }
  if (!Number.isInteger(event.validFromEpoch) || event.validFromEpoch < 0) {
    return { valid: false, reason: "INVALID_VALID_FROM_EPOCH" };
  }
  if (event.validToEpoch !== null && (!Number.isInteger(event.validToEpoch) || event.validToEpoch < event.validFromEpoch)) {
    return { valid: false, reason: "INVALID_VALID_TO_EPOCH" };
  }
  const expectedPayloadHash = computeTemporalPayloadHash(event.payload);
  if (expectedPayloadHash !== event.payloadHash) {
    return { valid: false, reason: "PAYLOAD_HASH_MISMATCH" };
  }
  const expectedEventHash = computeTemporalEventHash(
    {
      eventId: event.eventId,
      worldId: event.worldId,
      epoch: event.epoch,
      domain: event.domain,
      subjectIds: event.subjectIds,
      validFromEpoch: event.validFromEpoch,
      validToEpoch: event.validToEpoch,
      sourceReceiptHash: event.sourceReceiptHash,
      sourceWorldRoot: event.sourceWorldRoot,
      predecessorEventIds: event.predecessorEventIds,
      payload: event.payload,
    },
    event.payloadHash
  );
  if (expectedEventHash !== event.eventHash) {
    return { valid: false, reason: "EVENT_HASH_MISMATCH" };
  }
  return { valid: true };
}
