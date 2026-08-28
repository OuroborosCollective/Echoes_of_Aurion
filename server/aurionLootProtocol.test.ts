import { describe, expect, it } from "vitest";
import { estimateLootVariantUpperBound, resolveDeterministicLoot, resolveEquippedSetBonuses, type LootAffixDefinition, type LootBaseDefinition, type LootSetDefinition, type ServerConfirmedLootContext } from "./aurionLootProtocol";

const context: ServerConfirmedLootContext = {
  worldId: "echoes-of-aurion-global",
  zoneId: "windhollow",
  monsterArchetypeId: "ash-sentinel",
  encounterReceiptId: "expedition-receipt-001",
  ruleSetVersion: "aurion-world-chunk.v1",
  contentVersion: "aurion-content.v2",
  resolutionIndex: 42,
  playerLevelExact: "100000",
  zoneLevelExact: "100002",
  monsterLevelExact: "100005",
  luckBps: 350,
  serverSeedDigest: "a".repeat(64),
};

const bases: readonly LootBaseDefinition[] = [
  { id: "blade-astral", category: "weapon", equipmentSlot: "main_hand", familyId: "blade", minItemLevelExact: "1", baseStats: { power: 8 }, affixSlots: ["prefix", "suffix", "implicit", "corruption", "craft"], tags: ["blade", "metal"] },
  { id: "helm-warding", category: "armor", equipmentSlot: "head", familyId: "plate", minItemLevelExact: "1", baseStats: { guard: 7 }, affixSlots: ["prefix", "suffix", "implicit", "corruption", "craft"], tags: ["armor", "metal"] },
  { id: "ring-resonance", category: "accessory", equipmentSlot: "ring", familyId: "ring", minItemLevelExact: "1", baseStats: { resonance: 3 }, affixSlots: ["prefix", "suffix", "implicit", "corruption", "craft"], tags: ["accessory", "arcane"] },
];

const affixes: readonly LootAffixDefinition[] = [
  { id: "affix-astral", slot: "prefix", groupId: "power", minItemLevelExact: "1", allowedCategories: ["weapon", "armor", "accessory"], statRanges: { power: { min: 1, max: 6 } } },
  { id: "affix-warded", slot: "suffix", groupId: "guard", minItemLevelExact: "1", allowedCategories: ["weapon", "armor", "accessory"], statRanges: { guard: { min: 1, max: 6 } } },
  { id: "affix-fortunate", slot: "implicit", groupId: "fortune", minItemLevelExact: "1", allowedCategories: ["weapon", "armor", "accessory"], statRanges: { luck: { min: 1, max: 5 } } },
  { id: "affix-resonant", slot: "corruption", groupId: "resonance", minItemLevelExact: "1", allowedCategories: ["weapon", "armor", "accessory"], statRanges: { resonance: { min: 1, max: 5 } } },
  { id: "affix-tempered", slot: "craft", groupId: "craft", minItemLevelExact: "1", allowedCategories: ["weapon", "armor", "accessory"], statRanges: { craftPower: { min: 1, max: 5 } } },
];

const sets: readonly LootSetDefinition[] = [
  { id: "regalia-of-echoes", pieceBaseItemIds: ["blade-astral", "helm-warding", "ring-resonance"], bonusesByPieces: { "2": { guard: 4 }, "3": { resonance: 9 } } },
];

const resolve = (overrides: Partial<ServerConfirmedLootContext> = {}) => resolveDeterministicLoot({ context: { ...context, ...overrides }, baseItems: bases, affixes, sets });

describe("aurionLootProtocol", () => {
  it("replays an identical server-confirmed context exactly and exposes an exact high item level", () => {
    const first = resolve();
    const replay = resolve();
    expect(first).toEqual(replay);
    expect(first.itemLevelExact).toBe("100005");
    expect(first.affixes.length).toBeLessThanOrEqual(5);
    expect(new Set(first.affixes.map(affix => affix.groupId)).size).toBe(first.affixes.length);
  });

  it("binds every result to zone, monster, resolution index and confirmed luck without accepting a client seed", () => {
    const first = resolve();
    expect(resolve({ zoneId: "solarium-front" }).contextHash).not.toBe(first.contextHash);
    expect(resolve({ monsterArchetypeId: "river-wyrm" }).contextHash).not.toBe(first.contextHash);
    expect(resolve({ resolutionIndex: context.resolutionIndex + 1 }).contextHash).not.toBe(first.contextHash);
    expect(resolve({ luckBps: context.luckBps + 1 }).contextHash).not.toBe(first.contextHash);
    expect(() => resolve({ serverSeedDigest: "" })).toThrow(/server-confirmed/i);
  });

  it("requires compatible catalog affixes and rejects malformed exact progression or untrusted roll ranges", () => {
    const rareContext = Array.from({ length: 512 }, (_, resolutionIndex) => ({ ...context, resolutionIndex, luckBps: 5_000 }))
      .find(candidate => {
        const result = resolveDeterministicLoot({ context: candidate, baseItems: bases, affixes, sets });
        return result.quality === "rare" || result.quality === "set" || result.quality === "unique" || result.quality === "mythic";
      });
    expect(rareContext).toBeDefined();
    expect(() => resolveDeterministicLoot({ context: rareContext!, baseItems: bases, affixes: affixes.slice(0, 1), sets })).toThrow(/insufficient compatible affixes/i);
    expect(() => resolve({ playerLevelExact: "-1" })).toThrow(/canonical/i);
    expect(() => resolve({ luckBps: Number.NaN })).toThrow(/safe integer/i);
  });

  it("derives set bonuses only from equipped confirmed pieces", () => {
    expect(resolveEquippedSetBonuses({ equippedBaseItemIds: ["blade-astral"], sets })).toEqual({});
    expect(resolveEquippedSetBonuses({ equippedBaseItemIds: ["blade-astral", "helm-warding"], sets })).toEqual({ guard: 4 });
    expect(resolveEquippedSetBonuses({ equippedBaseItemIds: ["ring-resonance", "blade-astral", "helm-warding"], sets })).toEqual({ guard: 4, resonance: 9 });
  });

  it("keeps high combinatoric catalog planning exact without generating rewards", () => {
    expect(estimateLootVariantUpperBound({ baseItemCount: 10, affixGroupCount: 12, maxAffixSlots: 4, qualityCount: 6, levelBands: 100 })).toBe("71280000");
    expect(() => estimateLootVariantUpperBound({ baseItemCount: -1, affixGroupCount: 12, maxAffixSlots: 4, levelBands: 100 })).toThrow(/non-negative/i);
  });
});
