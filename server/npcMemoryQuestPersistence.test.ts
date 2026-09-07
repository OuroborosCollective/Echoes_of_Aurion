import { describe, expect, it } from "vitest";
import { assertNpcMemoryReceiptRow, normalizeNpcMemoryQuestInput } from "./npcMemoryQuestPersistence";

describe("AIM-231 NPC memory and quest-offer evidence", () => {
  const input = {
    userId: 7,
    characterId: "character-7",
    npcId: "lyra",
    worldRevision: "world-epoch-12",
    resultReceiptId: "receipt-abc",
    resolutionIndex: 12,
    idempotencyKey: "npc-memory-7-12",
    memoryEntries: ["Player returned the star map."],
    questOffer: {
      offerId: "offer-star-map",
      title: "Restore the star map",
      summary: "Review-only proposal derived from the confirmed NPC resolution.",
      sourceResolutionIndex: 12,
      reviewOnly: true as const,
    },
  };

  it("binds memory and review-only offers to account, character, world, and receipt", () => {
    const normalized = normalizeNpcMemoryQuestInput(input);
    expect(normalized.memoryHash).toMatch(/^[a-f0-9]{64}$/);
    expect(normalized.offerHash).toMatch(/^[a-f0-9]{64}$/);
    expect(normalized.questOffer?.reviewOnly).toBe(true);
  });

  it("rejects an offer from a different resolution", () => {
    expect(() => normalizeNpcMemoryQuestInput({ ...input, questOffer: { ...input.questOffer, sourceResolutionIndex: 11 } })).toThrow("NPC_QUEST_OFFER_RESOLUTION_INVALID");
  });

  it("rejects tampered memory evidence on readback", () => {
    const normalized = normalizeNpcMemoryQuestInput(input);
    expect(() => assertNpcMemoryReceiptRow({ ...input, memoryJson: JSON.stringify(["tampered"]), memoryHash: normalized.memoryHash })).toThrow("NPC_MEMORY_RECEIPT_CORRUPT");
  });
});
