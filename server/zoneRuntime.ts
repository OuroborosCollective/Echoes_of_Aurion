import type WebSocket from "ws";
import {
  ZONE_MAX_PRESENCES,
  ZONE_PROTOCOL_VERSION,
} from "@shared/zonePresenceContract";
import {
  ZONE_COMBAT_CONTRACT_VERSION,
  ZONE_COMBAT_MAX_STAMINA,
  type ConfirmedZoneCombatant,
  type ConfirmedZoneCombatEvent,
} from "@shared/zoneCombatContract";
import {
  AX1_BLADE_SKILL_SOURCE_REVISION,
  ax1BladeSkillById,
  type Ax1BladeSkillId,
} from "@shared/ax1BladeSkillProtocol";
import {
  AURION_CAUSAL_TICK_SCHEMA,
  AURION_ZONE_RULESET_VERSION,
  type AurionCausalTickReceipt,
  computeReceiptHash,
} from "../shared/aurionCausalTickContract";
import {
  type AurionZoneIntent,
  orderCanonicalZoneIntents,
  hashCanonicalIntents,
} from "../shared/aurionZoneIntentContract";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import {
  type CanonicalZoneState,
  type CanonicalPlayerState,
  type CanonicalMobState,
  type CanonicalResourceState,
  type CanonicalQuestSummary,
  sortCanonicalZoneState,
  hashCanonicalZoneState,
} from "./causality/zoneCanonicalState";
import {
  computeRngRootHash,
  resolveAddressableRandomFloat,
  type RngEventRecord,
} from "./determinism/aurionAddressableRandom";
import { globalTickRecorder } from "./causality/tickRecorder";
import { globalCausalPersistence } from "./causality/persistence";
import { activeProvenance } from "./aurionProvenance";

// Wire up MariaDB persistence for the causal evidence chain
globalTickRecorder.setPersistenceAdapter(globalCausalPersistence);
import {
  makeZoneConnectionId,
  ZONE_TICK_MS,
  type ZoneAttack,
  type ZoneId,
  type ZoneMove,
  type ZonePosition,
  type ZonePresence,
  type ZoneServerMessage,
  type ZoneSkill,
  type ZoneSnapshot,
  type ZoneWelcome,
} from "./zoneProtocol";
import { ZoneMobRuntime } from "./zoneMobRuntime";
import { ZoneResourceRuntime } from "./zoneResourceRuntime";
import { worldNatureCollision } from "./worldNatureCollision";
import { AX1_PLAYER_BASIC_MELEE_RANGE_FIXED } from "./ax1CombatProjection";
import { mobDistance } from "./wasdMobFsmProtocol";
import {
  reduceCombatDelta,
  resolveCombatDelta,
} from "./wasdCombatDeltaProtocol";
import { WASD_GAMEPLAY_SOURCE_REVISION } from "./wasdAREDeterminism";
import { regenerateWasdStamina, WASD_MAX_STAMINA } from "./wasdStaminaProtocol";
import { integrateWasdZoneMovement } from "./wasdZoneMovementProtocol";
import {
  WASD_DEFAULT_ZONE_COMBAT_PROFILE,
  validWasdZoneCombatProfile,
  type WasdZoneCombatProfile,
} from "./wasdCombatProfileProtocol";
import { resolveReturnStoneRevival } from "./returnStoneRevival";

export type ZoneCombatProfile = WasdZoneCombatProfile;
export const DEFAULT_ZONE_COMBAT_PROFILE: ZoneCombatProfile = WASD_DEFAULT_ZONE_COMBAT_PROFILE;

type PresencePeer = {
  connectionId: string;
  userId: number;
  socket: WebSocket;
  input: ZoneMove["input"];
  lastAcceptedClientSeq: number;
  position: ZonePosition;
  combatLevel: number;
  health: number;
  maxHealth: number;
  stamina: number;
  weaponBonus: number;
  weaponTrack: WasdZoneCombatProfile["weaponTrack"];
  skillCooldownUntilTick: Map<Ax1BladeSkillId, number>;
  lastCombatSequence: number;
};

type AttackResult =
  | "accepted"
  | "stale"
  | "missing"
  | "invalid_target"
  | "invalid_skill"
  | "cooldown"
  | "out_of_range"
  | "dead";

