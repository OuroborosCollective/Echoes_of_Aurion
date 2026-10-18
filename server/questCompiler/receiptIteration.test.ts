import { describe, expect, it } from "vitest";
import type { QuestReceipt } from "../../shared/aurionQuestContract";
import { findQuestReceiptReplay, maxQuestReceiptSequence } from "./receiptIteration";

function receipt(id: string, instanceId: string, idempotencyKey: string, eventSequence: number): QuestReceipt {
  return {
    id,
    instanceId,
    eventSequence,
    planHash: "a".repeat(64),
    graphHash: "b".repeat(64),
    previousStateHash: "c".repeat(64),
    resultStateHash: "d".repeat(64),
    idempotencyKey,
    receiptHash: "e".repeat(64),
    createdAt: "2026-10-18T13:14:00.000Z",
  };
}

function legacyReplay(receipts: Map<string, QuestReceipt>, instanceId: string, idempotencyKey: string) {
  return [...receipts.values()].find(candidate =>
    candidate.instanceId === instanceId && candidate.idempotencyKey === idempotencyKey
  );
}

function legacyMaximum(receipts: Map<string, QuestReceipt>, instanceId: string) {
  return [...receipts.values()]
    .filter(candidate => candidate.instanceId === instanceId)
    .reduce((maximum, candidate) => Math.max(maximum, candidate.eventSequence), 0);
}

describe("quest receipt direct iteration", () => {
  it("preserves replay identity, insertion order, sequence maxima and caller state", () => {
    const receipts = new Map<string, QuestReceipt>([
      ["foreign-high", receipt("foreign-high", "other", "foreign", 999)],
      ["target-first", receipt("target-first", "quest-a", "same-key", 3)],
      ["target-low", receipt("target-low", "quest-a", "low", 1)],
      ["target-second", receipt("target-second", "quest-a", "same-key", 7)],
      ["target-max", receipt("target-max", "quest-a", "max", 12)],
    ]);
    const before = [...receipts.entries()];

    expect(findQuestReceiptReplay(receipts.values(), "quest-a", "same-key"))
      .toBe(legacyReplay(receipts, "quest-a", "same-key"));
    expect(findQuestReceiptReplay(receipts.values(), "quest-a", "missing"))
      .toBe(legacyReplay(receipts, "quest-a", "missing"));
    expect(maxQuestReceiptSequence(receipts.values(), "quest-a"))
      .toBe(legacyMaximum(receipts, "quest-a"));
    expect(maxQuestReceiptSequence(receipts.values(), "missing")).toBe(0);
    expect([...receipts.entries()]).toEqual(before);
  });

  it("matches the former array algorithm across seeded order, ties and misses", () => {
    let seed = 0x983;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed;
    };

    for (let sample = 0; sample < 64; sample += 1) {
      const receipts = new Map<string, QuestReceipt>();
      const count = random() % 256;
      for (let index = 0; index < count; index += 1) {
        const instanceId = `quest-${random() % 7}`;
        const idempotencyKey = `key-${random() % 19}`;
        const candidate = receipt(`receipt-${sample}-${index}`, instanceId, idempotencyKey, random() % 32);
        receipts.set(candidate.id, candidate);
      }
      for (const instanceId of ["quest-0", "quest-3", "quest-6", "missing"]) {
        expect(maxQuestReceiptSequence(receipts.values(), instanceId))
          .toBe(legacyMaximum(receipts, instanceId));
        for (const idempotencyKey of ["key-0", "key-9", "key-18", "missing"]) {
          expect(findQuestReceiptReplay(receipts.values(), instanceId, idempotencyKey))
            .toBe(legacyReplay(receipts, instanceId, idempotencyKey));
        }
      }
    }
  });
});
