import { canonicalSha256 } from "./aurionCanonicalHash";

export const AURION_ZONE_NETWORK_DELAY_PROTOCOL = "aurion.zone-network-delay-simulation.v1" as const;
export type ZoneNetworkDeliveryStatus = "DELIVERED" | "DUPLICATE" | "REJECTED";
export type ZoneNetworkReplayVerdict = "MATCH" | "FIRST_DIVERGENCE" | "UNPROVABLE";
export type ZoneNetworkReceipt = Readonly<{ receiptHash: string; tick: number; sourceRevision: string; rulesetVersion: string }>;
export type ZoneNetworkMessage = Readonly<{ messageId: string; sourceZone: string; targetZone: string; sendTick: number; delayTicks: number; deliveryTick: number; sequence: number; payloadHash: string; causalReceiptHash: string }>;
export type ZoneNetworkDelivery = Readonly<{ messageId: string; deliveryTick: number; sourceZone: string; targetZone: string; sequence: number; status: ZoneNetworkDeliveryStatus; causalReceiptHash: string }>;
export type ZoneNetworkSimulation = Readonly<{
  protocol: typeof AURION_ZONE_NETWORK_DELAY_PROTOCOL;
  sourceRevision: string;
  rulesetVersion: string;
  scenarioHash: string;
  inputHash: string;
  deliveryTraceHash: string;
  canonicalReceiptHash: string;
  deliveries: readonly ZoneNetworkDelivery[];
  replayVerdict: ZoneNetworkReplayVerdict;
  firstDivergence: Readonly<{ tick: number; reason: string }> | null;
}>;
const SHA = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
function assertId(value: string, code: string): void { if (!ID.test(value)) throw new Error(code); }
function assertHash(value: string, code: string): void { if (!SHA.test(value)) throw new Error(code); }
function assertTick(value: number, code: string): void { if (!Number.isSafeInteger(value) || value < 0) throw new Error(code); }
function normalizeMessage(message: ZoneNetworkMessage): ZoneNetworkMessage {
  assertId(message.messageId, "AURION_NETWORK_MESSAGE_ID_INVALID");
  assertId(message.sourceZone, "AURION_NETWORK_SOURCE_ZONE_INVALID");
  assertId(message.targetZone, "AURION_NETWORK_TARGET_ZONE_INVALID");
  assertTick(message.sendTick, "AURION_NETWORK_SEND_TICK_INVALID");
  assertTick(message.delayTicks, "AURION_NETWORK_DELAY_INVALID");
  assertTick(message.deliveryTick, "AURION_NETWORK_DELIVERY_TICK_INVALID");
  assertTick(message.sequence, "AURION_NETWORK_SEQUENCE_INVALID");
  if (message.deliveryTick !== message.sendTick + message.delayTicks) throw new Error("AURION_NETWORK_DELIVERY_TICK_MISMATCH");
  assertHash(message.payloadHash, "AURION_NETWORK_PAYLOAD_HASH_INVALID");
  assertHash(message.causalReceiptHash, "AURION_NETWORK_RECEIPT_HASH_INVALID");
  return Object.freeze({ ...message });
}
function compareDelivery(left: ZoneNetworkMessage, right: ZoneNetworkMessage): number {
  return left.deliveryTick - right.deliveryTick || left.sourceZone.localeCompare(right.sourceZone) || left.targetZone.localeCompare(right.targetZone) || left.sequence - right.sequence || left.messageId.localeCompare(right.messageId);
}
export function simulateAurionZoneNetworkDelay(input: Readonly<{
  sourceRevision: string;
  rulesetVersion: string;
  scenarioSeed: string;
  messages: readonly ZoneNetworkMessage[];
  receipts: readonly ZoneNetworkReceipt[];
}>): ZoneNetworkSimulation {
  if (!REVISION.test(input.sourceRevision)) throw new Error("AURION_NETWORK_SOURCE_REVISION_INVALID");
  if (!input.rulesetVersion.trim() || !input.scenarioSeed.trim()) throw new Error("AURION_NETWORK_SCENARIO_IDENTITY_INVALID");
  if (input.messages.length === 0 || input.messages.length > 4096) throw new Error("AURION_NETWORK_MESSAGE_BOUNDS");
  const messages = input.messages.map(normalizeMessage).sort(compareDelivery);
  const receiptByHash = new Map<string, ZoneNetworkReceipt>();
  for (const receipt of input.receipts) {
    assertHash(receipt.receiptHash, "AURION_NETWORK_RECEIPT_HASH_INVALID");
    assertTick(receipt.tick, "AURION_NETWORK_RECEIPT_TICK_INVALID");
    if (receipt.sourceRevision !== input.sourceRevision || receipt.rulesetVersion !== input.rulesetVersion) throw new Error("AURION_NETWORK_RECEIPT_IDENTITY_MISMATCH");
    if (receiptByHash.has(receipt.receiptHash)) throw new Error("AURION_NETWORK_RECEIPT_DUPLICATE");
    receiptByHash.set(receipt.receiptHash, receipt);
  }
  const seen = new Set<string>();
  const deliveries: ZoneNetworkDelivery[] = [];
  let firstDivergence: { tick: number; reason: string } | null = null;
  for (const message of messages) {
    const status: ZoneNetworkDeliveryStatus = seen.has(message.messageId) ? "DUPLICATE" : receiptByHash.has(message.causalReceiptHash) ? "DELIVERED" : "REJECTED";
    if (status === "DELIVERED") seen.add(message.messageId);
    if (status === "REJECTED" && firstDivergence === null) firstDivergence = { tick: message.deliveryTick, reason: "CAUSAL_RECEIPT_NOT_FOUND" };
    deliveries.push(Object.freeze({ messageId: message.messageId, deliveryTick: message.deliveryTick, sourceZone: message.sourceZone, targetZone: message.targetZone, sequence: message.sequence, status, causalReceiptHash: message.causalReceiptHash }));
  }
  const canonicalReceipts = [...receiptByHash.values()].sort((a, b) => a.tick - b.tick || a.receiptHash.localeCompare(b.receiptHash));
  const canonicalReceiptHash = canonicalSha256({ domain: "aurion.zone-network.canonical-receipts.v1", receipts: canonicalReceipts });
  const inputHash = canonicalSha256({ domain: "aurion.zone-network.input.v1", sourceRevision: input.sourceRevision, rulesetVersion: input.rulesetVersion, scenarioSeed: input.scenarioSeed, messages });
  const deliveryTraceHash = canonicalSha256({ domain: AURION_ZONE_NETWORK_DELAY_PROTOCOL, deliveries });
  const replayVerdict: ZoneNetworkReplayVerdict = firstDivergence ? "FIRST_DIVERGENCE" : "MATCH";
  return Object.freeze({ protocol: AURION_ZONE_NETWORK_DELAY_PROTOCOL, sourceRevision: input.sourceRevision, rulesetVersion: input.rulesetVersion, scenarioHash: canonicalSha256({ domain: "aurion.zone-network.scenario.v1", scenarioSeed: input.scenarioSeed, inputHash }), inputHash, deliveryTraceHash, canonicalReceiptHash, deliveries: Object.freeze(deliveries), replayVerdict, firstDivergence });
}
export function compareAurionZoneNetworkSchedules(first: ZoneNetworkSimulation, second: ZoneNetworkSimulation): Readonly<{ replayVerdict: ZoneNetworkReplayVerdict; sameCanonicalReceipts: boolean; sameGameplayVerdict: boolean }> {
  const sameCanonicalReceipts = first.canonicalReceiptHash === second.canonicalReceiptHash;
  const sameGameplayVerdict = first.replayVerdict === second.replayVerdict && (first.firstDivergence?.reason ?? null) === (second.firstDivergence?.reason ?? null);
  return Object.freeze({ replayVerdict: sameCanonicalReceipts && sameGameplayVerdict ? "MATCH" : "FIRST_DIVERGENCE", sameCanonicalReceipts, sameGameplayVerdict });
}
