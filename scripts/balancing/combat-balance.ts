/** Deterministic resolver experiment, not production encounter evidence. */
import { resolveCombatDelta } from "../../server/wasdCombatDeltaProtocol";
import { combatRule } from "../../shared/aurionCombatRules";
import { resolveAddressableRandomU32 } from "../../server/determinism/aurionAddressableRandom";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";

const rows = [];
for (const level of [1, 7, 20])
  for (const weaponBonus of [0, 15, 30])
    for (const ruleset of ["v3", "v4"]) {
      let strikes = 0,
        hits = 0,
        damage = 0,
        seconds = 0,
        staminaSpent = 0;
      const rule = combatRule(null);
      for (let trial = 0; trial < 100; trial++) {
        let hp = 180 + level * 45,
          stamina = 100,
          nextAttack = 0;
        for (let tick = 0; tick < 10000 && hp > 0; tick++) {
          if (tick >= nextAttack && stamina >= 8) {
            const draw = (purpose: string, drawIndex: number) =>
              resolveAddressableRandomU32({
                worldSeedDigest: canonicalSha256("balance-v1"),
                rulesetVersion: `aurion.zone.rules.${ruleset}`,
                tick,
                systemId: "aurion.balance",
                entityId: "player:1",
                eventId: `trial:${trial}`,
                purpose,
                drawIndex,
              });
            const delta = resolveCombatDelta(
              "melee",
              { id: "player:1", stamina, skills: { combat: { level } } },
              { id: "mob_1", health: hp, skills: { combat: { level } } },
              {
                tick,
                sequence: tick,
                weaponBonus,
                unarmed: weaponBonus === 0,
                entropy: {
                  hitU32: draw("hit", 0),
                  critU32: draw("crit", 1),
                  damageU32: draw("damage", 2),
                },
                ...(ruleset === "v4"
                  ? {
                      tuning: {
                        cost: rule.cost,
                        power: rule.power,
                        hitChance: 0.9,
                      },
                    }
                  : {}),
              }
            );
            hp = delta.result.defenderHealth;
            stamina = Math.max(0, stamina + delta.staminaDelta);
            strikes++;
            hits += Number(delta.result.hit);
            damage += delta.result.damage;
            staminaSpent -= delta.staminaDelta;
            nextAttack = tick + 8;
          }
          stamina = Math.min(100, stamina + 1);
          seconds += 0.1;
        }
      }
      rows.push({
        level,
        weaponBonus,
        ruleset,
        trials: 100,
        averageFightSeconds: Number((seconds / 100).toFixed(2)),
        hitRate: Number((hits / strikes).toFixed(3)),
        averageStrikeDamage: Number((damage / strikes).toFixed(2)),
        averageStaminaSpent: staminaSpent / 100,
      });
    }
console.log(
  JSON.stringify(
    {
      schema: "aurion.combat.balance.v1",
      generatedBy: "CodeRabbit Agent",
      scope:
        "resolver-only; equal-level stationary target; 0.8-second attack cadence; no incoming damage, skills or movement",
      rows,
    },
    null,
    2
  )
);
