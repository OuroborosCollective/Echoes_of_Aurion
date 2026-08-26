import { describe, expect, it } from "vitest";
import { resolveCombatStrike, resolveExpeditionLayout, resolveMonsterSpawn, resolveMountTravel, resolveSpellCast } from "./wasdAurionExpeditionProtocol";

describe("wasdAurionExpeditionProtocol", () => {
  it("builds the same expedition layout from the same explicit seed and resolution", () => {
    const input = { expeditionId: "cinder-vault", seed: "aurion-cinder-v1", tier: 3, resolutionIndex: 21 };
    const first = resolveExpeditionLayout(input);
    const second = resolveExpeditionLayout(input);
    expect(first).toEqual(second);
    expect(first.rooms.length).toBeGreaterThanOrEqual(4);
    expect(first.rooms.length).toBeLessThanOrEqual(9);
  });

  it("spawns biome-specific, seeded monsters with bounded optional mutations", () => {
    const first = resolveMonsterSpawn({ spawnerId: "windhollow-grove", biome: "mountain", packIndex: 1, resolutionIndex: 5 });
    const second = resolveMonsterSpawn({ spawnerId: "windhollow-grove", biome: "mountain", packIndex: 1, resolutionIndex: 5 });
    expect(first).toEqual(second);
    expect(first.mutations).toContain("frost_resistance");
    expect(first.strength).toBeGreaterThanOrEqual(4);
  });

  it("resolves receipt-bound combat without a fixed Wasd tick", () => {
    const input = { action: "melee" as const, attacker: { id: "player", combatLevel: 8, stamina: 40, health: 100 }, defender: { id: "wolf", combatLevel: 4, stamina: 20, health: 80 }, weaponBonus: 3, receiptId: "combat-1", resolutionIndex: 4 };
    expect(resolveCombatStrike(input)).toEqual(resolveCombatStrike(input));
    expect(resolveCombatStrike({ ...input, attacker: { ...input.attacker, stamina: 0 } })).toMatchObject({ state: "rejected", reason: "no_stamina" });
  });

  it("bounds spell potency by weather and verifies mana before mutation", () => {
    const spell = { id: "ember-lance", kind: "fire" as const, cost: 10, potency: 20, effect: "burn" };
    const cast = resolveSpellCast({ caster: { id: "mage", combatLevel: 5, stamina: 20, health: 100, mana: 20 }, spell, weatherTone: "ashfall", receiptId: "spell-1", resolutionIndex: 8 });
    expect(cast).toMatchObject({ state: "cast", potency: 23, manaAfter: 10 });
    expect(resolveSpellCast({ caster: { id: "mage", combatLevel: 5, stamina: 20, health: 100, mana: 5 }, spell, weatherTone: "clear", receiptId: "spell-2", resolutionIndex: 8 })).toMatchObject({ state: "rejected", reason: "no_mana" });
  });

  it("resolves mount travel only from a confirmed receipt and explicit inputs", () => {
    const travel = resolveMountTravel({ position: { x: 1, y: 0, z: 1 }, direction: { x: 1, y: 0, z: -1 }, speed: 2, receiptId: "travel-1", resolutionIndex: 6 });
    expect(travel.position).toEqual({ x: 3, y: 0, z: -1 });
    expect(travel.receiptHash).toHaveLength(64);
  });
});
