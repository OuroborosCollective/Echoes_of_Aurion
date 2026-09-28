import { describe, expect, it } from "vitest";
import { resolveProfessionCraftingAffixes } from "./craftingProfessionPersistence";
import type { ProfessionOperationEnvelope } from "./professionMasteryProtocol";

const envelope = {
  schemaVersion: 1,
  operationId: "craft:modifier-test",
  actorId: "player:1",
  professionId: "blacksmith",
  activityKind: "craft",
  activityId: "temper_aurion_spear",
  outputItemId: "aurion_spear",
  resolutionIndex: 42,
  sourceReceiptId: "source:receipt",
  sourceEvidenceDigest: "a".repeat(64),
  serverSeedDigest: "b".repeat(64),
  resourceInputs: [],
  resourceDigest: "c".repeat(64),
  masteryKeys: [],
  yield: {
    baseQuantityExact: "1",
    baseBatchesExact: "1",
    guaranteedBonusBatchesExact: "0",
    chanceBonusApplied: false,
    bonusBatchesExact: "0",
    totalBatchesExact: "1",
    totalQuantityExact: "1",
    bonusChanceBps: 0,
    rollBps: 0,
  },
  modifiers: {
    qualityScoreExact: "10000",
    efficiencyBps: 10_000,
    speedBps: 10_000,
    stabilityBps: 10_000,
    errorChanceBps: 0,
    rareFindBonusBps: 0,
    qualityPowerBps: 12_500,
  },
  economicControls: {
    inputConsumption: "consume_once_atomically",
    sourceMutation: "consume_or_deplete_once_atomically",
    replayPolicy: "return_existing_receipt",
    bonusOutputsGrantMasteryXp: false,
    bonusOutputsCarrySourceOperation: true,
    outputRepresentation: "exact_quantity_with_lazy_origin_range",
    recursiveSalvageMasteryCredit: false,
  },
  outputOriginNamespace: "profession:test-output",
  receiptId: "profession:test-receipt",
  commitHash: "d".repeat(64),
} satisfies ProfessionOperationEnvelope;

describe("resolveProfessionCraftingAffixes", () => {
  it("derives persisted crafting stats through the shared integer modifier contract", () => {
    const first = resolveProfessionCraftingAffixes({
      envelope,
      affixes: [
        { key: "tempered", slot: "prefix", stats: { power: 37, guard: -7 } },
      ],
    });
    const replay = resolveProfessionCraftingAffixes({
      envelope,
      affixes: [
        { key: "tempered", slot: "prefix", stats: { power: 37, guard: -7 } },
      ],
    });
    expect(first.affixes).toEqual([
      { key: "tempered", slot: "prefix", stats: { guard: -9, power: 46 } },
    ]);
    expect(first.modifierProof).toEqual(replay.modifierProof);
    expect(first.modifierProof).toMatchObject({
      schema: "aurion.crafting-profession.modifier-proof.v1",
    });
    expect(first.modifierProof.baseStatsHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.modifierProof.sourceSetHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.modifierProof.derivedStatsHash).toMatch(
      /^sha256:[a-f0-9]{64}$/
    );
  });
});
