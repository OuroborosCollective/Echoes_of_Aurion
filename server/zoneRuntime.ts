import type WebSocket from "ws";
import { ZONE_MAX_PRESENCES, ZONE_PROTOCOL_VERSION } from "@shared/zonePresenceContract";
import { ZONE_COMBAT_CONTRACT_VERSION, ZONE_COMBAT_MAX_STAMINA, type ConfirmedZoneCombatant, type ConfirmedZoneCombatEvent } from "@shared/zoneCombatContract";
import { AX1_BLADE_SKILL_SOURCE_REVISION, ax1BladeSkillById, type Ax1BladeSkillId } from "@shared/ax1BladeSkillProtocol";
import {
  AURION_ACTIVE_CAUSAL_TICK_SCHEMA,
  AURION_CAUSAL_TICK_SCHEMA_V1,
  AURION_CAUSAL_TICK_SCHEMA_V2,
  AURION_ZONE_RULESET_VERSION,
  computeCausalStageReceipt,
  computeReceiptHash,
  type AurionCausalStageName,
  type AurionCausalStageReceipt,
  type AurionCausalTickReceipt,
  type AurionCausalTickReceiptUnsigned,
} from "../shared/aurionCausalTickContract";
import { type AurionZoneIntent, orderCanonicalZoneIntents, hashCanonicalIntents } from "../shared/aurionZoneIntentContract";
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
import { computeRngRootHash, resolveAddressableRandomU32, type RngEventRecord } from "./determinism/aurionAddressableRandom";
import { globalTickRecorder } from "./causality/tickRecorder";
import { globalCausalPersistence } from "./causality/persistence";
import { activeProvenance } from "./aurionProvenance";
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
import { reduceCombatDelta, resolveCombatDelta, type CombatEntropy } from "./wasdCombatDeltaProtocol";
import { WASD_GAMEPLAY_SOURCE_REVISION } from "./wasdAREDeterminism";
import { regenerateWasdStamina, WASD_MAX_STAMINA } from "./wasdStaminaProtocol";
import { integrateWasdZoneMovement } from "./wasdZoneMovementProtocol";
import { WASD_DEFAULT_ZONE_COMBAT_PROFILE, validWasdZoneCombatProfile, type WasdZoneCombatProfile } from "./wasdCombatProfileProtocol";
import { resolveReturnStoneRevival } from "./returnStoneRevival";
import { GLOBAL_WORLD_ID } from "../shared/worldIdentity";

// Evidence persistence is observational. The recorder captures synchronously in
// memory and drains MariaDB writes outside the deterministic authority hot path.
globalTickRecorder.setPersistenceAdapter(globalCausalPersistence);

export type ZoneCombatProfile = WasdZoneCombatProfile;
export const DEFAULT_ZONE_COMBAT_PROFILE: ZoneCombatProfile = WASD_DEFAULT_ZONE_COMBAT_PROFILE;

const WORLD_ID = GLOBAL_WORLD_ID;
const WORLD_SEED_DIGEST = canonicalSha256({ worldId: WORLD_ID, seedContract: "aurion.world.seed.v1" });

type PresencePeer = {
  connectionId: string;
  userId: number;
  socket: WebSocket;
  /** Last movement vector actually accepted by an authoritative tick. */
  input: ZoneMove["input"];
  /** Highest client sequence applied by authority. */
  lastAcceptedClientSeq: number;
  /** Transport-only replay/duplicate admission watermark; never canonical truth. */
  lastReceivedClientSeq: number;
  position: ZonePosition;
  combatLevel: number;
  health: number;
  maxHealth: number;
  stamina: number;
  weaponBonus: number;
  weaponTrack: WasdZoneCombatProfile["weaponTrack"];
  skillCooldownUntilTick: Map<Ax1BladeSkillId, number>;
  lastCombatSequence: number;
  presence: ZonePresence;
};

type AttackResult = "accepted" | "stale" | "missing" | "invalid_target" | "invalid_skill" | "cooldown" | "out_of_range" | "dead";
type CombatResolution = { result: AttackResult; event?: ConfirmedZoneCombatEvent; rngEvents: RngEventRecord[] };

