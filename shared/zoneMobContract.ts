import { validWorldPosition } from "./zonePresenceContract";

export const ZONE_MOB_CONTRACT_VERSION = "aurion-zone-mob-fsm.v1" as const;
export const ZONE_MAX_MOBS = 32;
export const zoneMobStates = ["idle", "patrolling", "combat", "evading"] as const;
export const zoneMobArchetypes = ["clockwork_stalker", "corrupted_golem", "aether_wisp", "steam_drake", "centurion_elite", "titan_boss"] as const;
export type ZoneMobState = (typeof zoneMobStates)[number];
export type ZoneMobArchetype = (typeof zoneMobArchetypes)[number];

export type ConfirmedZoneMob = Readonly<{
  entityId: string;
  archetype: ZoneMobArchetype;
  level: number;
  state: ZoneMobState;
  position: Readonly<{ x: number; z: number }>;
  targetEntityId: string | null;
  isBoss: boolean;
  isElite: boolean;
}>;

function validMobEntityId(value: unknown): value is string {
  return typeof value === "string" && /^mob_[1-9][0-9]{0,2}$/.test(value);
}

function validTargetEntityId(value: unknown): value is string | null {
  return value === null || (typeof value === "string" && /^player:[1-9][0-9]*$/.test(value));
}

export function validConfirmedZoneMobs(value: unknown): value is ConfirmedZoneMob[] {
  if (!Array.isArray(value) || value.length > ZONE_MAX_MOBS) return false;
  const identities = new Set<string>();
  let previous = "";
  return value.every((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return false;
    const mob = candidate as ConfirmedZoneMob;
    if (!validMobEntityId(mob.entityId) || identities.has(mob.entityId) || (index > 0 && mob.entityId <= previous)) return false;
    identities.add(mob.entityId); previous = mob.entityId;
    if (!zoneMobArchetypes.includes(mob.archetype) || !zoneMobStates.includes(mob.state)) return false;
    if (!Number.isSafeInteger(mob.level) || mob.level < 1 || mob.level > 10_000) return false;
    if (!mob.position || !validWorldPosition(mob.position) || !validTargetEntityId(mob.targetEntityId)) return false;
    if (typeof mob.isBoss !== "boolean" || typeof mob.isElite !== "boolean" || (mob.isBoss && !mob.isElite)) return false;
    return mob.state === "combat" ? mob.targetEntityId !== null : mob.targetEntityId === null;
  });
}
