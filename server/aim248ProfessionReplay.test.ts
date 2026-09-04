import { describe, expect, it } from "vitest";
import {
  buildProfessionOperationEnvelope,
  professionOutputOriginAt,
  reconcileProfessionOperationReplay,
  resolveBonusYieldCarry,
  resolveProfessionYield,
  type ProfessionOperationInput,
} from "./professionMasteryProtocol";

const operation = (overrides: Partial<ProfessionOperationInput> = {}): ProfessionOperationInput => ({
  operationId: "craft_operation_42",
  actorId: "user:42",
  professionId: "carpentry",
  activityKind: "craft",
  activityId: "wooden_chest",
  outputItemId: "wooden_chest",
  baseOutputQuantityExact: "1",
  masteryLevelExact: "1049",
  qualityScoreExact: "125",
  serverSeed: "a".repeat(64),
  sourceReceiptId: "wasd_craft_receipt_42",
  sourceEvidenceDigest: "b".repeat(64),
  resolutionIndex: 42,
  activeDurationTicks: 8,
  repetitionStreak: 0,
  distinctContextCount: 2,
  resources: [
    { originId: "inventory:iron_hinge:2", itemId: "iron_hinge", quantityExact: "2" },
    { originId: "inventory:wood_plank:8", itemId: "wood_plank", quantityExact: "8" },
  ],
  ...overrides,
});

describe("AIM-248 profession replay and source provenance", () => {
  it("implements the exact owner carry points at arbitrary levels", () => {
    expect(resolveBonusYieldCarry("49")).toMatchObject({ guaranteedBonusBatchesExact: "0", bonusChanceBps: 0 });
    expect(resolveBonusYieldCarry("50")).toMatchObject({ guaranteedBonusBatchesExact: "0", bonusChanceBps: 10 });
    expect(resolveBonusYieldCarry("1049")).toMatchObject({ guaranteedBonusBatchesExact: "1", bonusChanceBps: 0 });
    expect(resolveBonusYieldCarry("1050")).toMatchObject({ guaranteedBonusBatchesExact: "1", bonusChanceBps: 10 });
    expect(resolveProfessionYield({ masteryLevelExact: "1050", baseQuantityExact: "1", rollBps: 9 })).toMatchObject({ totalQuantityExact: "3", bonusBatchesExact: "2" });
  });

  it("keeps exact yield arithmetic above Number.MAX_SAFE_INTEGER", () => {
    const level = 10n ** 36n + 49n;
    expect(resolveProfessionYield({ masteryLevelExact: level.toString(10), baseQuantityExact: "3", rollBps: 9_999 }).totalQuantityExact)
      .toBe(((10n ** 33n + 1n) * 3n).toString(10));
  });

  it("returns an identical committed operation as replay", () => {
    const existing = buildProfessionOperationEnvelope(operation());
    const candidate = buildProfessionOperationEnvelope(operation());
    expect(reconcileProfessionOperationReplay(existing, candidate)).toEqual({ replay: true, envelope: existing });
  });

  it("fails closed when one operation ID is rebound to another seed or source", () => {
    const existing = buildProfessionOperationEnvelope(operation());
    const changedSeed = buildProfessionOperationEnvelope(operation({ serverSeed: "c".repeat(64) }));
    const changedSource = buildProfessionOperationEnvelope(operation({ sourceEvidenceDigest: "d".repeat(64) }));
    expect(changedSeed.serverSeedDigest).not.toBe(existing.serverSeedDigest);
    expect(() => reconcileProfessionOperationReplay(existing, changedSeed)).toThrow("PROFESSION_OPERATION_CONFLICT");
    expect(() => reconcileProfessionOperationReplay(existing, changedSource)).toThrow("PROFESSION_OPERATION_CONFLICT");
  });

  it("requires causal source origins for both crafting and gathering", () => {
    expect(() => buildProfessionOperationEnvelope(operation({ resources: [] }))).toThrow("crafting requires consumed resource origins");
    expect(() => buildProfessionOperationEnvelope(operation({
      professionId: "fishing",
      activityKind: "gather",
      activityId: "river_trout",
      outputItemId: "river_trout",
      resources: [],
    }))).toThrow("gathering requires a depleted world-source origin");
  });

  it("derives unique output origins lazily from one atomic operation", () => {
    const envelope = buildProfessionOperationEnvelope(operation());
    expect(envelope.yield.totalQuantityExact).toBe("2");
    expect(envelope.economicControls).toMatchObject({
      sourceMutation: "consume_or_deplete_once_atomically",
      replayPolicy: "return_existing_receipt",
      bonusOutputsGrantMasteryXp: false,
      recursiveSalvageMasteryCredit: false,
    });
    expect(professionOutputOriginAt(envelope, "0")).not.toBe(professionOutputOriginAt(envelope, "1"));
    expect(() => professionOutputOriginAt(envelope, "2")).toThrow("outside profession envelope");
  });
});
