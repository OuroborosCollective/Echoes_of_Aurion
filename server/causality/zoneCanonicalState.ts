import { canonicalSha256 } from "../../shared/aurionCanonicalHash";

export interface CanonicalPlayerState {
  entityId: string;
  userId: number;
  x: number;
  z: number;
  inputX: number;
  inputZ: number;
  health: number;
  maxHealth: number;
  stamina: number;
  combatLevel: number;
  weaponBonus: number;
  weaponTrack: string;
  lastAcceptedClientSeq: number;
  lastCombatSequence: number;
  skillCooldowns: Record<string, number>;
}

export interface CanonicalMobState {
  entityId: string;
  mobId: string;
  archetype?: string;
  x: number;
  z: number;
  health: number;
  maxHealth: number;
  stamina: number;
  state: string;
  targetEntityId: string | null;
  idleUntilTick: number;
  patrolIndex: number;
  nextAttackTick: number;
}

export interface CanonicalResourceState {
  nodeId: string;
  resourceType: string;
  state: "ready" | "depleted";
  respawnTick: number;
  remainingGathers: number;
}

export interface CanonicalQuestSummary {
  userId: number;
  questId: string;
  status: "accepted" | "completed";
  updatedAtTick: number;
}

export interface CanonicalTransferPayload {
  schema: "aurion.transfer.payload.v1";
  entityId: string;
  kind: "player" | "item" | "projectile";
  data: unknown;
}

export interface CanonicalZoneState {
  schema: "aurion.zone.state.v1";
  worldId: string;
  zoneId: string;
  tick: number;
  ruleset: string;
  combatSequence: number;
  players: CanonicalPlayerState[];
  mobs: CanonicalMobState[];
  resources: CanonicalResourceState[];
  questSummaries: CanonicalQuestSummary[];
}

export function sortCanonicalZoneState(state: CanonicalZoneState): CanonicalZoneState {
  return {
    schema: "aurion.zone.state.v1",
    worldId: state.worldId,
    zoneId: state.zoneId,
    tick: state.tick,
    ruleset: state.ruleset,
    combatSequence: state.combatSequence,
    players: [...state.players].sort((a, b) => a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0),
    mobs: [...state.mobs].sort((a, b) => a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0),
    resources: [...state.resources].sort((a, b) => a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0),
    questSummaries: [...(state.questSummaries || [])].sort((a, b) => a.userId - b.userId || (a.questId < b.questId ? -1 : a.questId > b.questId ? 1 : 0)),
  };
}

export function hashCanonicalZoneState(state: CanonicalZoneState): string {
  return canonicalSha256(sortCanonicalZoneState(state));
}