function serialize(payload: ZoneServerMessage) {
  return JSON.stringify(payload);
}

function compareBinary(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Compatibility entry point; the movement law itself is owned by WASD. */
export function integrateZoneMovement(
  position: ZonePosition,
  input: ZoneMove["input"]
): ZonePosition {
  return integrateWasdZoneMovement(position, input, (from, desired) =>
    worldNatureCollision.resolve(from, desired)
  );
}

/**
 * Zone orchestration owns authenticated peers, transport order and projection.
 * AX1 supplies visible/content parameters; WASD owns movement/combat/FSM transitions.
 * Quest state is intentionally absent.
 */
export class AuthoritativeMovementZone {
  private readonly peers = new Map<string, PresencePeer>();
  private readonly peersByEntityId = new Map<string, PresencePeer>();
  private readonly mobRuntime = new ZoneMobRuntime();
  private readonly resourceRuntime = new ZoneResourceRuntime();
  private snapshotSeq = 0;
  private tickNumber = 0;
  private combatSequence = 0;
  private inputAcknowledgementPending = false;
  private movedLastTick = false;
  private sortedPeers: PresencePeer[] = [];
  private sortedPeersByEntityId: PresencePeer[] = [];
  private sortedPeersDirty = false;
  private pendingIntents: AurionZoneIntent[] = [];
  private arrivalSequence = 0;
  private previousReceiptHash: string | null = null;
  private lastReceipt: AurionCausalTickReceipt | null = null;
  private questSummaries = new Map<string, CanonicalQuestSummary>();

  isReplay: boolean = false;
  constructor(readonly zoneId: ZoneId) {}

  enqueueIntent(intent: AurionZoneIntent): void {
    this.pendingIntents.push(intent);
  }

  getPendingIntents(): readonly AurionZoneIntent[] {
    return this.pendingIntents;
  }

  getLatestReceipt(): AurionCausalTickReceipt | null {
    return this.lastReceipt;
  }

  getTickNumber(): number {
    return this.tickNumber;
  }

  getCombatSequence(): number {
    return this.combatSequence;
  }

  getCanonicalZoneState(): CanonicalZoneState {
    this.refreshPeerOrder();
    const players: CanonicalPlayerState[] = this.sortedPeersByEntityId.map(peer => {
      const cooldowns: Record<string, number> = {};
      for (const [skillId, tick] of peer.skillCooldownUntilTick.entries()) {
        cooldowns[skillId] = tick;
      }
      return {
        entityId: `player:${peer.userId}`,
        userId: peer.userId,
        x: peer.position.x,
        z: peer.position.z,
        health: peer.health,
        maxHealth: peer.maxHealth,
        stamina: peer.stamina,
        combatLevel: peer.combatLevel,
        weaponBonus: peer.weaponBonus,
        weaponTrack: peer.weaponTrack,
        lastAcceptedClientSeq: peer.lastAcceptedClientSeq,
        lastCombatSequence: peer.lastCombatSequence,
        skillCooldowns: cooldowns,
      };
    });

    const mobs: CanonicalMobState[] = this.mobRuntime.orderedStates().map(mob => ({
      entityId: mob.definition.entityId,
      mobId: mob.definition.entityId,
      archetype: mob.definition.archetype,
      x: mob.position.x,
      z: mob.position.z,
      health: mob.health,
      maxHealth: mob.maxHealth,
      state: mob.state,
      targetEntityId: mob.targetEntityId,
      lastAttackTick: mob.nextAttackTick,
    }));

    const resourceSnapshot = this.resourceRuntime.snapshot(this.tickNumber);
    const resources: CanonicalResourceState[] = resourceSnapshot.nodes.map(node => ({
      nodeId: node.nodeId,
      resourceType: "ecology_node",
      state: node.depleted ? "depleted" : "ready",
      respawnTick: node.respawnAtTick ?? 0,
      remainingGathers: node.remaining,
    }));

    const questSummaries: CanonicalQuestSummary[] = Array.from(this.questSummaries.values());

    return sortCanonicalZoneState({
      schema: "aurion.zone.state.v1",
      worldId: "aurion-main",
      zoneId: this.zoneId,
      tick: this.tickNumber,
      ruleset: AURION_ZONE_RULESET_VERSION,
      combatSequence: this.combatSequence,
      players,
      mobs,
      resources,
      questSummaries,
    });
  }

  restoreFromCanonicalState(
    state: CanonicalZoneState,
    previousReceiptHash?: string | null
  ): void {
    this.tickNumber = state.tick;
    this.combatSequence = state.combatSequence;
    if (previousReceiptHash !== undefined) {
      this.previousReceiptHash = previousReceiptHash;
    }
    this.peers.clear();
    this.peersByEntityId.clear();
    this.pendingIntents = [];

    const dummySocket = {
      readyState: 1,
      OPEN: 1,
      send: () => {},
      close: () => {},
    } as unknown as WebSocket;

    for (const player of state.players) {
      const connectionId = `restored_conn_${player.userId}`;
      const cooldownMap = new Map<Ax1BladeSkillId, number>();
      if (player.skillCooldowns) {
        for (const [sId, t] of Object.entries(player.skillCooldowns)) {
          cooldownMap.set(sId as Ax1BladeSkillId, t);
        }
      }
      const peer: PresencePeer = {
        connectionId,
        userId: player.userId,
        socket: dummySocket,
        input: { x: 0, z: 0 },
        lastAcceptedClientSeq: player.lastAcceptedClientSeq,
        position: { x: player.x, z: player.z },
        combatLevel: player.combatLevel,
        health: player.health,
        maxHealth: player.maxHealth,
        stamina: player.stamina,
        weaponBonus: player.weaponBonus,
        weaponTrack: player.weaponTrack as WasdZoneCombatProfile["weaponTrack"],
        skillCooldownUntilTick: cooldownMap,
        lastCombatSequence: player.lastCombatSequence,
      };
      this.peers.set(connectionId, peer);
      this.peersByEntityId.set(player.entityId, peer);
    }
    this.sortedPeersDirty = true;

    for (const mob of state.mobs) {
      this.mobRuntime.applyCombatState(mob.entityId, {
        health: mob.health,
        nextAttackTick: mob.lastAttackTick,
      });
    }

    this.questSummaries.clear();
    if (state.questSummaries) {
      for (const q of state.questSummaries) {
        this.questSummaries.set(`${q.userId}:${q.questId}`, { ...q });
      }
    }
  }

  join(values: {
    userId: number;
    socket: WebSocket;
    combatProfile?: ZoneCombatProfile;
  }): ZoneWelcome {
    if (!Number.isSafeInteger(values.userId) || values.userId < 1)
      throw new Error("ZONE_USER_INVALID");
    const profile = values.combatProfile ?? DEFAULT_ZONE_COMBAT_PROFILE;
    if (!validWasdZoneCombatProfile(profile))
      throw new Error("ZONE_COMBAT_PROFILE_INVALID");

    // O(1) map lookup instead of O(N) iteration for finding a previous connection
    const entityId = `player:${values.userId}`;
    const previous = this.peersByEntityId.get(entityId);

    if (!previous && this.peers.size >= ZONE_MAX_PRESENCES)
      throw new Error("ZONE_CAPACITY_REACHED");
    if (previous) {
      this.peers.delete(previous.connectionId);
      this.peersByEntityId.delete(entityId);
      previous.socket.close(1000, "superseded by authenticated reconnect");
    }
    const connectionId = makeZoneConnectionId();
    const newPeer: PresencePeer = {
      connectionId,
      userId: values.userId,
      socket: values.socket,
      input: { x: 0, z: 0 },
      lastAcceptedClientSeq: 0,
      position: { x: 0, z: 0 },
      combatLevel: profile.combatLevel,
      health: profile.maxHealth,
      maxHealth: profile.maxHealth,
      stamina: WASD_MAX_STAMINA,
      weaponBonus: profile.weaponBonus,
      weaponTrack: profile.weaponTrack,
      skillCooldownUntilTick: new Map<Ax1BladeSkillId, number>(),
      lastCombatSequence: 0,
    };
    this.peers.set(connectionId, newPeer);
    this.peersByEntityId.set(entityId, newPeer);
    this.sortedPeersDirty = true;
    const welcome: ZoneWelcome = {
      type: "welcome",
      protocolVersion: ZONE_PROTOCOL_VERSION,
      connectionId,
      selfEntityId: `player:${values.userId}`,
      zoneId: this.zoneId,
      snapshotSeq: ++this.snapshotSeq,
      tick: this.tickNumber,
      presences: this.presences(),
      mobs: this.mobRuntime.snapshot(),
      combatants: this.combatants(),
      resources: this.resourceRuntime.snapshot(this.tickNumber),
    };
    this.broadcastSnapshot();
    return welcome;
  }

  leave(connectionId: string): void {
    const peer = this.peers.get(connectionId);
    if (!peer) return;
    this.peers.delete(connectionId);
    this.peersByEntityId.delete(`player:${peer.userId}`);
    this.sortedPeersDirty = true;
    this.broadcastSnapshot();
  }

  positionForConnection(connectionId: string): ZonePosition | undefined {
    const position = this.peers.get(connectionId)?.position;
    return position ? { ...position } : undefined;
  }

  mobSnapshot() {
    return this.mobRuntime.snapshot();
  }

  combatSnapshot() {
    return this.combatants();
  }

  resourceSnapshot() {
    return this.resourceRuntime.snapshot(this.tickNumber);
  }

  submitMovement(
    connectionId: string,
    move: ZoneMove
  ): "accepted" | "stale" | "missing" {
    const peer = this.peers.get(connectionId);
    if (!peer) return "missing";
    if (move.clientSeq <= peer.lastAcceptedClientSeq) return "stale";
    peer.lastAcceptedClientSeq = move.clientSeq;
    peer.input = move.input;
    this.inputAcknowledgementPending = true;
    this.pendingIntents.push({
      type: "move",
      connectionId,
      entityId: `player:${peer.userId}`,
      clientSeq: move.clientSeq,
      arrivalSeq: ++this.arrivalSequence,
      input: { x: move.input.x, z: move.input.z },
    });
    return "accepted";
  }

  submitAttack(connectionId: string, attack: ZoneAttack): AttackResult {
    const peer = this.peers.get(connectionId);
    if (!peer) return "missing";
    if (attack.clientSeq <= peer.lastAcceptedClientSeq) return "stale";
    if (peer.health <= 0) return "dead";
    const mob = this.mobRuntime.stateFor(attack.targetEntityId);
    if (!mob || mob.health <= 0) return "invalid_target";
    if (mobDistance(peer.position, mob.position) > AX1_PLAYER_BASIC_MELEE_RANGE_FIXED)
      return "out_of_range";

    peer.lastAcceptedClientSeq = attack.clientSeq;
    this.inputAcknowledgementPending = true;
    this.pendingIntents.push({
      type: "attack",
      connectionId,
      entityId: `player:${peer.userId}`,
      clientSeq: attack.clientSeq,
      arrivalSeq: ++this.arrivalSequence,
      targetEntityId: attack.targetEntityId,
    });
    return "accepted";
  }

  submitSkill(connectionId: string, skill: ZoneSkill): AttackResult {
    const peer = this.peers.get(connectionId);
    if (!peer) return "missing";
    if (skill.clientSeq <= peer.lastAcceptedClientSeq) return "stale";
    if (peer.health <= 0) return "dead";
    const definition = ax1BladeSkillById(skill.skillId);
    if (
      peer.weaponTrack !== "blade" ||
      !definition ||
      definition.skillId !== "k_strike" ||
      definition.kind !== "melee"
    )
      return "invalid_skill";
    const readyAt = peer.skillCooldownUntilTick.get(skill.skillId) ?? 0;
    if (this.tickNumber < readyAt) return "cooldown";
    const mob = this.mobRuntime.stateFor(skill.targetEntityId);
    if (!mob || mob.health <= 0) return "invalid_target";
    if (mobDistance(peer.position, mob.position) > definition.rangeFixed)
      return "out_of_range";

    peer.lastAcceptedClientSeq = skill.clientSeq;
    this.inputAcknowledgementPending = true;
    this.pendingIntents.push({
      type: "skill",
      connectionId,
      entityId: `player:${peer.userId}`,
      clientSeq: skill.clientSeq,
      arrivalSeq: ++this.arrivalSequence,
      skillId: skill.skillId,
      targetEntityId: skill.targetEntityId,
    });
    return "accepted";
  }

  private resolvePlayerMelee(
    peer: PresencePeer,
    targetEntityId: string,
    skillId: Ax1BladeSkillId | null,
    rangeFixed: number,
    actionIndex: number
  ): { result: AttackResult; event?: ConfirmedZoneCombatEvent } {
    if (peer.health <= 0) return { result: "dead" };
    const mob = this.mobRuntime.stateFor(targetEntityId);
    if (!mob || mob.health <= 0) return { result: "invalid_target" };
    if (mobDistance(peer.position, mob.position) > rangeFixed)
      return { result: "out_of_range" };

    const sequence = this.tickNumber * 1000 + actionIndex;
    const attacker = {
      id: `player:${peer.userId}`,
      stamina: peer.stamina,
      skills: { combat: { level: peer.combatLevel } },
    };
    const defender = {
      id: mob.definition.entityId,
      health: mob.health,
      skills: { combat: { level: mob.definition.level } },
    };

    // Use Addressable RNG for combat
    const entropy = resolveAddressableRandomFloat({
      worldSeedDigest: "aurion-main-seed",
      rulesetVersion: AURION_ZONE_RULESET_VERSION,
      tick: this.tickNumber,
      entityId: attacker.id,
      actionSequence: sequence,
      purpose: skillId ? `combat.skill.${skillId}` : "combat.melee",
    });

    const delta = resolveCombatDelta("melee", attacker, defender, {
      tick: this.tickNumber,
      sequence,
      weaponBonus: peer.weaponBonus,
      entropy,
    });

    const patch = reduceCombatDelta(attacker, defender, delta);
    peer.stamina = patch.attacker.stamina;
    peer.lastCombatSequence = sequence;
    this.mobRuntime.applyCombatState(mob.definition.entityId, {
      health: patch.defender.health,
    });

    return { result: "accepted", event: this.combatEvent(delta, peer.stamina, patch.defender.health, skillId) };
  }

  tick(): boolean {
    const preState = this.getCanonicalZoneState();
    const preStateHash = hashCanonicalZoneState(preState);

    // 1. Order pending intents canonically
    const intentsToProcess = orderCanonicalZoneIntents(this.pendingIntents);
    this.pendingIntents = [];
    const orderedIntentHash = hashCanonicalIntents(intentsToProcess);

    this.tickNumber += 1;
    this.refreshPeerOrder();
    const rngEvents: RngEventRecord[] = [];
    const combatEvents: ConfirmedZoneCombatEvent[] = [];
    const revivedEntityIds: string[] = [];
    let changed = false;
    let actionIndex = 0;

    // Phase 01: Membership already handled via refreshPeerOrder.
    // Phase 01.5: deterministic return-stone revival. This depends only on
    // canonical combat/tick state and never on visual asset availability.
    for (const peer of this.sortedPeersByEntityId) {
      const revival = resolveReturnStoneRevival({
        zoneId: this.zoneId,
        tick: this.tickNumber,
        health: peer.health,
        maxHealth: peer.maxHealth,
        stamina: peer.stamina,
        lastCombatSequence: peer.lastCombatSequence,
      });
      if (!revival) continue;
      peer.health = revival.health;
      peer.stamina = revival.stamina;
      peer.position = { x: revival.position.x, z: revival.position.z };
      peer.input = { x: 0, z: 0 };
      revivedEntityIds.push(`player:${peer.userId}`);
      changed = true;
    }

    // Phase 02: Movement Intents
    for (const intent of intentsToProcess) {
      if (intent.type === "move") {
        const peer =
          this.peers.get(intent.connectionId) ??
          this.peersByEntityId.get(intent.entityId);
        if (peer && peer.health > 0) {
          peer.input = intent.input;
          if (intent.clientSeq > peer.lastAcceptedClientSeq) {
            peer.lastAcceptedClientSeq = intent.clientSeq;
          }
        }
      }
    }

    // Integrate Movement
    for (const peer of this.sortedPeers) {
      if ((peer.input.x === 0 && peer.input.z === 0) || peer.health <= 0)
        continue;
      const next = integrateZoneMovement(peer.position, peer.input);
      if (next.x === peer.position.x && next.z === peer.position.z) continue;
      peer.position = next;
      changed = true;
    }

    // Phase 03: Player Actions (Combat/Quests)
    for (const intent of intentsToProcess) {
      if (intent.type === "attack") {
        const peer = this.peersByEntityId.get(intent.entityId);
        if (peer) {
          if (intent.clientSeq > peer.lastAcceptedClientSeq) {
            peer.lastAcceptedClientSeq = intent.clientSeq;
          }
          const { result, event } = this.resolvePlayerMelee(
            peer,
            intent.targetEntityId,
            null,
            AX1_PLAYER_BASIC_MELEE_RANGE_FIXED,
            ++actionIndex
          );
          if (result === "accepted" && event) {
            changed = true;
            combatEvents.push(event);
            rngEvents.push({
              entityId: intent.entityId,
              purpose: "combat.melee",
              value: event.sequence,
            });
          }
        }
      } else if (intent.type === "skill") {
        const peer = this.peersByEntityId.get(intent.entityId);
        const definition = ax1BladeSkillById(intent.skillId as Ax1BladeSkillId);
        if (peer && definition) {
          if (intent.clientSeq > peer.lastAcceptedClientSeq) {
            peer.lastAcceptedClientSeq = intent.clientSeq;
          }
          const { result, event } = this.resolvePlayerMelee(
            peer,
            intent.targetEntityId,
            intent.skillId as Ax1BladeSkillId,
            definition.rangeFixed,
            ++actionIndex
          );
          if (result === "accepted" && event) {
            peer.skillCooldownUntilTick.set(
              intent.skillId as Ax1BladeSkillId,
              this.tickNumber + Math.max(1, Math.ceil(definition.cooldownMs / ZONE_TICK_MS))
            );
            changed = true;
            combatEvents.push(event);
            rngEvents.push({
              entityId: intent.entityId,
              purpose: `combat.skill.${intent.skillId}`,
              value: event.sequence,
            });
          }
        }
      } else if (intent.type === "quest_accept") {
        const peer = this.peersByEntityId.get(intent.entityId);
        if (peer && peer.health > 0) {
          const key = `${peer.userId}:${intent.questId}`;
          if (!this.questSummaries.has(key)) {
            this.questSummaries.set(key, {
              userId: peer.userId,
              questId: intent.questId,
              status: "accepted",
              updatedAtTick: this.tickNumber,
            });
            changed = true;
          }
        }
      } else if (intent.type === "quest_hand_in") {
        const peer = this.peersByEntityId.get(intent.entityId);
        if (peer && peer.health > 0) {
          const key = `${peer.userId}:${intent.questId}`;
          const current = this.questSummaries.get(key);
          if (current && current.status === "accepted") {
            current.status = "completed";
            current.updatedAtTick = this.tickNumber;
            changed = true;
          }
        }
      }
    }

    // Phase 04: Resource Transitions
    const resourcesChanged = this.resourceRuntime.tick(this.tickNumber);

    // Phase 05: Mob FSM Transitions
    const mobsChanged = this.mobRuntime.tick(this.presences(), this.tickNumber);

    // Phase 06: Mob Combat
    const mobCombatResult = this.resolveMobAttacks(++actionIndex);
    if (mobCombatResult.changed) changed = true;
    combatEvents.push(...mobCombatResult.events);

    // Phase 07: Regeneration
    for (const peer of this.sortedPeers) {
      if (peer.health > 0) {
        const nextStamina = regenerateWasdStamina(peer.stamina);
        if (nextStamina !== peer.stamina) {
          peer.stamina = nextStamina;
          changed = true;
        }
      }
    }

    // Phase 08: Persistence Events & Receipts
    const postState = this.getCanonicalZoneState();
    const postStateHash = hashCanonicalZoneState(postState);

    const transitionSummary = {
      tick: this.tickNumber,
      changed: changed || resourcesChanged || mobsChanged,
      intentsCount: intentsToProcess.length,
      combatSequence: this.combatSequence,
      revivedEntityIds,
    };
    const transitionHash = canonicalSha256(transitionSummary);
    const rngRootHash = computeRngRootHash(rngEvents);

    const receiptUnsigned: Omit<AurionCausalTickReceipt, "receiptHash"> = {
      schema: AURION_CAUSAL_TICK_SCHEMA,
      worldId: "aurion-main",
      zoneId: this.zoneId,
      tick: this.tickNumber,
      sourceRevision: process.env.AURION_SOURCE_REVISION || activeProvenance.commit,
      rulesetVersion: AURION_ZONE_RULESET_VERSION,
      previousReceiptHash: this.previousReceiptHash,
      preStateHash,
      orderedIntentHash,
      transitionHash,
      rngRootHash,
      postStateHash,
    };
    const receiptHash = computeReceiptHash(receiptUnsigned);
    const receipt: AurionCausalTickReceipt = {
      ...receiptUnsigned,
      receiptHash,
    };
    this.previousReceiptHash = receiptHash;
    this.lastReceipt = receipt;

    if (!this.isReplay) {
      globalTickRecorder.recordTick(receipt, postState, preState, intentsToProcess).catch(e => {
        console.error("[Aurion Zone] Async tick record failed", e);
      });
    }

    // Phase 09: Snapshot & Batch Broadcast
    for (const event of combatEvents) {
      this.broadcastCombat(event);
    }

    if (
      changed ||
      resourcesChanged ||
      mobsChanged ||
      this.movedLastTick ||
      this.inputAcknowledgementPending
    ) {
      this.broadcastSnapshot();
    }

    this.movedLastTick = changed;
    this.inputAcknowledgementPending = false;
    return changed || resourcesChanged || mobsChanged;
  }

  private resolveMobAttacks(actionIndex: number): { changed: boolean; events: ConfirmedZoneCombatEvent[] } {
    let changed = false;
    const events: ConfirmedZoneCombatEvent[] = [];
    let localActionIndex = actionIndex;

    for (const mob of this.mobRuntime.orderedStates()) {
      if (
        mob.state !== "combat" ||
        mob.health <= 0 ||
        !mob.targetEntityId ||
        this.tickNumber < mob.nextAttackTick
      )
        continue;

      const peer = this.peersByEntityId.get(mob.targetEntityId);
      if (!peer || peer.health <= 0) continue;
      if (mobDistance(mob.position, peer.position) > mob.definition.attackRangeFixed)
        continue;

      const sequence = this.tickNumber * 1000 + (++localActionIndex);
      const attacker = {
        id: mob.definition.entityId,
        stamina: mob.stamina,
        skills: { combat: { level: mob.definition.level } },
      };
      const defender = {
        id: `player:${peer.userId}`,
        health: peer.health,
        skills: { combat: { level: peer.combatLevel } },
      };

      const entropy = resolveAddressableRandomFloat({ worldSeedDigest: "aurion-main-seed", rulesetVersion: AURION_ZONE_RULESET_VERSION, tick: this.tickNumber, entityId: attacker.id, actionSequence: sequence, purpose: "combat.melee" });
      const delta = resolveCombatDelta("melee", attacker, defender, {
        tick: this.tickNumber,
        sequence,
        weaponBonus: 0,
        entropy,
      });
      const patch = reduceCombatDelta(attacker, defender, delta);
      this.mobRuntime.applyCombatState(mob.definition.entityId, {
        health: mob.health,
        stamina: patch.attacker.stamina,
        nextAttackTick: this.tickNumber + mob.definition.attackCooldownTicks,
      });
      peer.health = patch.defender.health;
      peer.lastCombatSequence = sequence;
      if (peer.health === 0) peer.input = { x: 0, z: 0 };

      events.push(this.combatEvent(delta, patch.attacker.stamina, peer.health, null));
      changed = true;
    }
    return { changed, events };
  }

  private combatEvent(
    delta: ReturnType<typeof resolveCombatDelta>,
    attackerStamina: number,
    defenderHealth: number,
    skillId: Ax1BladeSkillId | null
  ): ConfirmedZoneCombatEvent {
    return Object.freeze({
      type: "combat",
      contractVersion: ZONE_COMBAT_CONTRACT_VERSION,
      tick: delta.tick,
      sequence: delta.sequence,
      action: "melee",
      skillId,
      skillSourceRevision: skillId ? AX1_BLADE_SKILL_SOURCE_REVISION : null,
      attackerEntityId: delta.attackerId,
      defenderEntityId: delta.defenderId,
      hit: delta.result.hit,
      damage: delta.result.damage,
      crit: delta.result.crit,
      killed: delta.result.killed,
      defenderHealth,
      attackerStamina,
      gameplaySourceRevision: WASD_GAMEPLAY_SOURCE_REVISION,
    });
  }

  private broadcastCombat(event: ConfirmedZoneCombatEvent): void {
    const serialized = serialize(event);
    for (const peer of this.peers.values()) {
      if (peer.socket.readyState === peer.socket.OPEN)
        peer.socket.send(serialized);
    }
  }

  /** Refresh on membership changes before any readback, not just the next tick. */
  private refreshPeerOrder(): void {
    if (this.sortedPeersDirty) {
      this.sortedPeers = Array.from(this.peers.values()).sort((a, b) =>
        compareBinary(a.connectionId, b.connectionId)
      );
      this.sortedPeersByEntityId = Array.from(this.peers.values()).sort(
        (a, b) => compareBinary(`player:${a.userId}`, `player:${b.userId}`)
      );
      this.sortedPeersDirty = false;
    }
  }

  private presences(): ZonePresence[] {
    this.refreshPeerOrder();
    const out: ZonePresence[] = [];
    for (const peer of this.sortedPeersByEntityId) {
      out.push({
        entityId: `player:${peer.userId}`,
        userId: peer.userId,
        position: peer.position,
        lastAcceptedClientSeq: peer.lastAcceptedClientSeq,
      });
    }
    return out;
  }

  private combatants(): readonly ConfirmedZoneCombatant[] {
    this.refreshPeerOrder();
    const out: ConfirmedZoneCombatant[] = [];
    let peerIndex = 0;
    const mobs = this.mobRuntime.orderedStates();
    let mobIndex = 0;

    while (
      peerIndex < this.sortedPeersByEntityId.length ||
      mobIndex < mobs.length
    ) {
      const peer = this.sortedPeersByEntityId[peerIndex];
      const mob = mobs[mobIndex];
      const peerId = peer ? `player:${peer.userId}` : null;
      const mobId = mob ? mob.definition.entityId : null;

      if (peerId && (!mobId || compareBinary(peerId, mobId) < 0)) {
        out.push(
          Object.freeze({
            entityId: peerId,
            health: peer.health,
            maxHealth: peer.maxHealth,
            stamina: peer.stamina,
            maxStamina: ZONE_COMBAT_MAX_STAMINA,
            alive: peer.health > 0,
            combatLevel: peer.combatLevel,
            lastCombatSequence: peer.lastCombatSequence,
          })
        );
        peerIndex++;
      } else if (mobId) {
        out.push(
          Object.freeze({
            entityId: mobId,
            health: mob.health,
            maxHealth: mob.maxHealth,
            stamina: mob.stamina,
            maxStamina: ZONE_COMBAT_MAX_STAMINA,
            alive: mob.health > 0,
            combatLevel: mob.definition.level,
            lastCombatSequence: 0,
          })
        );
        mobIndex++;
      }
    }
    return Object.freeze(out);
  }

  private broadcastSnapshot(): void {
    const snapshot: ZoneSnapshot = {
      type: "snapshot",
      zoneId: this.zoneId,
      snapshotSeq: ++this.snapshotSeq,
      tick: this.tickNumber,
      presences: this.presences(),
      mobs: this.mobRuntime.snapshot(),
      combatants: this.combatants(),
      resources: this.resourceRuntime.snapshot(this.tickNumber),
    };
    const serialized = serialize(snapshot);
    for (const peer of this.peers.values()) {
      if (peer.socket.readyState === peer.socket.OPEN)
        peer.socket.send(serialized);
    }
  }
}

export class ZoneRegistry {
  private readonly zones = new Map<ZoneId, AuthoritativeMovementZone>();
  private sortedZones: AuthoritativeMovementZone[] = [];
  private sortedZonesDirty = false;

  get(zoneId: ZoneId): AuthoritativeMovementZone {
    const existing = this.zones.get(zoneId);
    if (existing) return existing;
    const zone = new AuthoritativeMovementZone(zoneId);
    this.zones.set(zoneId, zone);
    this.sortedZonesDirty = true;
    return zone;
  }

  tick(): void {
    if (this.sortedZonesDirty) {
      this.sortedZones = Array.from(this.zones.entries())
        .sort(([left], [right]) => compareBinary(left, right))
        .map(([, zone]) => zone);
      this.sortedZonesDirty = false;
    }
    for (const zone of this.sortedZones) {
      zone.tick();
    }
  }
}
