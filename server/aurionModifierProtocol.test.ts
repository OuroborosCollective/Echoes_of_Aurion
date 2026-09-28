import { describe, expect, it } from "vitest";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  resolveAurionDerivedStats,
  type AurionModifier,
} from "./aurionModifierProtocol";

const evidence = (id: string) =>
  canonicalSha256({ domain: "aurion.modifier.test.evidence.v1", id });
const modifier = (overrides: Partial<AurionModifier> = {}): AurionModifier => ({
  modifierId: "modifier:base",
  source: {
    kind: "equipment",
    id: "item:base",
    revision: "content.v1",
    evidenceHash: evidence("base"),
  },
  stat: "power",
  operation: "add",
  amount: 0,
  priority: 0,
  stackingGroup: "default",
  stacking: "sum",
  ...overrides,
});

describe("aurionModifierProtocol", () => {
  it("matches Wolfram fixed-point vectors and is invariant to source arrival order", () => {
    const modifiers = [
      modifier({
        modifierId: "equipment:power",
        source: {
          kind: "equipment",
          id: "item:astral",
          revision: "loot.v2",
          evidenceHash: evidence("equipment"),
        },
        amount: 4,
        stackingGroup: "equipment",
      }),
      modifier({
        modifierId: "effect:power",
        source: {
          kind: "effect",
          id: "effect:ward",
          revision: "effect.v1",
          evidenceHash: evidence("effect"),
        },
        operation: "scale_bps",
        amount: 2_500,
        stackingGroup: "ward",
      }),
    ];
    const first = resolveAurionDerivedStats({
      baseStats: { power: 37 },
      modifiers,
      logicalTick: 4,
    });
    const reordered = resolveAurionDerivedStats({
      baseStats: { power: 37 },
      modifiers: [...modifiers].reverse(),
      logicalTick: 4,
    });
    expect(first.stats).toEqual({ power: 51 }); // Wolfram: Floor[(37 + 4) * 12500 / 10000] = 51.
    expect(first).toEqual(reordered);
    expect(first.sourceSetHash).toBe(reordered.sourceSetHash);
    expect(first.derivedStatsHash).toBe(reordered.derivedStatsHash);
    expect(
      resolveAurionDerivedStats({
        baseStats: { power: -7 },
        modifiers: [
          modifier({
            operation: "scale_bps",
            amount: -2_500,
            stackingGroup: "debuff",
          }),
        ],
        logicalTick: 0,
      }).stats.power
    ).toBe(-6); // Wolfram: Floor[-7 * 7500 / 10000] = -6.
  });

  it("uses canonical base-state conditions, logical expiry and explicit caps", () => {
    const modifiers = [
      modifier({
        modifierId: "expired",
        stat: "defense",
        operation: "add",
        amount: 2_500,
        stackingGroup: "ward",
        source: {
          kind: "effect",
          id: "ward",
          revision: "effect.v1",
          evidenceHash: evidence("ward"),
        },
        expiresAtTick: 5,
      }),
      modifier({
        modifierId: "conditional",
        stat: "defense",
        operation: "add",
        amount: 900,
        stackingGroup: "conditional",
        condition: { stat: "luck", comparison: "gte", value: 5 },
      }),
      modifier({
        modifierId: "attack-add",
        stat: "attack",
        operation: "add",
        amount: 25_000,
        stackingGroup: "attack",
      }),
      modifier({
        modifierId: "attack-max",
        stat: "attack",
        operation: "max",
        amount: 30_000,
        stackingGroup: "cap",
      }),
      modifier({
        modifierId: "guard-add",
        stat: "guard",
        operation: "add",
        amount: -25_000,
        stackingGroup: "guard",
      }),
      modifier({
        modifierId: "guard-min",
        stat: "guard",
        operation: "min",
        amount: 1_000,
        stackingGroup: "cap",
      }),
    ];
    expect(
      resolveAurionDerivedStats({
        baseStats: { attack: 10_000, defense: 10_000, guard: 10_000, luck: 4 },
        modifiers,
        logicalTick: 4,
      }).stats
    ).toEqual({ attack: 30_000, defense: 12_500, guard: 1_000, luck: 4 });
    expect(
      resolveAurionDerivedStats({
        baseStats: { attack: 10_000, defense: 10_000, guard: 10_000, luck: 4 },
        modifiers,
        logicalTick: 5,
      }).stats.defense
    ).toBe(10_000);
  });

  it("records source evidence in the hash and fails closed on ambiguous or unsafe inputs", () => {
    const first = resolveAurionDerivedStats({
      baseStats: { power: 10 },
      modifiers: [
        modifier({
          amount: 5,
          source: {
            kind: "skill",
            id: "skill:arc",
            revision: "skills.v1",
            evidenceHash: evidence("skill-a"),
          },
        }),
      ],
      logicalTick: 1,
    });
    const changedSource = resolveAurionDerivedStats({
      baseStats: { power: 10 },
      modifiers: [
        modifier({
          amount: 5,
          source: {
            kind: "skill",
            id: "skill:arc",
            revision: "skills.v1",
            evidenceHash: evidence("skill-b"),
          },
        }),
      ],
      logicalTick: 1,
    });
    expect(changedSource.stats).toEqual(first.stats);
    expect(changedSource.sourceSetHash).not.toBe(first.sourceSetHash);
    expect(changedSource.derivedStatsHash).not.toBe(first.derivedStatsHash);
    expect(() =>
      resolveAurionDerivedStats({
        baseStats: {},
        modifiers: [modifier(), modifier()],
        logicalTick: 0,
      })
    ).toThrow("AURION_MODIFIER_ID_DUPLICATE");
    expect(() =>
      resolveAurionDerivedStats({
        baseStats: {},
        modifiers: [modifier({ operation: "scale_bps", amount: -10_001 })],
        logicalTick: 0,
      })
    ).toThrow("AURION_MODIFIER_SCALE_BPS_OUT_OF_RANGE");
    expect(() =>
      resolveAurionDerivedStats({
        baseStats: {},
        modifiers: [
          modifier({ modifierId: "min", operation: "min", amount: 5 }),
          modifier({ modifierId: "max", operation: "max", amount: 4 }),
        ],
        logicalTick: 0,
      })
    ).toThrow("AURION_MODIFIER_CAP_CONFLICT");
  });
});
