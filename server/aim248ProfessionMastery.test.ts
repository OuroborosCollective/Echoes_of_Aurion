import { describe, expect, it } from "vitest";
import { canonicalScopedMasteryKey } from "./scopedMasteryProtocol";
import {
  AURION_PROFESSION_MASTERY_CONTENT_VERSION,
  AURION_PROFESSION_MASTERY_RULESET_VERSION,
  aurionProfessionIds,
  buildProfessionOperationEnvelope,
  deterministicProfessionRollBps,
  legacyWasdSkillMasteryKeys,
  professionMasteryKeys,
  professionOutputOriginAt,
  resolveBonusYieldCarry,
  resolveProfessionMasteryModifiers,
  resolveProfessionMasteryOperation,
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
  masteryLevelExact: "50",
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

describe("AIM-248 profession and recipe mastery", () => {
  it("defines the six owner-requested starting professions", () => {
    expect(aurionProfessionIds).toEqual([
      "fishing",
      "mining",
      "herbalism",
      "alchemy",
      "enchanting",
      "carpentry",
    ]);
    expect(AURION_PROFESSION_MASTERY_RULESET_VERSION).toBe("aurion-profession-mastery.v1");
    expect(AURION_PROFESSION_MASTERY_CONTENT_VERSION).toBe("aurion-profession-mastery-content.v1");
  });

  it("implements the exact unbounded wooden-chest carry formula", () => {
    expect(resolveBonusYieldCarry("49")).toMatchObject({ guaranteedBonusBatchesExact: "0", bonusChanceBps: 0, expectedBonusMilliExact: "0" });
    expect(resolveBonusYieldCarry("50")).toMatchObject({ guaranteedBonusBatchesExact: "0", bonusChanceBps: 10, expectedBonusMilliExact: "1" });
    expect(resolveBonusYieldCarry("1049")).toMatchObject({ guaranteedBonusBatchesExact: "1", bonusChanceBps: 0, expectedBonusMilliExact: "1000" });
    expect(resolveBonusYieldCarry("1050")).toMatchObject({ guaranteedBonusBatchesExact: "1", bonusChanceBps: 10, expectedBonusMilliExact: "1001" });

    expect(resolveProfessionYield({ masteryLevelExact: "50", baseQuantityExact: "1", rollBps: 9 })).toMatchObject({ totalQuantityExact: "2", chanceBonusApplied: true });
    expect(resolveProfessionYield({ masteryLevelExact: "50", baseQuantityExact: "1", rollBps: 10 })).toMatchObject({ totalQuantityExact: "1", chanceBonusApplied: false });
    expect(resolveProfessionYield({ masteryLevelExact: "1049", baseQuantityExact: "1", rollBps: 0 })).toMatchObject({ totalQuantityExact: "2", bonusBatchesExact: "1" });
    expect(resolveProfessionYield({ masteryLevelExact: "1050", baseQuantityExact: "1", rollBps: 9 })).toMatchObject({ totalQuantityExact: "3", bonusBatchesExact: "2" });
  });

  it("keeps yield arithmetic exact at levels far beyond Number.MAX_SAFE_INTEGER", () => {
    const level = 10n ** 36n + 49n;
    const carry = resolveBonusYieldCarry(level.toString(10));
    expect(carry.guaranteedBonusBatchesExact).toBe((10n ** 33n).toString(10));
    expect(carry.bonusChanceBps).toBe(0);
    const outcome = resolveProfessionYield({ masteryLevelExact: level.toString(10), baseQuantityExact: "3", rollBps: 9_999 });
    expect(outcome.totalQuantityExact).toBe(((10n ** 33n + 1n) * 3n).toString(10));
  });

  it("keeps quality unbounded while gameplay modifiers approach bounded returns", () => {
    const novice = resolveProfessionMasteryModifiers({ masteryLevelExact: "1", qualityScoreExact: "1" });
    const veteran = resolveProfessionMasteryModifiers({ masteryLevelExact: "100000000000000000000000", qualityScoreExact: "100000000000000000000000" });
    expect(BigInt(veteran.qualityScoreExact)).toBeGreaterThan(BigInt(novice.qualityScoreExact));
    expect(veteran.efficiencyBps).toBeGreaterThan(novice.efficiencyBps);
    expect(veteran.efficiencyBps).toBeLessThanOrEqual(12_000);
    expect(veteran.speedBps).toBeLessThanOrEqual(14_000);
    expect(veteran.qualityPowerBps).toBeLessThanOrEqual(13_000);
    expect(veteran.errorChanceBps).toBeLessThanOrEqual(novice.errorChanceBps);
  });

  it("builds the same server-bound atomic envelope for the same operation", () => {
    const guaranteedMultiOutput = operation({ masteryLevelExact: "1049" });
    const left = buildProfessionOperationEnvelope(guaranteedMultiOutput);
    const right = buildProfessionOperationEnvelope(guaranteedMultiOutput);
    expect(left).toEqual(right);
    expect(left.commitHash).toMatch(/^[a-f0-9]{64}$/);
    expect(left.resourceDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(left.resourceInputs.map(resource => resource.originId)).toEqual([
      "inventory:iron_hinge:2",
      "inventory:wood_plank:8",
    ]);
    expect(left.economicControls).toMatchObject({
      inputConsumption: "consume_once_atomically",
      replayPolicy: "return_existing_receipt",
      bonusOutputsGrantMasteryXp: false,
      recursiveSalvageMasteryCredit: false,
    });
    expect(BigInt(left.yield.totalQuantityExact)).toBeGreaterThanOrEqual(2n);
    const lastIndex = (BigInt(left.yield.totalQuantityExact) - 1n).toString(10);
    expect(professionOutputOriginAt(left, "0")).not.toBe(professionOutputOriginAt(left, lastIndex));
    expect(() => professionOutputOriginAt(left, left.yield.totalQuantityExact)).toThrow("outside profession envelope");
  });

  it("rejects missing or duplicate resource origins before an atomic craft can be committed", () => {
    expect(() => buildProfessionOperationEnvelope(operation({ resources: [] }))).toThrow("crafting requires consumed resource origins");
    expect(() => buildProfessionOperationEnvelope(operation({
      resources: [
        { originId: "inventory:wood:1", itemId: "wood_plank", quantityExact: "4" },
        { originId: "inventory:wood:1", itemId: "wood_plank", quantityExact: "4" },
      ],
    }))).toThrow("DUPLICATE_RESOURCE_ORIGIN");
  });

  it("advances profession, recipe and item scopes independently from one confirmed operation", () => {
    const first = resolveProfessionMasteryOperation({
      operation: operation(),
      xp: { professionXpExact: "6", activityXpExact: "8", itemXpExact: "3", qualityGainExact: "2" },
    });
    expect(first.masteryStates.map(state => canonicalScopedMasteryKey(state.key))).toEqual([
      "v1:item:wooden_chest",
      "v1:profession:carpentry",
      "v1:recipe:wooden_chest",
    ]);
    expect(first.masteryStates.map(state => state.progression.totalXpExact)).toEqual(["3", "6", "8"]);
    expect(first.masteryStates.find(state => state.key.scopeType === "item")?.qualityScoreExact).toBe("2");
    expect(first.masteryStates.every(state => state.appliedReceiptIds[0] === first.envelope.receiptId)).toBe(true);

    const currentByKey = Object.fromEntries(first.masteryStates.map(state => [canonicalScopedMasteryKey(state.key), state]));
    const replay = resolveProfessionMasteryOperation({
      operation: operation(),
      xp: { professionXpExact: "6", activityXpExact: "8", itemXpExact: "3", qualityGainExact: "2" },
      currentByKey,
    });
    expect(replay.masteryStates).toEqual(first.masteryStates);
  });

  it("uses gathering/item scopes for gathering professions and preserves legacy WASD parents", () => {
    expect(professionMasteryKeys({ professionId: "fishing", activityKind: "gather", activityId: "river_trout", outputItemId: "river_trout" }).map(canonicalScopedMasteryKey)).toEqual([
      "v1:profession:fishing",
      "v1:gathering:river_trout",
      "v1:item:river_trout",
    ]);
    expect(legacyWasdSkillMasteryKeys("mining").map(canonicalScopedMasteryKey)).toEqual([
      "v1:gathering:mining",
      "v1:profession:mining",
    ]);
    expect(legacyWasdSkillMasteryKeys("crafting", "alchemy").map(canonicalScopedMasteryKey)).toEqual([
      "v1:action:crafting",
      "v1:profession:alchemy",
    ]);
  });

  it("derives deterministic server rolls without accepting a client-selected outcome", () => {
    const first = deterministicProfessionRollBps("c".repeat(64), "operation_1", "yield");
    const replay = deterministicProfessionRollBps("c".repeat(64), "operation_1", "yield");
    const otherLaneFirst = deterministicProfessionRollBps("c".repeat(64), "operation_1", "rare_find");
    const otherLaneReplay = deterministicProfessionRollBps("c".repeat(64), "operation_1", "rare_find");
    expect(first).toBe(replay);
    expect(otherLaneFirst).toBe(otherLaneReplay);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThan(10_000);
    expect(otherLaneFirst).toBeGreaterThanOrEqual(0);
    expect(otherLaneFirst).toBeLessThan(10_000);
  });
});
