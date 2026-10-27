import { canonicalSha256 } from "../../shared/aurionCanonicalHash";

export interface CanonicalPlayerState {
  entityId: string;
  userId: number;
  x: number;
  z: number;
  /** Last authoritative movement vector; transport arrival metadata stays outside truth. */
  inputX: number;
  inputZ: number;
  health: number;
  maxHealth: number;
  stamina: number;
  combatLevel: number;
  weaponBonus: number;
  /** Absent only in legacy snapshots; false is server-confirmed unarmed. */
  weaponEquipped?: boolean;
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

export interface CanonicalZoneQuestInstance {
  instanceId: string;
  templateId: string;
  templateVersion: number;
  worldId: string;
  playerUserId: number;
  giverNpcId: string;
  seedDigest: string;
  planHash: string;
  graphHash: string;
  currentNodeId: string;
  completedNodeIds: string[];
  boundRoles: Array<Record<string, unknown>>;
  state: "offered" | "active" | "completed" | "failed" | "quarantined";
  objectiveProgress: Record<string, string | number | boolean>;
  updatedAtTick: number;
  createdAt: string;
  updatedAt: string;
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
  questInstances?: CanonicalZoneQuestInstance[];
}

/**
 * Return an immutable-by-value canonical snapshot: no live map/object identity is
 * retained and every domain collection has a deterministic order.
 */
export function sortCanonicalZoneState(state: CanonicalZoneState): CanonicalZoneState {
  const players = new Array<CanonicalPlayerState>(state.players.length);
  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[i];
    const skillCooldownKeys = Object.keys(player.skillCooldowns).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    const skillCooldowns: Record<string, number> = {};
    for (let j = 0; j < skillCooldownKeys.length; j++) {
      const key = skillCooldownKeys[j];
      skillCooldowns[key] = player.skillCooldowns[key];
    }
    players[i] = { ...player, skillCooldowns };
  }
  players.sort((a, b) => a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0);

  const mobs = new Array<CanonicalMobState>(state.mobs.length);
  for (let i = 0; i < state.mobs.length; i++) {
    mobs[i] = { ...state.mobs[i] };
  }
  mobs.sort((a, b) => a.entityId < b.entityId ? -1 : a.entityId > b.entityId ? 1 : 0);

  const resources = new Array<CanonicalResourceState>(state.resources.length);
  for (let i = 0; i < state.resources.length; i++) {
    resources[i] = { ...state.resources[i] };
  }
  resources.sort((a, b) => a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0);

  const sourceQuestSummaries = state.questSummaries || [];
  const questSummaries = new Array<CanonicalQuestSummary>(sourceQuestSummaries.length);
  for (let i = 0; i < sourceQuestSummaries.length; i++) {
    questSummaries[i] = { ...sourceQuestSummaries[i] };
  }
  questSummaries.sort((a, b) => a.userId - b.userId || (a.questId < b.questId ? -1 : a.questId > b.questId ? 1 : 0));

  let questInstances: CanonicalZoneQuestInstance[] | undefined;
  if (state.questInstances) {
    questInstances = new Array<CanonicalZoneQuestInstance>(state.questInstances.length);
    for (let i = 0; i < state.questInstances.length; i++) {
      const quest: CanonicalZoneQuestInstance = state.questInstances[i]!;

      const completedNodeIds = quest.completedNodeIds.slice().sort();

      const boundRoles = new Array<Record<string, unknown>>(quest.boundRoles.length);
      for (let j = 0; j < quest.boundRoles.length; j++) {
        boundRoles[j] = { ...quest.boundRoles[j] };
      }

      const objectiveProgressKeys: string[] = Object.keys(quest.objectiveProgress).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      const objectiveProgress: Record<string, string | number | boolean> = {};
      for (let j = 0; j < objectiveProgressKeys.length; j++) {
        const key = objectiveProgressKeys[j]!;
        objectiveProgress[key] = quest.objectiveProgress[key];
      }

      questInstances[i] = {
        ...quest,
        completedNodeIds,
        boundRoles,
        objectiveProgress,
      };
    }
    questInstances.sort((a, b) => a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0);
  }

  return {
    schema: "aurion.zone.state.v1",
    worldId: state.worldId,
    zoneId: state.zoneId,
    tick: state.tick,
    ruleset: state.ruleset,
    combatSequence: state.combatSequence,
    players,
    mobs,
    resources,
    questSummaries,
    ...(questInstances ? { questInstances } : {}),
  };
}

export function hashCanonicalZoneState(state: CanonicalZoneState): string {
  return canonicalSha256(sortCanonicalZoneState(state));
}
