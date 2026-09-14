import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  normalizeCivilizationHistoryEvent,
  recordCivilizationHistoryEvent,
  recordDungeonInstanceReceipt,
  recordRuinOrigin,
  recordSettlementRebirthCandidate,
} from "./aurionCivilizationHistoryPersistence";
import { getDb } from "./db";

vi.mock("./db", () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockResolvedValue([{}]),
  };
  return { getDb: vi.fn(() => mockDb) };
});

describe("aurionCivilizationHistoryPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validEvent = {
    eventId: "event-1",
    civilizationId: "civ-alpha",
    worldId: "world-main",
    worldEpoch: 1,
    eventType: "famine",
    sourceReceiptId: "receipt-99",
    sourceRevision: "rev-abc",
    eventPayloadJson: '{"severity": 10}',
    occurredSequence: 1,
  };

  it("normalizes and deterministically hashes civilization history events", () => {
    const normalized = normalizeCivilizationHistoryEvent(validEvent);
    expect(normalized.eventPayloadHash).toHaveLength(64);
    expect(normalized.eventHash).toHaveLength(64);

    const identical = normalizeCivilizationHistoryEvent(validEvent);
    expect(normalized.eventHash).toBe(identical.eventHash);

    const different = normalizeCivilizationHistoryEvent({ ...validEvent, eventType: "boom" });
    expect(normalized.eventHash).not.toBe(different.eventHash);
  });

  it("records new events and rejects idempotency conflicts", async () => {
    const db = await getDb();

    const result = await recordCivilizationHistoryEvent(validEvent);
    expect(result.applied).toBe(true);
    expect(db.insert).toHaveBeenCalled();

    // Simulate prior existence with match
    vi.mocked(db.limit).mockResolvedValueOnce([
      {
        ...validEvent,
        eventPayloadHash: normalizeCivilizationHistoryEvent(validEvent).eventPayloadHash,
      },
    ]);
    const duplicate = await recordCivilizationHistoryEvent(validEvent);
    expect(duplicate.applied).toBe(false);

    // Simulate prior existence with conflict
    vi.mocked(db.limit).mockResolvedValueOnce([
      {
        ...validEvent,
        civilizationId: "different-civ",
        eventPayloadHash: normalizeCivilizationHistoryEvent(validEvent).eventPayloadHash,
      },
    ]);
    await expect(recordCivilizationHistoryEvent(validEvent)).rejects.toThrow(
      "CIVILIZATION_HISTORY_EVENT_IDEMPOTENCY_CONFLICT"
    );
  });

  it("records ruin origins and guards idempotency", async () => {
    const ruin = {
      ruinId: "ruin-101",
      originCivilizationId: "civ-lost-vales",
      collapseEventId: "event-collapse-1",
      locationIdentity: "chunk:12:34",
      worldEpoch: 1,
      historyDigest: "digest-123",
      rulesetVersion: "wasd-v1.0.0",
      generationSeedDigest: "seed-digest-1",
      state: "ELIGIBLE" as const,
    };

    const res = await recordRuinOrigin(ruin);
    expect(res.applied).toBe(true);
    expect(res.ruinId).toBe("ruin-101");

    const db = await getDb();
    vi.mocked(db.limit).mockResolvedValueOnce([ruin]);
    const dup = await recordRuinOrigin(ruin);
    expect(dup.applied).toBe(false);

    vi.mocked(db.limit).mockResolvedValueOnce([{ ...ruin, locationIdentity: "chunk:99:99" }]);
    await expect(recordRuinOrigin(ruin)).rejects.toThrow("RUIN_ORIGIN_IDEMPOTENCY_CONFLICT");
  });

  it("records dungeon instance receipts idempotently", async () => {
    const dungeon = {
      instanceId: "dungeon-inst-1",
      ruinId: "ruin-101",
      entryReceipt: "receipt-entry-1",
      rulesetVersion: "wasd-v1.0.0",
      contextIdentity: "ctx-party-1",
      completionReceipt: "receipt-comp-1",
      lootReceiptSetDigest: "digest-loot-1",
      resultHash: "hash-result-1",
    };

    const res = await recordDungeonInstanceReceipt(dungeon);
    expect(res.applied).toBe(true);
    expect(res.instanceId).toBe("dungeon-inst-1");

    const db = await getDb();
    vi.mocked(db.limit).mockResolvedValueOnce([dungeon]);
    const dup = await recordDungeonInstanceReceipt(dungeon);
    expect(dup.applied).toBe(false);

    vi.mocked(db.limit).mockResolvedValueOnce([{ ...dungeon, entryReceipt: "receipt-other" }]);
    await expect(recordDungeonInstanceReceipt(dungeon)).rejects.toThrow("DUNGEON_INSTANCE_RECEIPT_IDEMPOTENCY_CONFLICT");
  });

  it("records settlement rebirth candidates with idempotency and conflict protection", async () => {
    const candidate = {
      candidateId: "rebirth-candidate-1",
      worldId: "world-aurion-prime",
      locationIdentity: "chunk:12:34",
      ruinId: "ruin-101",
      eligibilityReceipt: "receipt-elig-1",
      candidateSeedDigest: "seed-digest-rebirth-1",
      state: "ELIGIBLE" as const,
    };

    const res = await recordSettlementRebirthCandidate(candidate);
    expect(res.applied).toBe(true);
    expect(res.candidateId).toBe("rebirth-candidate-1");

    const db = await getDb();
    vi.mocked(db.limit).mockResolvedValueOnce([candidate]);
    const dup = await recordSettlementRebirthCandidate(candidate);
    expect(dup.applied).toBe(false);

    vi.mocked(db.limit).mockResolvedValueOnce([{ ...candidate, worldId: "world-different" }]);
    await expect(recordSettlementRebirthCandidate(candidate)).rejects.toThrow(
      "SETTLEMENT_REBIRTH_CANDIDATE_IDEMPOTENCY_CONFLICT"
    );
  });
});


