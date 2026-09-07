import { describe, expect, it } from "vitest";
import { normalizeEpochMaterialization } from "./worldEpochMaterializationPersistence";

const base = {
  worldId: "echoes-of-aurion-global",
  epoch: 12,
  resolutionIndex: 12,
  reactionReceiptId: "world-epoch-reaction-12",
  reactionHash: "a".repeat(64),
  presence: [
    { userId: 9, chunkX: 1, chunkZ: 0, resolutionIndex: 12 },
    { userId: 3, chunkX: 0, chunkZ: 0, resolutionIndex: 12 },
  ],
  materializationJson: JSON.stringify({ sectors: ["emberfall"], npc: "confirmed", faction: "confirmed" }),
  idempotencyKey: "epoch-materialization-12-0001",
};

describe("AIM-235 presence epoch materialization", () => {
  it("orders presence evidence and produces a deterministic digest", () => {
    const first = normalizeEpochMaterialization(base);
    const second = normalizeEpochMaterialization({ ...base, presence: [...base.presence].reverse() });
    expect(first.presence.map(entry => entry.userId)).toEqual([3, 9]);
    expect(first.presenceDigest).toBe(second.presenceDigest);
    expect(first.materializationHash).toBe(second.materializationHash);
  });

  it("rejects mismatched epoch and resolution indices", () => {
    expect(() => normalizeEpochMaterialization({ ...base, resolutionIndex: 11 })).toThrow("EPOCH_RESOLUTION_MISMATCH");
    expect(() => normalizeEpochMaterialization({ ...base, presence: [{ ...base.presence[0], resolutionIndex: 11 }] })).toThrow("PRESENCE_RESOLUTION_MISMATCH");
  });

  it("changes evidence when a confirmed reaction or materialization changes", () => {
    const original = normalizeEpochMaterialization(base);
    expect(normalizeEpochMaterialization({ ...base, reactionHash: "b".repeat(64) }).materializationHash).not.toBe(original.materializationHash);
    expect(normalizeEpochMaterialization({ ...base, materializationJson: JSON.stringify({ sectors: ["windhollow"] }) }).materializationHash).not.toBe(original.materializationHash);
  });
});
