import type WebSocket from "ws";
import { AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS } from "./autonomousNpcLifeRuntime";
import { AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID } from "./aurionProductionProbeStore";
import { DEFAULT_ZONE_COMBAT_PROFILE, type AuthoritativeMovementZone } from "./zoneRuntime";
import { ZONE_TICK_MS, type ZoneSnapshot, type ZoneWelcome } from "./zoneProtocol";
import { ZONE_PROTOCOL_VERSION, validConfirmedPresences } from "../shared/zonePresenceContract";
import { deadlineAfter, operationalNow } from "../shared/operationalClock";
import { orderCanonicalZoneIntents, sanitizeIntentForHash } from "../shared/aurionZoneIntentContract";
import { requireProbePersistenceEvidence } from "../shared/aurionProductionProbeEvidence";
import type { RecordedTickEntry } from "./causality/tickRecorder";

type ProbeHealth = Readonly<{
  revision: string;
  npcLife?: Readonly<{
    status?: string;
    lastGatewayTick?: number | null;
    lastResolutionIndex?: number | null;
    decisionHash?: string | null;
    npcGuilds?: Readonly<{ enabled?: boolean }> | null;
  }>;
  [key: string]: unknown;
}>;

type ProbeTimings = Readonly<{
  handshakeTimeoutMs?: number;
  cleanupTimeoutMs?: number;
  npcAdvanceTimeoutMs?: number;
  pollIntervalMs?: number;
  persistenceTimeoutMs?: number;
}>;

type GameplaySessionDependencies = Readonly<{
  zone: AuthoritativeMovementZone;
  expectedRevision: string;
  health: () => ProbeHealth;
  readNpcGuildOverview: () => Promise<unknown>;
  sampleAssurance: () => Promise<unknown>;
  readPersistedTicks: (zoneId: string, fromTick: number, toTick: number) => Promise<RecordedTickEntry[]>;
  now?: () => number;
  timings?: ProbeTimings;
}>;

const DEFAULT_HANDSHAKE_TIMEOUT_MS = 10_000;
const DEFAULT_CLEANUP_TIMEOUT_MS = 10_000;
const DEFAULT_NPC_ADVANCE_TIMEOUT_MS = AUTONOMOUS_NPC_LIFE_INTERVAL_TICKS * ZONE_TICK_MS + 15_000;
const DEFAULT_POLL_INTERVAL_MS = 25;

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function boundedReadback<T>(work: () => Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work(), new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("PROBE_PERSISTENCE_TIMEOUT")), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function waitFor<T>(read: () => T | undefined, timeoutMs: number, pollIntervalMs: number, now: () => number, code: string): Promise<T> {
  const deadline = deadlineAfter(now(), timeoutMs);
  for (;;) {
    const value = read();
    if (value !== undefined) return value;
    const current = now();
    if (current >= deadline) throw new Error(code);
    await wait(Math.min(pollIntervalMs, Math.max(1, deadline - current)));
  }
}

function assertCurrentRevision(health: ProbeHealth, expectedRevision: string): ProbeHealth {
  if (health.revision !== expectedRevision) throw new Error("PROBE_RUNTIME_REVISION_MISMATCH");
  return health;
}

function hasConfirmedNpcAdvance(before: ProbeHealth, after: ProbeHealth): boolean {
  const prior = before.npcLife;
  const current = after.npcLife;
  return current?.status === "confirmed"
    && Number.isSafeInteger(current.lastGatewayTick)
    && current.lastGatewayTick! > (prior?.lastGatewayTick ?? -1)
    && Number.isSafeInteger(current.lastResolutionIndex)
    && current.lastResolutionIndex! > (prior?.lastResolutionIndex ?? -1)
    && /^[a-f0-9]{64}$/.test(current.decisionHash ?? "")
    && current.npcGuilds?.enabled === true;
}

function parsedMessages(messages: readonly string[]): readonly Record<string, unknown>[] {
  const parsed: Record<string, unknown>[] = [];
  for (const raw of messages) {
    try {
      const value = JSON.parse(raw);
      if (value !== null && typeof value === "object" && !Array.isArray(value)) parsed.push(value as Record<string, unknown>);
    } catch { /* A production probe never treats an unparsable transport frame as evidence. */ }
  }
  return parsed;
}

function isMatchingSnapshot(value: Record<string, unknown>, welcome: ZoneWelcome): value is ZoneSnapshot {
  return value.type === "snapshot"
    && value.zoneId === welcome.zoneId
    && Number.isSafeInteger(value.tick)
    && Number(value.tick) > welcome.tick
    && Number.isSafeInteger(value.snapshotSeq)
    && Number(value.snapshotSeq) > welcome.snapshotSeq
    && validConfirmedPresences(value.presences)
    && value.presences.some(p => p && typeof p === "object" && (p as { entityId?: unknown }).entityId === welcome.selfEntityId);
}

function isConfirmedWelcome(welcome: ZoneWelcome): boolean {
  return welcome.type === "welcome"
    && welcome.protocolVersion === ZONE_PROTOCOL_VERSION
    && Number.isSafeInteger(welcome.tick)
    && Number.isSafeInteger(welcome.snapshotSeq)
    && validConfirmedPresences(welcome.presences)
    && welcome.presences.some(presence => presence.entityId === welcome.selfEntityId);
}

