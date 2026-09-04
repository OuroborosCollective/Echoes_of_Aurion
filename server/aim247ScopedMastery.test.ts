import { describe, expect, it } from "vitest";
import {
  craftingMasteryKeys,
  classlessWeaponMasteryKey,
  legacyDisciplineMasteryKey,
  livingWorldSocialMasteryKeys,
} from "./scopedMasteryAdapters";
import {
  SCOPED_MASTERY_RULESET_VERSION,
  canonicalScopedMasteryKey,
  evaluateMasteryEligibility,
  masteryKeys,
  resolveCoupledMasteries,
  resolveScopedMastery,
  scopedMasteryKey,
  type ScopedMasteryEvent,
} from "./scopedMasteryProtocol";

const CONTENT_VERSION = "aim247-content.v1";

function event(
  key: ReturnType<typeof scopedMasteryKey>,
  index: number,
  amountExact = "10",
  overrides: Partial<ScopedMasteryEvent> = {},
): ScopedMasteryEvent {
  return {
    receiptId: `receipt_${index}`,
    idempotencyKey: `idem_${index}`,
    resolutionIndex: index,
    key,
    amountExact,
    serverValidated: true,
    activeDurationTicks: 1,
    repetitionStreak: 0,
    distinctContextCount: 1,
    ruleSetVersion: SCOPED_MASTERY_RULESET_VERSION,
    contentVersion: CONTENT_VERSION,
    ...overrides,
  };
}

