import { ax1MobCombatProjection } from "./ax1CombatProjection";
import type { MobDefinition } from "./wasdMobFsmProtocol";

const sourceDefinitions = [
  ["clockwork_stalker",1,18,-18,false,false], ["aether_wisp",2,34,-28,false,false],
  ["corrupted_golem",3,-34,-20,false,true], ["steam_drake",4,-48,28,false,true],
  ["centurion_elite",5,28,42,false,true], ["titan_boss",15,0,68,true,true],
  ["aether_wisp",1,-55,-50,false,false], ["clockwork_stalker",2,-44,-28,false,false],
  ["aether_wisp",3,-33,-6,false,false], ["clockwork_stalker",4,-22,-50,false,false],
  ["aether_wisp",1,-11,-28,false,false], ["clockwork_stalker",2,0,-6,false,false],
  ["aether_wisp",3,11,-50,false,false], ["clockwork_stalker",4,22,-28,false,false],
  ["aether_wisp",1,33,-6,false,false], ["clockwork_stalker",2,44,-50,false,false],
] as const;

const compareText = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0;

/** AX1 owns visible/content identity and calibrated content parameters, never state transitions. */
export const observatoryMobDefinitions: readonly MobDefinition[] = Object.freeze(sourceDefinitions.map(([archetype, level, x, z, isBoss, isElite], index) => {
  const projection = ax1MobCombatProjection(archetype, level);
  return Object.freeze({
    entityId: `mob_${index + 1}`,
    archetype,
    level,
    homePosition: Object.freeze({ x: x * 1_000, z: z * 1_000 }),
    isBoss,
    isElite,
    attackRangeFixed: projection.attackRangeFixed,
    attackCooldownTicks: projection.attackCooldownTicks,
    maxHealth: projection.maxHealth,
  });
}).sort((left, right) => compareText(left.entityId, right.entityId)));
