import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_ECONOMIC_EVENT_SCHEMA = "aurion.economic.event.v1" as const;

export type EconomicEventType =
  | "MINT"
  | "BURN"
  | "TRANSFER"
  | "TRADE"
  | "CRAFT_INPUT"
  | "CRAFT_OUTPUT"
  | "LOOT_CREATE"
  | "REWARD"
  | "MARKET_SETTLEMENT"
  | "GUILD_DEPOSIT"
  | "GUILD_WITHDRAW";

export interface EconomicEvent {
  schema: typeof AURION_ECONOMIC_EVENT_SCHEMA;
  economicEventId: string;
  worldId: string;
  epoch: number;
  eventType: EconomicEventType;
  assetId?: string;
  currencyId?: string;
  fromOwner?: string;
  toOwner?: string;
  quantity: string; // Exact integer minor units represented as string
  sourceReceiptHash: string;
  worldRootHash: string;
  economicEventHash: string;
}

export function computeEconomicEventHash(
  event: Omit<EconomicEvent, "economicEventHash" | "schema">
): string {
  const structure = {
    schema: AURION_ECONOMIC_EVENT_SCHEMA,
    economicEventId: event.economicEventId,
    worldId: event.worldId,
    epoch: event.epoch,
    eventType: event.eventType,
    assetId: event.assetId ?? null,
    currencyId: event.currencyId ?? null,
    fromOwner: event.fromOwner ?? null,
    toOwner: event.toOwner ?? null,
    quantity: event.quantity,
    sourceReceiptHash: event.sourceReceiptHash,
    worldRootHash: event.worldRootHash,
  };
  return canonicalSha256(structure);
}

export function createEconomicEvent(params: {
  economicEventId: string;
  worldId: string;
  epoch: number;
  eventType: EconomicEventType;
  assetId?: string;
  currencyId?: string;
  fromOwner?: string;
  toOwner?: string;
  quantity: string;
  sourceReceiptHash: string;
  worldRootHash: string;
}): EconomicEvent {
  // Validate exact non-negative integer representation for quantity
  if (!/^\d+$/.test(params.quantity)) {
    throw new Error(`INVALID_QUANTITY_FORMAT: ${params.quantity}. Must be non-negative integer string.`);
  }

  const hash = computeEconomicEventHash(params);
  return {
    schema: AURION_ECONOMIC_EVENT_SCHEMA,
    ...params,
    economicEventHash: hash,
  };
}

export function verifyEconomicEventIntegrity(event: EconomicEvent): { valid: boolean; reason?: string } {
  if (event.schema !== AURION_ECONOMIC_EVENT_SCHEMA) {
    return { valid: false, reason: "INVALID_SCHEMA" };
  }
  if (!Number.isInteger(event.epoch) || event.epoch < 0) {
    return { valid: false, reason: "INVALID_EPOCH" };
  }
  if (!/^\d+$/.test(event.quantity)) {
    return { valid: false, reason: "INVALID_QUANTITY" };
  }
  const expectedHash = computeEconomicEventHash(event);
  if (expectedHash !== event.economicEventHash) {
    return { valid: false, reason: "HASH_MISMATCH" };
  }
  return { valid: true };
}