function redactWelcome(welcome: ZoneWelcome) {
  const { connectionId: _connectionId, ...evidence } = welcome;
  return evidence;
}

/**
 * Performs the one explicitly effectful production probe: a short canonical
 * join, a post-tick snapshot, then a canonical leave. It never accepts a
 * browser session, issues a player ticket, writes a player profile, or submits
 * gameplay commands. The caller must already have atomically consumed the
 * dedicated gameplay-session approval.
 */
export async function runProductionGameplaySessionReadback(dependencies: GameplaySessionDependencies) {
  const { zone, expectedRevision, health, readNpcGuildOverview, sampleAssurance, readPersistedTicks } = dependencies;
  const now = dependencies.now ?? operationalNow;
  const timings = dependencies.timings ?? {};
  const handshakeTimeoutMs = timings.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;
  const cleanupTimeoutMs = timings.cleanupTimeoutMs ?? DEFAULT_CLEANUP_TIMEOUT_MS;
  const npcAdvanceTimeoutMs = timings.npcAdvanceTimeoutMs ?? DEFAULT_NPC_ADVANCE_TIMEOUT_MS;
  const pollIntervalMs = timings.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const persistenceTimeoutMs = timings.persistenceTimeoutMs ?? 10_000;
  if (![handshakeTimeoutMs, cleanupTimeoutMs, npcAdvanceTimeoutMs, pollIntervalMs, persistenceTimeoutMs].every(value => Number.isSafeInteger(value) && value > 0)) {
    throw new Error("PROBE_SESSION_TIMING_INVALID");
  }
  if (zone.connectionIdForUser(AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID)) throw new Error("PROBE_GAMEPLAY_ACTOR_ALREADY_ACTIVE");
  const healthBefore = assertCurrentRevision(health(), expectedRevision);
  const frames: string[] = [];
  const socket = {
    OPEN: 1,
    readyState: 1,
    send(frame: unknown) { if (typeof frame === "string") frames.push(frame); },
  } as unknown as WebSocket;
  let welcome: ZoneWelcome | undefined;
  let left = false;
  try {
    welcome = zone.join({ userId: AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID, socket, combatProfile: DEFAULT_ZONE_COMBAT_PROFILE });
    if (!isConfirmedWelcome(welcome)) throw new Error("PROBE_ZONE_WELCOME_INVALID");
    const snapshot = await waitFor(
      () => parsedMessages(frames).find(message => isMatchingSnapshot(message, welcome!)),
      handshakeTimeoutMs,
      pollIntervalMs,
      now,
      "PROBE_ZONE_HANDSHAKE_TIMEOUT",
    );
    const cleanupTick = zone.getTickNumber();
    zone.leave(welcome.connectionId);
    left = true;
    await waitFor(
      () => zone.getTickNumber() > cleanupTick ? true : undefined,
      cleanupTimeoutMs,
      pollIntervalMs,
      now,
      "PROBE_ZONE_CLEANUP_TIMEOUT",
    );
    const joinTick = welcome.tick + 1, leaveTick = cleanupTick + 1;
    const persisted = await boundedReadback(async () => {
      await zone.flushEvidencePersistence();
      return readPersistedTicks(zone.zoneId, joinTick, leaveTick);
    }, persistenceTimeoutMs);
    // Compare the independently read database chain to this session's authority
    // entries, not to an older generic assurance sample.
    for (const entry of persisted) {
      const expected = zone.recordedTick(entry.receipt.tick);
      if (!expected || expected.receipt.receiptHash !== entry.receipt.receiptHash) {
        throw new Error("PROBE_PERSISTED_SESSION_MISMATCH");
      }
    }
    const persistence = { joinTick, leaveTick, ticks: persisted.map(entry => ({
      receipt: entry.receipt,
      intents: orderCanonicalZoneIntents(entry.intents ?? []).map(sanitizeIntentForHash),
    })) };
    requireProbePersistenceEvidence(persistence, expectedRevision, zone.zoneId, welcome.tick, Number(snapshot.tick));
    const healthAfter = await waitFor(() => {
      const current = assertCurrentRevision(health(), expectedRevision);
      return hasConfirmedNpcAdvance(healthBefore, current) ? current : undefined;
    }, npcAdvanceTimeoutMs, pollIntervalMs, now, "PROBE_NPC_ADVANCE_TIMEOUT");
    const guilds = await readNpcGuildOverview();
    if (!guilds || typeof guilds !== "object" || !Number.isSafeInteger((guilds as { guildCount?: unknown }).guildCount)
      || !Array.isArray((guilds as { guilds?: unknown }).guilds)) throw new Error("PROBE_NPC_GUILD_READBACK_FAILED");
    const assurance = await sampleAssurance();
    if (!assurance || typeof assurance !== "object") throw new Error("PROBE_ASSURANCE_READBACK_FAILED");
    return Object.freeze({
      healthBefore,
      health: healthAfter,
      worldJoin: "CONFIRMED" as const,
      zoneHandshake: "CONFIRMED" as const,
      welcome: redactWelcome(welcome),
      snapshot,
      guilds,
      assurance,
      persistence,
      probeEffect: "canonical-ephemeral-join-leave" as const,
      probeActorUserId: AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID,
    });
  } finally {
    if (welcome && !left && zone.connectionIdForUser(AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID) === welcome.connectionId) {
      zone.leave(welcome.connectionId);
    }
  }
}