function serialize(payload: ZoneServerMessage) { return JSON.stringify(payload); }
function compareBinary(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

/** Aurion-owned runtime entry point using the conserved historical donor movement formula. */
export function integrateZoneMovement(position: ZonePosition, input: ZoneMove["input"]): ZonePosition {
  return integrateWasdZoneMovement(position, input, (from, desired) => worldNatureCollision.resolve(from, desired));
}

/**
 * Sole authoritative zone state machine. Network handlers admit and enqueue
 * intents only; canonical mutation occurs inside tick(). WASD/AX1 identifiers
 * below are donor provenance, not external runtime authorities.
 */
export class AuthoritativeMovementZone {
  private readonly peers = new Map<string, PresencePeer>();
  private readonly peersByEntityId = new Map<string, PresencePeer>();
  private readonly mobRuntime = new ZoneMobRuntime();
  private readonly resourceRuntime = new ZoneResourceRuntime();
  private snapshotSeq = 0;
  private tickNumber = 0;
  /** Last emitted combat sequence. Sequence format remains tick*1000+ordinal for return-stone compatibility. */
  private combatSequence = 0;
  private inputAcknowledgementPending = false;
  private movedLastTick = false;
  private sortedPeers: PresencePeer[] = [];
  private sortedPeersByEntityId: PresencePeer[] = [];
  // ⚡ Bolt: Cache array and objects to avoid GC overhead from allocations per tick
  private sortedPresences: ZonePresence[] = [];
  private sortedPeersDirty = false;
  private pendingIntents: AurionZoneIntent[] = [];
  private arrivalSequence = 0;
  private previousReceiptHash: string | null = null;
  private lastReceipt: AurionCausalTickReceipt | null = null;
  private questSummaries = new Map<string, CanonicalQuestSummary>();
  private questSummariesDirty = false;
  private cachedQuestSummaries: CanonicalQuestSummary[] = [];

  /** Replay disables persistence and transport projection. */
  public isReplay = false;
  /** Replay reproduces the source revision carried by the recorded receipt. */
  public sourceRevisionOverride: string | null = null;
  /**
   * Replay/test-only schema selection. Live default remains v1 until B3/0049
   * has physically persisted the v2 stage envelope.
   */
  public receiptSchemaOverride:
    | typeof AURION_CAUSAL_TICK_SCHEMA_V1
    | typeof AURION_CAUSAL_TICK_SCHEMA_V2
    | null = null;

  constructor(readonly zoneId: ZoneId) {}

  enqueueIntent(intent: AurionZoneIntent): void { this.pendingIntents.push(intent); }
  getPendingIntents(): readonly AurionZoneIntent[] { return this.pendingIntents; }
  getLatestReceipt(): AurionCausalTickReceipt | null { return this.lastReceipt; }
  getTickNumber(): number { return this.tickNumber; }
  getCombatSequence(): number { return this.combatSequence; }

  getCanonicalZoneState(): CanonicalZoneState {
    this.refreshPeerOrder();
    const players: CanonicalPlayerState[] = this.sortedPeersByEntityId.map(peer => {
      const skillCooldowns: Record<string, number> = {};
      for (const [skillId, tick] of peer.skillCooldownUntilTick) {
        skillCooldowns[skillId] = tick;
      }
      return {
        entityId: `player:${peer.userId}`,
        userId: peer.userId,
        x: peer.position.x,
        z: peer.position.z,
        inputX: peer.input.x,
        inputZ: peer.input.z,
        health: peer.health,
        maxHealth: peer.maxHealth,
        stamina: peer.stamina,
        combatLevel: peer.combatLevel,
        weaponBonus: peer.weaponBonus,
        weaponTrack: peer.weaponTrack,
        lastAcceptedClientSeq: peer.lastAcceptedClientSeq,
        lastCombatSequence: peer.lastCombatSequence,
        skillCooldowns,
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
      stamina: mob.stamina,
      state: mob.state,
      targetEntityId: mob.targetEntityId,
      idleUntilTick: mob.idleUntilTick,
      patrolIndex: mob.patrolIndex,
      nextAttackTick: mob.nextAttackTick,
    }));
    const resourceSnapshot = this.resourceRuntime.snapshot(this.tickNumber);
    const resources: CanonicalResourceState[] = resourceSnapshot.nodes.map(node => ({
      nodeId: node.nodeId,
      resourceType: "ecology_node",
      state: node.depleted ? "depleted" : "ready",
      respawnTick: node.respawnAtTick ?? 0,
      remainingGathers: node.remaining,
    }));
    return sortCanonicalZoneState({
      schema: "aurion.zone.state.v1",
      worldId: WORLD_ID,
      zoneId: this.zoneId,
      tick: this.tickNumber,
      ruleset: AURION_ZONE_RULESET_VERSION,
      combatSequence: this.combatSequence,
      players,
      mobs,
      resources,
      questSummaries: this.getCachedQuestSummaries(),
    });
  }

  private getCachedQuestSummaries(): CanonicalQuestSummary[] {
    if (this.questSummariesDirty) {
      this.cachedQuestSummaries = [];
      for (const quest of this.questSummaries.values()) {
        this.cachedQuestSummaries.push({ ...quest });
      }
      this.questSummariesDirty = false;
    }
    return this.cachedQuestSummaries;
  }

  restoreFromCanonicalState(state: CanonicalZoneState, previousReceiptHash?: string | null): void {
    if (state.zoneId !== this.zoneId) throw new Error("AURION_REPLAY_ZONE_MISMATCH");
    if (state.worldId !== WORLD_ID) throw new Error("AURION_REPLAY_WORLD_MISMATCH");
    this.tickNumber = state.tick;
    this.combatSequence = state.combatSequence;
    if (previousReceiptHash !== undefined) this.previousReceiptHash = previousReceiptHash;
    this.peers.clear();
    this.peersByEntityId.clear();
    this.pendingIntents = [];
    this.arrivalSequence = 0;

    const dummySocket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as unknown as WebSocket;
    for (const player of state.players) {
      const connectionId = `restored_conn_${player.userId}`;
      const cooldowns = new Map<Ax1BladeSkillId, number>();
      for (const [skillId, tick] of Object.entries(player.skillCooldowns || {})) cooldowns.set(skillId as Ax1BladeSkillId, tick);
      const peer: PresencePeer = {
        connectionId,
        userId: player.userId,
        socket: dummySocket,
        input: { x: player.inputX, z: player.inputZ },
        lastAcceptedClientSeq: player.lastAcceptedClientSeq,
        lastReceivedClientSeq: player.lastAcceptedClientSeq,
        position: { x: player.x, z: player.z },
        combatLevel: player.combatLevel,
        health: player.health,
        maxHealth: player.maxHealth,
        stamina: player.stamina,
        weaponBonus: player.weaponBonus,
        weaponTrack: player.weaponTrack as WasdZoneCombatProfile["weaponTrack"],
        skillCooldownUntilTick: cooldowns,
        lastCombatSequence: player.lastCombatSequence,
        presence: { entityId: `player:${player.userId}`, userId: player.userId, position: { x: player.x, z: player.z }, lastAcceptedClientSeq: player.lastAcceptedClientSeq },
      };
      this.peers.set(connectionId, peer);
      this.peersByEntityId.set(player.entityId, peer);
    }
    this.sortedPeersDirty = true;
    for (const mob of state.mobs) this.mobRuntime.restoreCanonicalState(mob);
    this.resourceRuntime.restoreCanonicalStates(state.resources);
    this.questSummaries.clear();
    for (const quest of state.questSummaries || []) this.questSummaries.set(`${quest.userId}:${quest.questId}`, { ...quest });
    this.questSummariesDirty = true;
  }

  join(values: { userId: number; socket: WebSocket; combatProfile?: ZoneCombatProfile }): ZoneWelcome {
    if (!Number.isSafeInteger(values.userId) || values.userId < 1) throw new Error("ZONE_USER_INVALID");
    const profile = values.combatProfile ?? DEFAULT_ZONE_COMBAT_PROFILE;
    if (!validWasdZoneCombatProfile(profile)) throw new Error("ZONE_COMBAT_PROFILE_INVALID");
    const entityId = `player:${values.userId}`;
    const previous = this.peersByEntityId.get(entityId);
    if (!previous && this.peers.size >= ZONE_MAX_PRESENCES) throw new Error("ZONE_CAPACITY_REACHED");
    if (previous) {
      this.peers.delete(previous.connectionId);
      this.peersByEntityId.delete(entityId);
      previous.socket.close(1000, "superseded by authenticated reconnect");
    }
    const connectionId = makeZoneConnectionId();
    const peer: PresencePeer = {
      connectionId,
      userId: values.userId,
      socket: values.socket,
      input: { x: 0, z: 0 },
      lastAcceptedClientSeq: 0,
      lastReceivedClientSeq: 0,
      position: { x: 0, z: 0 },
      combatLevel: profile.combatLevel,
      health: profile.maxHealth,
      maxHealth: profile.maxHealth,
      stamina: WASD_MAX_STAMINA,
      weaponBonus: profile.weaponBonus,
      weaponTrack: profile.weaponTrack,
      skillCooldownUntilTick: new Map<Ax1BladeSkillId, number>(),
      lastCombatSequence: 0,
      presence: { entityId, userId: values.userId, position: { x: 0, z: 0 }, lastAcceptedClientSeq: 0 },
    };
    this.peers.set(connectionId, peer);
    this.peersByEntityId.set(entityId, peer);
    this.sortedPeersDirty = true;
    const welcome: ZoneWelcome = {
      type: "welcome",
      protocolVersion: ZONE_PROTOCOL_VERSION,
      connectionId,
      selfEntityId: entityId,
      zoneId: this.zoneId,
      snapshotSeq: ++this.snapshotSeq,
      tick: this.tickNumber,
      presences: this.presences(),
      mobs: this.mobRuntime.snapshot(),
      combatants: this.combatants(),
      resources: this.resourceRuntime.snapshot(this.tickNumber),
    };
    if (!this.isReplay) this.broadcastSnapshot();
    return welcome;
  }

  leave(connectionId: string): void {
    const peer = this.peers.get(connectionId);
    if (!peer) return;
    this.peers.delete(connectionId);
    this.peersByEntityId.delete(`player:${peer.userId}`);
    this.sortedPeersDirty = true;
    if (!this.isReplay) this.broadcastSnapshot();
  }

  connectionIdForUser(userId: number): string | undefined {
    return this.peersByEntityId.get(`player:${userId}`)?.connectionId;
  }

  nextClientSequenceForUser(userId: number): number {
    const peer = this.peersByEntityId.get(`player:${userId}`);
    if (!peer) throw new Error("ZONE_USER_NOT_CONNECTED");
    return peer.lastReceivedClientSeq + 1;
  }

  nextArrivalSequence(): number {
    return this.arrivalSequence + 1;
  }

  positionForConnection(connectionId: string): ZonePosition | undefined {
    const position = this.peers.get(connectionId)?.position;
    return position ? { ...position } : undefined;
  }
  mobSnapshot() { return this.mobRuntime.snapshot(); }
  combatSnapshot() { return this.combatants(); }
  resourceSnapshot() { return this.resourceRuntime.snapshot(this.tickNumber); }

  /** Development-only reset of the isolated authoritative fixture runtime. */
  resetDevelopmentFixture(): void {
    if (process.env.NODE_ENV === "production") throw new Error("ZONE_FIXTURE_PRODUCTION_FORBIDDEN");
    this.peers.clear();
    this.peersByEntityId.clear();
    this.pendingIntents = [];
    this.arrivalSequence = 0;
    this.tickNumber = 0;
    this.snapshotSeq = 0;
    this.combatSequence = 0;
    this.inputAcknowledgementPending = false;
    this.movedLastTick = false;
    this.previousReceiptHash = null;
    this.lastReceipt = null;
    this.questSummaries.clear();
    this.cachedQuestSummaries = [];
    this.questSummariesDirty = true;
    this.sortedPeers = [];
    this.sortedPeersByEntityId = [];
    this.sortedPeersDirty = true;
    this.mobRuntime.resetDevelopmentFixture(this.tickNumber);
    this.resourceRuntime.resetDevelopmentFixture();
  }

  /** Development-only bounded encounter fixture selection over canonical mobs. */
  seedDevelopmentEncounter(fixtureType: "starter_encounter" | "boss_encounter" | "npc_dialogue_fixture"): readonly string[] {
    return this.mobRuntime.seedDevelopmentEncounter(fixtureType);
  }

  private admitSequence(peer: PresencePeer, clientSeq: number): boolean {
    if (!Number.isSafeInteger(clientSeq) || clientSeq <= peer.lastReceivedClientSeq) return false;
    peer.lastReceivedClientSeq = clientSeq;
    return true;
  }

  submitMovement(connectionId: string, move: ZoneMove): "accepted" | "stale" | "missing" {
    const peer = this.peers.get(connectionId);
    if (!peer) return "missing";
    if (!this.admitSequence(peer, move.clientSeq)) return "stale";
    this.inputAcknowledgementPending = true;
    this.pendingIntents.push({ type: "move", connectionId, entityId: `player:${peer.userId}`, clientSeq: move.clientSeq, arrivalSeq: ++this.arrivalSequence, input: { x: move.input.x, z: move.input.z } });
    return "accepted";
  }

  submitAttack(connectionId: string, attack: ZoneAttack): AttackResult {
    const peer = this.peers.get(connectionId);
    if (!peer) return "missing";
    if (attack.clientSeq <= peer.lastReceivedClientSeq) return "stale";
    if (peer.health <= 0) return "dead";
    const mob = this.mobRuntime.stateFor(attack.targetEntityId);
    if (!mob || mob.health <= 0) return "invalid_target";
    if (mobDistance(peer.position, mob.position) > AX1_PLAYER_BASIC_MELEE_RANGE_FIXED) return "out_of_range";
    if (!this.admitSequence(peer, attack.clientSeq)) return "stale";
    this.inputAcknowledgementPending = true;
    this.pendingIntents.push({ type: "attack", connectionId, entityId: `player:${peer.userId}`, clientSeq: attack.clientSeq, arrivalSeq: ++this.arrivalSequence, targetEntityId: attack.targetEntityId });
    return "accepted";
  }

  submitSkill(connectionId: string, skill: ZoneSkill): AttackResult {
    const peer = this.peers.get(connectionId);
    if (!peer) return "missing";
    if (skill.clientSeq <= peer.lastReceivedClientSeq) return "stale";
    if (peer.health <= 0) return "dead";
    const definition = ax1BladeSkillById(skill.skillId);
    if (peer.weaponTrack !== "blade" || !definition || definition.skillId !== "k_strike" || definition.kind !== "melee") return "invalid_skill";
    if (this.tickNumber < (peer.skillCooldownUntilTick.get(skill.skillId) ?? 0)) return "cooldown";
    const mob = this.mobRuntime.stateFor(skill.targetEntityId);
    if (!mob || mob.health <= 0) return "invalid_target";
    if (mobDistance(peer.position, mob.position) > definition.rangeFixed) return "out_of_range";
    if (!this.admitSequence(peer, skill.clientSeq)) return "stale";
    this.inputAcknowledgementPending = true;
    this.pendingIntents.push({ type: "skill", connectionId, entityId: `player:${peer.userId}`, clientSeq: skill.clientSeq, arrivalSeq: ++this.arrivalSequence, skillId: skill.skillId, targetEntityId: skill.targetEntityId });
    return "accepted";
  }

  private combatEntropy(entityId: string, targetEntityId: string, sequence: number): { entropy: CombatEntropy; events: RngEventRecord[] } {
    const systemId = "aurion.zone.combat";
    const eventId = `${this.zoneId}:${entityId}->${targetEntityId}:seq:${sequence}`;
    const address = (purpose: string, drawIndex: number) => ({
      worldSeedDigest: WORLD_SEED_DIGEST,
      rulesetVersion: AURION_ZONE_RULESET_VERSION,
      tick: this.tickNumber,
      systemId,
      entityId,
      eventId,
      purpose,
      drawIndex,
    });
    const entropy: CombatEntropy = {
      hitU32: resolveAddressableRandomU32(address("combat.hit", 0)),
      critU32: resolveAddressableRandomU32(address("combat.crit", 1)),
      damageU32: resolveAddressableRandomU32(address("combat.damage", 2)),
    };
    return {
      entropy,
      events: [
        { systemId, entityId, eventId, purpose: "combat.hit", drawIndex: 0, u32: entropy.hitU32 },
        { systemId, entityId, eventId, purpose: "combat.crit", drawIndex: 1, u32: entropy.critU32 },
        { systemId, entityId, eventId, purpose: "combat.damage", drawIndex: 2, u32: entropy.damageU32 },
      ],
    };
  }

  private resolvePlayerMelee(peer: PresencePeer, targetEntityId: string, skillId: Ax1BladeSkillId | null, rangeFixed: number, actionIndex: number): CombatResolution {
    if (peer.health <= 0) return { result: "dead", rngEvents: [] };
    const mob = this.mobRuntime.stateFor(targetEntityId);
    if (!mob || mob.health <= 0) return { result: "invalid_target", rngEvents: [] };
    if (mobDistance(peer.position, mob.position) > rangeFixed) return { result: "out_of_range", rngEvents: [] };
    const sequence = this.tickNumber * 1000 + actionIndex;
    this.combatSequence = Math.max(this.combatSequence, sequence);
    const attacker = { id: `player:${peer.userId}`, stamina: peer.stamina, skills: { combat: { level: peer.combatLevel } } };
    const defender = { id: mob.definition.entityId, health: mob.health, skills: { combat: { level: mob.definition.level } } };
    const entropyBundle = this.combatEntropy(attacker.id, defender.id, sequence);
    const delta = resolveCombatDelta("melee", attacker, defender, { tick: this.tickNumber, sequence, weaponBonus: peer.weaponBonus, entropy: entropyBundle.entropy });
    const patch = reduceCombatDelta(attacker, defender, delta);
    peer.stamina = patch.attacker.stamina;
    peer.lastCombatSequence = sequence;
    this.mobRuntime.applyCombatState(mob.definition.entityId, { health: patch.defender.health });
    return { result: "accepted", event: this.combatEvent(delta, peer.stamina, patch.defender.health, skillId), rngEvents: entropyBundle.events };
  }

  tick(): boolean {
    const preState = this.getCanonicalZoneState();
    const preStateHash = hashCanonicalZoneState(preState);
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

    const stageReceipts: AurionCausalStageReceipt[] = [];
    let previousStageStateHash = preStateHash;
    let stageOrdinal = 0;
    const captureAuthorityStage = (stageName: AurionCausalStageName): void => {
      const canonicalStateHash = hashCanonicalZoneState(this.getCanonicalZoneState());
      stageOrdinal += 1;
      const stage = computeCausalStageReceipt({
        stageName,
        stageOrdinal,
        tick: this.tickNumber,
        previousCanonicalStateHash: previousStageStateHash,
        orderedIntentHash,
        canonicalStateHash,
      });
      stageReceipts.push(stage);
      previousStageStateHash = canonicalStateHash;
    };

    // 01 membership/order is stable after refreshPeerOrder().
    // 01.5 deterministic return-stone revival. Visual GLB availability is not an input.
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
    captureAuthorityStage("MEMBERSHIP_REVIVAL");

    // 02 movement intents become canonical only here.
    for (const intent of intentsToProcess) {
      if (intent.type !== "move") continue;
      const peer = this.peers.get(intent.connectionId) ?? this.peersByEntityId.get(intent.entityId);
      if (!peer || peer.health <= 0 || intent.clientSeq <= peer.lastAcceptedClientSeq) continue;
      peer.input = { ...intent.input };
      peer.lastAcceptedClientSeq = intent.clientSeq;
    }
    for (const peer of this.sortedPeers) {
      if ((peer.input.x === 0 && peer.input.z === 0) || peer.health <= 0) continue;
      const next = integrateZoneMovement(peer.position, peer.input);
      if (next.x === peer.position.x && next.z === peer.position.z) continue;
      peer.position = next;
      changed = true;
    }
    captureAuthorityStage("MOVEMENT");

    // 03 player actions and quest summaries.
    for (const intent of intentsToProcess) {
      if (intent.type === "move") continue;
      const peer = this.peersByEntityId.get(intent.entityId);
      if (!peer || intent.clientSeq <= peer.lastAcceptedClientSeq) continue;
      peer.lastAcceptedClientSeq = intent.clientSeq;

      if (intent.type === "attack") {
        const resolution = this.resolvePlayerMelee(peer, intent.targetEntityId, null, AX1_PLAYER_BASIC_MELEE_RANGE_FIXED, ++actionIndex);
        if (resolution.result === "accepted" && resolution.event) {
          changed = true;
          combatEvents.push(resolution.event);
          rngEvents.push(...resolution.rngEvents);
        }
      } else if (intent.type === "skill") {
        const definition = ax1BladeSkillById(intent.skillId as Ax1BladeSkillId);
        if (!definition || peer.weaponTrack !== "blade") continue;
        const skillId = intent.skillId as Ax1BladeSkillId;
        if (this.tickNumber < (peer.skillCooldownUntilTick.get(skillId) ?? 0)) continue;
        const resolution = this.resolvePlayerMelee(peer, intent.targetEntityId, skillId, definition.rangeFixed, ++actionIndex);
        if (resolution.result === "accepted" && resolution.event) {
          peer.skillCooldownUntilTick.set(skillId, this.tickNumber + Math.max(1, Math.ceil(definition.cooldownMs / ZONE_TICK_MS)));
          changed = true;
          combatEvents.push(resolution.event);
          rngEvents.push(...resolution.rngEvents);
        }
      } else if (intent.type === "quest_accept" && peer.health > 0) {
        const key = `${peer.userId}:${intent.questId}`;
        if (!this.questSummaries.has(key)) {
          this.questSummaries.set(key, { userId: peer.userId, questId: intent.questId, status: "accepted", updatedAtTick: this.tickNumber });
          this.questSummariesDirty = true;
          changed = true;
        }
      } else if (intent.type === "quest_hand_in" && peer.health > 0) {
        const key = `${peer.userId}:${intent.questId}`;
        const current = this.questSummaries.get(key);
        if (current?.status === "accepted") {
          this.questSummaries.set(key, { ...current, status: "completed", updatedAtTick: this.tickNumber });
          this.questSummariesDirty = true;
          changed = true;
        }
      }
    }
    captureAuthorityStage("PLAYER_ACTION");

    // 04 resource lifecycle.
    const resourcesChanged = this.resourceRuntime.tick(this.tickNumber);
    captureAuthorityStage("RESOURCE");
    // 05 mob FSM.
    const mobsChanged = this.mobRuntime.tick(this.presences(), this.tickNumber);
    captureAuthorityStage("MOB_FSM");
    // 06 mob combat.
    const mobCombat = this.resolveMobAttacks(++actionIndex);
    if (mobCombat.changed) changed = true;
    combatEvents.push(...mobCombat.events);
    rngEvents.push(...mobCombat.rngEvents);
    captureAuthorityStage("MOB_COMBAT");
    // 07 regeneration.
    for (const peer of this.sortedPeers) {
      if (peer.health <= 0) continue;
      const next = regenerateWasdStamina(peer.stamina);
      if (next !== peer.stamina) { peer.stamina = next; changed = true; }
    }
    captureAuthorityStage("REGENERATION");

    // 08 receipt creation; durable persistence is an observer queue.
    const postState = this.getCanonicalZoneState();
    const postStateHash = hashCanonicalZoneState(postState);
    const transitionHash = canonicalSha256({
      schema: "aurion.transition.summary.v1",
      tick: this.tickNumber,
      changed: changed || resourcesChanged || mobsChanged,
      intentsCount: intentsToProcess.length,
      combatSequence: this.combatSequence,
      revivedEntityIds,
    });
    const receiptSchema = this.receiptSchemaOverride ?? AURION_ACTIVE_CAUSAL_TICK_SCHEMA;
    const commonReceipt = {
      worldId: WORLD_ID,
      zoneId: this.zoneId,
      tick: this.tickNumber,
      sourceRevision: this.sourceRevisionOverride ?? activeProvenance.sourceRevision,
      rulesetVersion: AURION_ZONE_RULESET_VERSION,
      previousReceiptHash: this.previousReceiptHash,
      preStateHash,
      orderedIntentHash,
      transitionHash,
      rngRootHash: computeRngRootHash(rngEvents),
      postStateHash,
    };
    const receiptUnsigned: AurionCausalTickReceiptUnsigned =
      receiptSchema === AURION_CAUSAL_TICK_SCHEMA_V2
        ? { schema: AURION_CAUSAL_TICK_SCHEMA_V2, ...commonReceipt, stages: Object.freeze([...stageReceipts]) }
        : { schema: AURION_CAUSAL_TICK_SCHEMA_V1, ...commonReceipt };
    const receipt: AurionCausalTickReceipt = {
      ...receiptUnsigned,
      receiptHash: computeReceiptHash(receiptUnsigned),
    } as AurionCausalTickReceipt;
    this.previousReceiptHash = receipt.receiptHash;
    this.lastReceipt = receipt;
    if (!this.isReplay) globalTickRecorder.enqueueTick(receipt, postState, preState, intentsToProcess);

    // 09 projection/transport. Replay emits no socket or persistence side effects.
    if (!this.isReplay) {
      for (const event of combatEvents) this.broadcastCombat(event);
      if (changed || resourcesChanged || mobsChanged || this.movedLastTick || this.inputAcknowledgementPending) this.broadcastSnapshot();
    }
    this.movedLastTick = changed;
    this.inputAcknowledgementPending = false;
    return changed || resourcesChanged || mobsChanged;
  }

  private resolveMobAttacks(actionIndex: number): { changed: boolean; events: ConfirmedZoneCombatEvent[]; rngEvents: RngEventRecord[] } {
    let changed = false;
    const events: ConfirmedZoneCombatEvent[] = [];
    const rngEvents: RngEventRecord[] = [];
    let localActionIndex = actionIndex;
    for (const mob of this.mobRuntime.orderedStates()) {
      if (mob.state !== "combat" || mob.health <= 0 || !mob.targetEntityId || this.tickNumber < mob.nextAttackTick) continue;
      const peer = this.peersByEntityId.get(mob.targetEntityId);
      if (!peer || peer.health <= 0) continue;
      if (mobDistance(mob.position, peer.position) > mob.definition.attackRangeFixed) continue;
      const sequence = this.tickNumber * 1000 + (++localActionIndex);
      this.combatSequence = Math.max(this.combatSequence, sequence);
      const attacker = { id: mob.definition.entityId, stamina: mob.stamina, skills: { combat: { level: mob.definition.level } } };
      const defender = { id: `player:${peer.userId}`, health: peer.health, skills: { combat: { level: peer.combatLevel } } };
      const entropyBundle = this.combatEntropy(attacker.id, defender.id, sequence);
      const delta = resolveCombatDelta("melee", attacker, defender, { tick: this.tickNumber, sequence, weaponBonus: 0, entropy: entropyBundle.entropy });
      const patch = reduceCombatDelta(attacker, defender, delta);
      this.mobRuntime.applyCombatState(mob.definition.entityId, { health: mob.health, stamina: patch.attacker.stamina, nextAttackTick: this.tickNumber + mob.definition.attackCooldownTicks });
      peer.health = patch.defender.health;
      peer.lastCombatSequence = sequence;
      if (peer.health === 0) peer.input = { x: 0, z: 0 };
      events.push(this.combatEvent(delta, patch.attacker.stamina, peer.health, null));
      rngEvents.push(...entropyBundle.events);
      changed = true;
    }
    return { changed, events, rngEvents };
  }

  private combatEvent(delta: ReturnType<typeof resolveCombatDelta>, attackerStamina: number, defenderHealth: number, skillId: Ax1BladeSkillId | null): ConfirmedZoneCombatEvent {
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
    for (const peer of this.peers.values()) if (peer.socket.readyState === peer.socket.OPEN) peer.socket.send(serialized);
  }

  private refreshPeerOrder(): void {
    if (!this.sortedPeersDirty) return;
    this.sortedPeers = Array.from(this.peers.values()).sort((a, b) => compareBinary(a.connectionId, b.connectionId));
    this.sortedPeersByEntityId = Array.from(this.peers.values()).sort((a, b) => compareBinary(`player:${a.userId}`, `player:${b.userId}`));
    this.sortedPresences = this.sortedPeersByEntityId.map(peer => peer.presence);
    this.sortedPeersDirty = false;
  }

  private presences(): ZonePresence[] {
    this.refreshPeerOrder();
    // ⚡ Bolt: Iterate over cached objects to avoid creating new ZonePresence objects on every tick
    for (let i = 0; i < this.sortedPeersByEntityId.length; i++) {
      const peer = this.sortedPeersByEntityId[i];
      peer.presence.position = peer.position;
      peer.presence.lastAcceptedClientSeq = peer.lastAcceptedClientSeq;
    }
    return this.sortedPresences;
  }

  private combatants(): readonly ConfirmedZoneCombatant[] {
    this.refreshPeerOrder();
    const out: ConfirmedZoneCombatant[] = [];
    let peerIndex = 0;
    const mobs = this.mobRuntime.orderedStates();
    let mobIndex = 0;
    while (peerIndex < this.sortedPeersByEntityId.length || mobIndex < mobs.length) {
      const peer = this.sortedPeersByEntityId[peerIndex];
      const mob = mobs[mobIndex];
      const peerId = peer ? `player:${peer.userId}` : null;
      const mobId = mob ? mob.definition.entityId : null;
      if (peerId && (!mobId || compareBinary(peerId, mobId) < 0)) {
        out.push(Object.freeze({ entityId: peerId, health: peer.health, maxHealth: peer.maxHealth, stamina: peer.stamina, maxStamina: ZONE_COMBAT_MAX_STAMINA, alive: peer.health > 0, combatLevel: peer.combatLevel, lastCombatSequence: peer.lastCombatSequence }));
        peerIndex += 1;
      } else if (mobId) {
        out.push(Object.freeze({ entityId: mobId, health: mob.health, maxHealth: mob.maxHealth, stamina: mob.stamina, maxStamina: ZONE_COMBAT_MAX_STAMINA, alive: mob.health > 0, combatLevel: mob.definition.level, lastCombatSequence: 0 }));
        mobIndex += 1;
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
    for (const peer of this.peers.values()) if (peer.socket.readyState === peer.socket.OPEN) peer.socket.send(serialized);
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
      this.sortedZones = Array.from(this.zones.entries()).sort(([left], [right]) => compareBinary(left, right)).map(([, zone]) => zone);
      this.sortedZonesDirty = false;
    }
    for (const zone of this.sortedZones) zone.tick();
  }
}

export const globalZoneRegistry = new ZoneRegistry();