describe("AIM-247 scoped infinite mastery kernel", () => {
  it("accepts arbitrary versioned skill/action scopes with canonical identities", () => {
    expect(canonicalScopedMasteryKey(masteryKeys.profession("carpentry"))).toBe("v1:profession:carpentry");
    expect(canonicalScopedMasteryKey(masteryKeys.recipe("wooden_chest"))).toBe("v1:recipe:wooden_chest");
    expect(canonicalScopedMasteryKey(masteryKeys.social("negotiation"))).toBe("v1:social:negotiation");
    expect(canonicalScopedMasteryKey(masteryKeys.navigation("clockwork_woods"))).toBe("v1:navigation:clockwork_woods");
    expect(canonicalScopedMasteryKey(masteryKeys.gathering("aether_herbs"))).toBe("v1:gathering:aether_herbs");
    expect(canonicalScopedMasteryKey(masteryKeys.combat("perfect_parry"))).toBe("v1:combat:perfect_parry");
    expect(() => scopedMasteryKey("recipe", "../bad")).toThrow();
  });

  it("is monotone and non-negative across ordinary long-running event streams", () => {
    const key = masteryKeys.weapon("blade");
    let previousXp = 0n;
    let previousLevel = 1n;
    for (let count = 1; count <= 120; count += 1) {
      const events = Array.from({ length: count }, (_, index) => event(key, index + 1, String((index % 7) + 1)));
      const state = resolveScopedMastery({ actorId: "user:42", key, events });
      expect(BigInt(state.progression.totalXpExact)).toBeGreaterThanOrEqual(previousXp);
      expect(BigInt(state.progression.levelExact)).toBeGreaterThanOrEqual(previousLevel);
      expect(BigInt(state.progression.xpIntoLevelExact)).toBeGreaterThanOrEqual(0n);
      previousXp = BigInt(state.progression.totalXpExact);
      previousLevel = BigInt(state.progression.levelExact);
    }
  });

  it("continues exactly above Number.MAX_SAFE_INTEGER without a level cap or overflow authority", () => {
    const key = masteryKeys.profession("carpentry");
    const current = {
      progression: {
        totalXpExact: "9007199254740993000",
        levelExact: "1000000",
        xpIntoLevelExact: "0",
        xpForNextLevelExact: "0",
        totalXp: Number.MAX_SAFE_INTEGER,
        level: 1_000_000,
        numberProjectionExact: false,
      },
      lifetimeUsesExact: "9007199254740993000",
      qualityScoreExact: "123456789012345678901234567890",
      contextMetricsExact: { successful_crafts: "9007199254740993000" },
      appliedEvents: [],
    } as const;
    const state = resolveScopedMastery({
      actorId: "user:42",
      key,
      current,
      events: [event(key, 1, "1", { qualityDeltaExact: "1", contextMetricsExact: { successful_crafts: "1" } })],
    });
    expect(state.progression.totalXpExact).toBe("9007199254740993001");
    expect(state.lifetimeUsesExact).toBe("9007199254740993001");
    expect(state.qualityScoreExact).toBe("123456789012345678901234567891");
    expect(state.contextMetricsExact.successful_crafts).toBe("9007199254740993001");
    expect(state.progression.numberProjectionExact).toBe(false);
  });

  it("awards XP only to server-validated active actions and suppresses AFK/spam", () => {
    const key = masteryKeys.action("woodcut_swing");
    expect(evaluateMasteryEligibility(event(key, 1, "100", { serverValidated: false })).eligible).toBe(false);
    expect(evaluateMasteryEligibility(event(key, 2, "100", { activeDurationTicks: 0 })).reason).toBe("inactive");
    expect(evaluateMasteryEligibility(event(key, 3, "100", { repetitionStreak: 500, distinctContextCount: 0 })).reason).toBe("spam");
    const diminished = evaluateMasteryEligibility(event(key, 4, "100", { repetitionStreak: 100, distinctContextCount: 0 }));
    expect(BigInt(diminished.effectiveAmountExact)).toBeGreaterThan(0n);
    expect(BigInt(diminished.effectiveAmountExact)).toBeLessThan(100n);
  });

  it("keeps profession, recipe and item mastery separate but coupled to one confirmed craft receipt", () => {
    const [profession, recipe, item] = craftingMasteryKeys("carpentry", "wooden_chest", "oak_chest");
    const events = [profession, recipe, item].map((key, index) => event(
      key!,
      index + 1,
      index === 0 ? "5" : index === 1 ? "8" : "3",
      { receiptId: "craft_receipt_1", idempotencyKey: `craft_scope_${index}` },
    ));
    const states = resolveCoupledMasteries({ actorId: "user:42", keys: [profession!, recipe!, item!], events });
    expect(states.map(state => canonicalScopedMasteryKey(state.key))).toEqual([
      "v1:item:oak_chest",
      "v1:profession:carpentry",
      "v1:recipe:wooden_chest",
    ]);
    expect(new Set(states.map(state => state.progression.totalXpExact)).size).toBe(3);
    expect(states.every(state => state.appliedReceiptIds[0] === "craft_receipt_1")).toBe(true);
  });

  it("maps classless weapons, social relations and legacy disciplines into the same scoped engine", () => {
    expect(canonicalScopedMasteryKey(classlessWeaponMasteryKey("marksmanship"))).toBe("v1:weapon:marksmanship");
    expect(livingWorldSocialMasteryKeys("negotiation", "lyra").map(canonicalScopedMasteryKey)).toEqual([
      "v1:social:negotiation",
      "v1:npc_relation:lyra",
    ]);
    expect(canonicalScopedMasteryKey(legacyDisciplineMasteryKey("blade_mastery"))).toBe("v1:weapon:blade");
    expect(canonicalScopedMasteryKey(legacyDisciplineMasteryKey("light_armor_mastery"))).toBe("v1:item:light_armor_mastery");
  });

  it("deduplicates identical events within one resolution and produces deterministic hashes", () => {
    const key = masteryKeys.politics("leadership");
    const duplicate = event(key, 1, "9", { receiptId: "politics_receipt", idempotencyKey: "same" });
    const left = resolveScopedMastery({ actorId: "user:42", key, events: [duplicate, duplicate] });
    const right = resolveScopedMastery({ actorId: "user:42", key, events: [duplicate] });
    expect(left).toEqual(right);
    expect(left.stateHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not reapply persisted receipts and rejects changed replay payloads", () => {
    const key = masteryKeys.social("diplomacy");
    const confirmed = event(key, 7, "25", {
      receiptId: "dialogue_receipt_7",
      idempotencyKey: "diplomacy_action_7",
      qualityDeltaExact: "2",
      contextMetricsExact: { successful_dialogues: "1" },
    });
    const first = resolveScopedMastery({ actorId: "user:42", key, events: [confirmed] });
    const replay = resolveScopedMastery({ actorId: "user:42", key, current: first, events: [confirmed] });
    expect(replay).toEqual(first);
    expect(() => resolveScopedMastery({
      actorId: "user:42",
      key,
      current: first,
      events: [{ ...confirmed, amountExact: "26" }],
    })).toThrow("MASTERY_IDEMPOTENCY_CONFLICT");
  });

  it("resolves incremental and batch streams to the same persisted state", () => {
    const key = masteryKeys.weapon("heavy_tech");
    const firstEvent = event(key, 1, "12", { receiptId: "combat_receipt_1", idempotencyKey: "heavy_tech_1" });
    const secondEvent = event(key, 2, "17", { receiptId: "combat_receipt_2", idempotencyKey: "heavy_tech_2" });
    const batch = resolveScopedMastery({ actorId: "user:42", key, events: [firstEvent, secondEvent] });
    const first = resolveScopedMastery({ actorId: "user:42", key, events: [firstEvent] });
    const incremental = resolveScopedMastery({ actorId: "user:42", key, current: first, events: [secondEvent] });
    expect(incremental).toEqual(batch);
  });
});
