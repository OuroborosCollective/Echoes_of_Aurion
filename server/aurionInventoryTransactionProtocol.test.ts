import { describe, expect, it } from "vitest";
import {
  aurionInventoryStateHash,
  resolveAurionInventoryTransaction,
  type AurionInventoryStack,
  type AurionInventoryState,
} from "./aurionInventoryTransactionProtocol";

const stack = (id: string, quantityExact: string, overrides: Partial<AurionInventoryStack> = {}): AurionInventoryStack => ({
  id,
  version: "aurion_v2",
  definitionId: "mat_wood_oak",
  provenanceHash: "prov-wood",
  mergeKey: "merge-wood",
  quantityExact,
  maxQuantityExact: "99",
  ...overrides,
});

const state = (...stacks: AurionInventoryStack[]): AurionInventoryState => ({
  ownerUserId: 7,
  revisionExact: "0",
  stacks,
});

describe("aurion inventory transaction protocol", () => {
  it("merges compatible stacks deterministically and conserves quantity", () => {
    const resolved = resolveAurionInventoryTransaction({
      before: state(stack("b", "5"), stack("a", "7")),
      command: { operation: "merge", sourceStackId: "a", targetStackId: "b", quantityExact: "7" },
      idempotencyKey: "merge-1",
    });
    expect(resolved.status).toBe("applied");
    expect(resolved.state.revisionExact).toBe("1");
    expect(resolved.state.stacks).toEqual([stack("b", "12")]);
    expect(resolved.receipt.beforeStateHash).toBe(aurionInventoryStateHash(state(stack("b", "5"), stack("a", "7"))));
  });

  it("orders state independently of input row order", () => {
    const left = aurionInventoryStateHash(state(stack("z", "2"), stack("a", "1")));
    const right = aurionInventoryStateHash(state(stack("a", "1"), stack("z", "2")));
    expect(left).toBe(right);
  });

  it("splits with a stable content-derived identity", () => {
    const command = { operation: "split" as const, sourceStackId: "source", quantityExact: "4" };
    const first = resolveAurionInventoryTransaction({ before: state(stack("source", "10")), command, idempotencyKey: "split-1" });
    const second = resolveAurionInventoryTransaction({ before: state(stack("source", "10")), command, idempotencyKey: "split-2" });
    expect(first.state).toEqual(second.state);
    expect(first.state.stacks).toHaveLength(2);
    expect(first.state.stacks[0]?.quantityExact).toBe("4");
    expect(first.state.stacks[1]?.quantityExact).toBe("6");
    expect(first.state.stacks.map(item => item.quantityExact).reduce((a, b) => BigInt(a) + BigInt(b), 0n)).toBe(10n);
  });

  it("consumes partially or fully without creating another stack", () => {
    const partial = resolveAurionInventoryTransaction({
      before: state(stack("source", "10")),
      command: { operation: "consume", sourceStackId: "source", quantityExact: "3" },
      idempotencyKey: "consume-1",
    });
    expect(partial.state.stacks).toEqual([stack("source", "7")]);

    const full = resolveAurionInventoryTransaction({
      before: state(stack("source", "10")),
      command: { operation: "consume", sourceStackId: "source", quantityExact: "10" },
      idempotencyKey: "consume-2",
    });
    expect(full.state.stacks).toEqual([]);
  });

  it("replays the exact prior result and rejects conflicting idempotency reuse", () => {
    const before = state(stack("source", "10"));
    const first = resolveAurionInventoryTransaction({
      before,
      command: { operation: "consume", sourceStackId: "source", quantityExact: "2" },
      idempotencyKey: "same-key",
    });
    const replay = resolveAurionInventoryTransaction({
      before: first.state,
      command: { operation: "consume", sourceStackId: "source", quantityExact: "2" },
      idempotencyKey: "same-key",
      priorReceipt: first.receipt,
    });
    expect(replay.status).toBe("replay");
    expect(replay.effectApplied).toBe(false);
    expect(replay.receipt).toEqual(first.receipt);
    expect(() => resolveAurionInventoryTransaction({
      before: first.state,
      command: { operation: "consume", sourceStackId: "source", quantityExact: "3" },
      idempotencyKey: "same-key",
      priorReceipt: first.receipt,
    })).toThrow("INVENTORY_IDEMPOTENCY_CONFLICT");
  });

  it("fails closed on incompatible stacks, capacity overflow and invalid splits", () => {
    expect(() => resolveAurionInventoryTransaction({
      before: state(stack("a", "2"), stack("b", "2", { mergeKey: "different" })),
      command: { operation: "merge", sourceStackId: "a", targetStackId: "b", quantityExact: "1" },
      idempotencyKey: "merge-bad",
    })).toThrow("STACKS_NOT_COMPATIBLE");

    expect(() => resolveAurionInventoryTransaction({
      before: state(stack("a", "2"), stack("b", "98")),
      command: { operation: "merge", sourceStackId: "a", targetStackId: "b", quantityExact: "2" },
      idempotencyKey: "merge-cap",
    })).toThrow("MERGE_CAPACITY_EXCEEDED");

    expect(() => resolveAurionInventoryTransaction({
      before: state(stack("a", "1")),
      command: { operation: "split", sourceStackId: "a", quantityExact: "1" },
      idempotencyKey: "split-bad",
    })).toThrow("SPLIT_REQUIRES_TWO_NON_EMPTY_STACKS");
  });

  it("enforces idempotency key max length of 128 characters", () => {
    const before = state(stack("source", "10"));
    const command = { operation: "consume" as const, sourceStackId: "source", quantityExact: "1" };
    const validKey = "k".repeat(128);
    const valid = resolveAurionInventoryTransaction({ before, command, idempotencyKey: validKey });
    expect(valid.status).toBe("applied");

    const invalidKey = "k".repeat(129);
    expect(() => resolveAurionInventoryTransaction({ before, command, idempotencyKey: invalidKey })).toThrow("IDEMPOTENCY_KEY_INVALID");
  });

  it("rejects replay when prior receipt resultHash does not match", () => {
    const before = state(stack("source", "10"));
    const command = { operation: "consume" as const, sourceStackId: "source", quantityExact: "2" };
    const first = resolveAurionInventoryTransaction({ before, command, idempotencyKey: "tamper-key" });
    const tamperedReceipt = { ...first.receipt, resultHash: "sha256:0000000000000000000000000000000000000000000000000000000000000000" };
    expect(() => resolveAurionInventoryTransaction({
      before: first.state,
      command,
      idempotencyKey: "tamper-key",
      priorReceipt: tamperedReceipt,
    })).toThrow("INVENTORY_IDEMPOTENCY_CONFLICT");
  });
});
