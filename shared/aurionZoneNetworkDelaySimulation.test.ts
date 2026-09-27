import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "./aurionCanonicalHash";
import { compareAurionZoneNetworkSchedules, simulateAurionZoneNetworkDelay, type ZoneNetworkMessage, type ZoneNetworkReceipt } from "./aurionZoneNetworkDelaySimulation";
const revision = "a".repeat(40);
const hash = (value: string) => canonicalSha256({ value });
const receipts: ZoneNetworkReceipt[] = [
  { receiptHash: hash("tick-10"), tick: 10, sourceRevision: revision, rulesetVersion: "aurion.zone.rules.v2" },
  { receiptHash: hash("tick-11"), tick: 11, sourceRevision: revision, rulesetVersion: "aurion.zone.rules.v2" },
];
function message(id: string, sourceZone: string, targetZone: string, sendTick: number, delayTicks: number, sequence: number, receiptIndex: number): ZoneNetworkMessage {
  return { messageId: id, sourceZone, targetZone, sendTick, delayTicks, deliveryTick: sendTick + delayTicks, sequence, payloadHash: hash(id), causalReceiptHash: receipts[receiptIndex]!.receiptHash };
}
function scenario(delays: readonly [number, number]) {
  return simulateAurionZoneNetworkDelay({
    sourceRevision: revision,
    rulesetVersion: "aurion.zone.rules.v2",
    scenarioSeed: "cross-zone-replay-617",
    messages: [message("handover-1", "zone-a", "zone-b", 10, delays[0], 1, 0), message("handover-2", "zone-b", "zone-a", 11, delays[1], 0, 1)],
    receipts,
  });
}
describe("Issue #617 deterministic zone network delay simulation", () => {
  it("reproduces canonical receipt-bound gameplay across different delay schedules", () => {
    const first = scenario([0, 2]);
    const second = scenario([3, 0]);
    expect(first.replayVerdict).toBe("MATCH");
    expect(second.replayVerdict).toBe("MATCH");
    expect(first.deliveryTraceHash).not.toBe(second.deliveryTraceHash);
    expect(compareAurionZoneNetworkSchedules(first, second)).toEqual({ replayVerdict: "MATCH", sameCanonicalReceipts: true, sameGameplayVerdict: true });
  });
  it("uses the explicit delivery total order for simultaneous messages", () => {
    const result = simulateAurionZoneNetworkDelay({ sourceRevision: revision, rulesetVersion: "aurion.zone.rules.v2", scenarioSeed: "same-tick", messages: [message("b", "zone-b", "zone-a", 10, 1, 0, 0), message("a", "zone-a", "zone-b", 10, 1, 0, 0)], receipts });
    expect(result.deliveries.map(item => item.messageId)).toEqual(["a", "b"]);
  });
  it("keeps duplicate delivery idempotent and does not create new gameplay truth", () => {
    const base = message("duplicate", "zone-a", "zone-b", 10, 0, 0, 0);
    const result = simulateAurionZoneNetworkDelay({ sourceRevision: revision, rulesetVersion: "aurion.zone.rules.v2", scenarioSeed: "duplicate", messages: [base, { ...base, deliveryTick: 11, delayTicks: 1, sequence: 1 }], receipts });
    expect(result.deliveries.map(item => item.status)).toEqual(["DELIVERED", "DUPLICATE"]);
    expect(result.replayVerdict).toBe("MATCH");
  });
  it("rejects late or forged messages without a canonical receipt", () => {
    const result = simulateAurionZoneNetworkDelay({ sourceRevision: revision, rulesetVersion: "aurion.zone.rules.v2", scenarioSeed: "rejection", messages: [{ ...message("forged", "zone-a", "zone-b", 10, 5, 0, 0), causalReceiptHash: hash("not-a-receipt") }], receipts });
    expect(result.replayVerdict).toBe("FIRST_DIVERGENCE");
    expect(result.firstDivergence).toEqual({ tick: 15, reason: "CAUSAL_RECEIPT_NOT_FOUND" });
    expect(result.deliveries[0]!.status).toBe("REJECTED");
  });
  it("fails closed on delivery-tick tampering", () => {
    expect(() => simulateAurionZoneNetworkDelay({ sourceRevision: revision, rulesetVersion: "aurion.zone.rules.v2", scenarioSeed: "tamper", messages: [{ ...message("tampered", "zone-a", "zone-b", 10, 1, 0, 0), deliveryTick: 99 }], receipts })).toThrow("AURION_NETWORK_DELIVERY_TICK_MISMATCH");
  });
});
