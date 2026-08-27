import { and, asc, desc, eq, gt, gte, isNotNull, isNull, like, lte, or, sql } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/mysql2";
import { aurionDialogueCommandReceipts, aurionDialogueReceipts, aurionGlobalWorldEpochReceipts, aurionGlobalWorldStates, aurionWorldChunkDeltas, aurionWorldEpochReactions, aurionWorldEpochRequests, aurionWorldPresenceLeases, craftingReceipts, expeditionChatMessages, expeditionResultReceipts, expeditionTeamMembers, expeditionTeams, expeditionTeamSignals, forumReplies, forumThreads, gatewayCommands, gatewaySessions, gameplayActionReceipts, gameplayDungeonKeys, gameplayQuestProgress, gameplaySessions, glbAssetSubmissions, glbAssets, glbAssignments, guildMemberships, guilds, InsertUser, itemInstances, localCredentials, lootAffixes, lootDropReceipts, lootSetDefinitions, marketListings, marketTransactionReceipts, monetizationPlacements, partnerRequests, playerCharacterAppearances, playerProfiles, progressionLedger, seasonLeaderboardSnapshots, seasons, seasonTransitionReceipts, skillProgressionEvents, systemSaleReceipts, treasureClasses, users, weaponLoadouts, weaponMasteries, weaponMasteryReceipts, zoneConnectionTickets } from "../drizzle/schema";
import { ENV } from './_core/env';
import type { AurionCommand } from "./gatewayProtocol";
import { canChooseClass, canUseWeaponWithClass, isPlayerClass, isServerEvidenceDigest, isWeaponActionAllowed, isWeaponTrack, levelFromTotalXp, rollLootQuality, type LootAffix, type PlayerClass, type WeaponTrack } from "./endgameProtocol";
import { craftingReceiptDigest, resolveAurionCraftingPlan, resolveCraftingResolutionIndex, type CraftingAffix, type CraftingItemQuality } from "./craftingProtocol";
import { isGatewayGrantActive, isStrictlyIncreasingSequence } from "./gatewayProtocol";
import { decodeValidatedGlbBase64, normalizeSafePlacementConfiguration, USER_GLB_MAX_BYTES } from "./adminProtocol";
import { activeTeamMemberKey, assertDistinctTeammates, type ForumCategory } from "./communityProtocol";
import { assertMarketPrice, assertNotOwnListing, systemSaleValue, type MarketQuality } from "./marketProtocol";
import { storagePut } from "./storage";
import { aurionQuestline, damageForMcpAction, dungeonCompletionReward, getEncounter, getQuest, mayEnterDungeon, mcpActionFromCommand, resolveQuestState, type EncounterKey, type QuestKey } from "./gameplayProtocol";
import { buildOpenWorldSnapshot } from "./openWorldProtocol";
import { buildGlobalWorldPlan, toGlobalWorldClientDescriptor, type GlobalWorldClientDescriptor, type GlobalWorldPlan } from "./globalWorldProtocol";
import { AURION_WORLD_EPOCH_RULESET_VERSION, canonicalWorldEpochRequestKey, createWorldPresenceLease, nextWorldEpoch, type WorldPresenceLease } from "./worldPresenceProtocol";
import { createWorldChunkDelta, generateBaseWorldChunk, materializeWorldChunk, toWorldChunkDeltaOverlay, type WorldChunkCoordinate, type WorldChunkDelta, type WorldChunkDeltaKind } from "./worldChunkProtocol";
import { WORLD_CHUNK_ROAD_MAXIMUM, WORLD_CHUNK_STRUCTURE_MAXIMUM, resolveWorldChunkAction, type WorldChunkActionIntent } from "./worldChunkActionProtocol";
import { WORLD_CHUNK_STREAM_PAGE_LIMIT, orderedWorldChunkWindow, worldChunkStreamingBudget, type WorldChunkStreamingTier } from "../shared/worldChunkStreamingProtocol";
import { resolveWorldEpochReaction, type WorldEpochReaction } from "./worldEpochReactionProtocol";
import { resolveDialogueQuestIntent, type DialogueQuestActionKind, type DialogueQuestIntentResolution } from "./wasdAurionDialogueQuestIntentProtocol";
import type { DialogueInterpretation } from "./wasdAurionProtocol";
import { resolveSkillProgressionReadmodel, type AurionSkillId, type SkillProgressionEvent } from "./wasdAurionSkillProgressionProtocol";
import { createZoneTicket, digestZoneTicket, type ZoneId } from "./zoneProtocol";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

const ZONE_TICKET_TTL_MS = 60_000;

function affectedRowCount(result: unknown): number {
  const candidate = Array.isArray(result) ? result[0] : result;
  if (!candidate || typeof candidate !== "object") return 0;
  return Number((candidate as { affectedRows?: number }).affectedRows ?? 0);
}

/** Issues an opaque one-time browser authority; the raw ticket is never persisted. */
export async function issueZoneConnectionTicket(values: { userId: number; zoneId: ZoneId; clientBuild: string }) {
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  const ticket = createZoneTicket();
  const expiresAt = new Date(Date.now() + ZONE_TICKET_TTL_MS);
  await db.insert(zoneConnectionTickets).values({
    id: `zone_ticket_${randomBytes(12).toString("base64url")}`,
    userId: values.userId,
    zoneId: values.zoneId,
    ticketDigest: digestZoneTicket(ticket),
    clientBuild: values.clientBuild,
    expiresAt,
  });
  return { ticket, zoneId: values.zoneId, expiresAt };
}

/** Consumes a valid ticket exactly once before a socket is allowed to join a zone. */
export async function consumeZoneConnectionTicket(values: { ticket: string; zoneId: ZoneId }) {
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  const ticketDigest = digestZoneTicket(values.ticket);
  const now = new Date();
  return db.transaction(async tx => {
    const candidate = (await tx.select().from(zoneConnectionTickets).where(and(
      eq(zoneConnectionTickets.ticketDigest, ticketDigest),
      eq(zoneConnectionTickets.zoneId, values.zoneId),
      isNull(zoneConnectionTickets.consumedAt),
      gt(zoneConnectionTickets.expiresAt, now),
    )).limit(1))[0];
    if (!candidate) return undefined;
    const updated = await tx.update(zoneConnectionTickets).set({ consumedAt: now }).where(and(
      eq(zoneConnectionTickets.id, candidate.id),
      isNull(zoneConnectionTickets.consumedAt),
      gt(zoneConnectionTickets.expiresAt, now),
    ));
    if (affectedRowCount(updated) !== 1) return undefined;
    return { userId: candidate.userId, zoneId: candidate.zoneId as ZoneId, clientBuild: candidate.clientBuild, expiresAt: candidate.expiresAt };
  });
}

export async function recordWorldPresenceLease(values: { userId: number; connectionId: string; zoneId: ZoneId; position: { x: number; z: number }; now?: Date }): Promise<WorldPresenceLease> {
  const now = values.now ?? new Date();
  const lease = createWorldPresenceLease({ userId: values.userId, connectionId: values.connectionId, zoneId: values.zoneId, position: values.position, now });
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  await db.insert(aurionWorldPresenceLeases).values({
    connectionId: lease.connectionId,
    userId: lease.userId,
    zoneId: lease.zoneId,
    chunkX: lease.chunk.x,
    chunkZ: lease.chunk.z,
    positionX: lease.position.x,
    positionZ: lease.position.z,
    lastSeenAt: now,
    expiresAt: lease.expiresAt,
    disconnectedAt: null,
  }).onDuplicateKeyUpdate({
    set: { userId: lease.userId, zoneId: lease.zoneId, chunkX: lease.chunk.x, chunkZ: lease.chunk.z, positionX: lease.position.x, positionZ: lease.position.z, lastSeenAt: now, expiresAt: lease.expiresAt, disconnectedAt: null },
  });
  return lease;
}

export async function releaseWorldPresenceLease(values: { connectionId: string; now?: Date }): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(aurionWorldPresenceLeases).set({ disconnectedAt: values.now ?? new Date() }).where(and(
    eq(aurionWorldPresenceLeases.connectionId, values.connectionId),
    isNull(aurionWorldPresenceLeases.disconnectedAt),
  ));
}

export async function listActiveWorldPresence(now = new Date()): Promise<readonly { userId: number; zoneId: string; chunk: WorldChunkCoordinate; position: { x: number; z: number } }[]> {
  const db = await getDb();
  if (!db) return Object.freeze([]);
  const rows = await db.select({
    userId: aurionWorldPresenceLeases.userId,
    zoneId: aurionWorldPresenceLeases.zoneId,
    chunkX: aurionWorldPresenceLeases.chunkX,
    chunkZ: aurionWorldPresenceLeases.chunkZ,
    positionX: aurionWorldPresenceLeases.positionX,
    positionZ: aurionWorldPresenceLeases.positionZ,
    connectionId: aurionWorldPresenceLeases.connectionId,
    lastSeenAt: aurionWorldPresenceLeases.lastSeenAt,
  }).from(aurionWorldPresenceLeases).where(and(
    gt(aurionWorldPresenceLeases.expiresAt, now),
    isNull(aurionWorldPresenceLeases.disconnectedAt),
  ));
  const latestByUser = new Map<number, { userId: number; zoneId: string; chunk: WorldChunkCoordinate; position: { x: number; z: number } }>();
  rows.sort((left, right) => left.userId - right.userId || right.lastSeenAt.getTime() - left.lastSeenAt.getTime() || left.connectionId.localeCompare(right.connectionId)).forEach(row => {
    if (!latestByUser.has(row.userId)) latestByUser.set(row.userId, Object.freeze({ userId: row.userId, zoneId: row.zoneId, chunk: Object.freeze({ x: row.chunkX, z: row.chunkZ }), position: Object.freeze({ x: row.positionX, z: row.positionZ }) }));
  });
  return Object.freeze(Array.from(latestByUser.values()));
}

function planFromStoredGlobalSnapshot(snapshotJson: string, snapshotHash: string): GlobalWorldPlan {
  let parsed: unknown;
  try {
    parsed = JSON.parse(snapshotJson);
  } catch {
    throw new Error("Der gespeicherte globale Weltplan ist ungültig.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Der gespeicherte globale Weltplan ist ungültig.");
  const value = parsed as Partial<GlobalWorldPlan>;
  const worldSeed = value.worldSeed;
  const epoch = value.epoch;
  const activePlayerCount = value.activePlayerCount;
  const highWaterPlayerCount = value.highWaterPlayerCount;
  if (typeof worldSeed !== "string" || typeof epoch !== "number" || typeof activePlayerCount !== "number" || typeof highWaterPlayerCount !== "number" || !Number.isSafeInteger(epoch) || !Number.isSafeInteger(activePlayerCount) || !Number.isSafeInteger(highWaterPlayerCount)) throw new Error("Der gespeicherte globale Weltplan enthält keine gültigen Kerndaten.");
  const plan = buildGlobalWorldPlan({ worldSeed, epoch, activePlayerCount, highWaterPlayerCount });
  if (plan.deterministicHash !== snapshotHash) throw new Error("Der gespeicherte globale Weltnachweis ist inkonsistent.");
  return plan;
}

/**
 * Applies one globally serialised, receipt-bound resolution request. A running
 * scheduler is deliberately outside this method; callers need an explicit
 * deployment-approved trigger and an idempotency key.
 */
export async function resolveAndRecordGlobalWorldEpoch(input: { requestedByUserId: number; idempotencyKey: string; now?: Date }): Promise<{ plan: GlobalWorldPlan; source: "created" | "persisted"; activePresenceCount: number }> {
  const idempotencyKey = canonicalWorldEpochRequestKey(input.idempotencyKey);
  if (!Number.isSafeInteger(input.requestedByUserId) || input.requestedByUserId < 1) throw new Error("requestedByUserId must be a positive safe integer");
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  const prior = (await db.select().from(aurionWorldEpochRequests).where(eq(aurionWorldEpochRequests.idempotencyKey, idempotencyKey)).limit(1))[0];
  if (prior) return { plan: planFromStoredGlobalSnapshot(prior.snapshotJson, prior.snapshotHash), source: "persisted", activePresenceCount: planFromStoredGlobalSnapshot(prior.snapshotJson, prior.snapshotHash).activePlayerCount };

  const now = input.now ?? new Date();
  const presence = await listActiveWorldPresence(now);
  const activePresenceCount = presence.length;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await db.transaction(async tx => {
        const replay = (await tx.select().from(aurionWorldEpochRequests).where(eq(aurionWorldEpochRequests.idempotencyKey, idempotencyKey)).limit(1))[0];
        if (replay) return { plan: planFromStoredGlobalSnapshot(replay.snapshotJson, replay.snapshotHash), source: "persisted" as const };
        const [current] = await tx.select().from(aurionGlobalWorldStates).where(eq(aurionGlobalWorldStates.worldId, GLOBAL_WORLD_ID)).limit(1);
        const priorPlan = current ? planFromStoredGlobalSnapshot(current.snapshotJson, current.snapshotHash) : buildGlobalWorldPlan({ worldSeed: GLOBAL_WORLD_SEED, epoch: 0, activePlayerCount: 0, highWaterPlayerCount: 1 });
        const plan = buildGlobalWorldPlan({
          worldSeed: priorPlan.worldSeed,
          epoch: nextWorldEpoch(priorPlan.epoch),
          activePlayerCount: activePresenceCount,
          highWaterPlayerCount: Math.max(priorPlan.highWaterPlayerCount, activePresenceCount, 1),
        });
        const snapshotJson = JSON.stringify(plan);
        if (current) {
          const update = await tx.update(aurionGlobalWorldStates).set({ epoch: plan.epoch, activePlayerCount: activePresenceCount, highWaterPlayerCount: plan.highWaterPlayerCount, snapshotJson, snapshotHash: plan.deterministicHash }).where(and(
            eq(aurionGlobalWorldStates.worldId, GLOBAL_WORLD_ID),
            eq(aurionGlobalWorldStates.epoch, current.epoch),
          ));
          if (affectedRowCount(update) !== 1) throw new Error("world_epoch_contention");
        } else {
          await tx.insert(aurionGlobalWorldStates).values({ worldId: GLOBAL_WORLD_ID, worldSeed: plan.worldSeed, epoch: plan.epoch, activePlayerCount: activePresenceCount, highWaterPlayerCount: plan.highWaterPlayerCount, snapshotJson, snapshotHash: plan.deterministicHash });
        }
        const sourceRows = await tx.select().from(aurionWorldChunkDeltas).where(eq(aurionWorldChunkDeltas.worldId, GLOBAL_WORLD_ID)).orderBy(
          asc(aurionWorldChunkDeltas.chunkZ), asc(aurionWorldChunkDeltas.chunkX), asc(aurionWorldChunkDeltas.sequence), asc(aurionWorldChunkDeltas.id),
        ).limit(192);
        const reaction = resolveWorldEpochReaction({ plan, resolutionIndex: plan.epoch, confirmedDeltas: sourceRows.map(parseWorldChunkDelta), observedPresence: presence });
        await tx.insert(aurionGlobalWorldEpochReceipts).values({ id: newCommunityId("worldepoch"), worldId: GLOBAL_WORLD_ID, epoch: plan.epoch, activePlayerCount: activePresenceCount, highWaterPlayerCount: plan.highWaterPlayerCount, snapshotHash: plan.deterministicHash, snapshotJson });
        await tx.insert(aurionWorldEpochReactions).values({ receiptId: reaction.receiptId, worldId: GLOBAL_WORLD_ID, epoch: plan.epoch, ruleSetVersion: reaction.ruleSetVersion, contentVersion: reaction.contentVersion, snapshotHash: plan.deterministicHash, reactionHash: reaction.deterministicHash, reactionJson: JSON.stringify(reaction) });
        await tx.insert(aurionWorldEpochRequests).values({ idempotencyKey, worldId: GLOBAL_WORLD_ID, requestedByUserId: input.requestedByUserId, ruleSetVersion: AURION_WORLD_EPOCH_RULESET_VERSION, epoch: plan.epoch, snapshotHash: plan.deterministicHash, snapshotJson });
        return { plan, source: "created" as const };
      });
      return { ...result, activePresenceCount };
    } catch (error) {
      const replay = (await db.select().from(aurionWorldEpochRequests).where(eq(aurionWorldEpochRequests.idempotencyKey, idempotencyKey)).limit(1))[0];
      if (replay) return { plan: planFromStoredGlobalSnapshot(replay.snapshotJson, replay.snapshotHash), source: "persisted", activePresenceCount: planFromStoredGlobalSnapshot(replay.snapshotJson, replay.snapshotHash).activePlayerCount };
      const epochContention = error instanceof Error && error.message === "world_epoch_contention";
      if ((!epochContention && !isDuplicateKeyError(error)) || attempt === 2) throw error;
    }
  }
  throw new Error("Die globale Weltauflösung konnte nicht serialisiert werden.");
}

export async function createLocalUser(values: { handle: string; passwordHash: string }) {
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  const existing = await db.select({ userId: localCredentials.userId }).from(localCredentials).where(eq(localCredentials.handle, values.handle)).limit(1);
  if (existing[0]) throw new Error("Dieser Rufname ist bereits vergeben.");

  const openId = `local:${values.handle}`;
  await db.transaction(async tx => {
    await tx.insert(users).values({ openId, name: values.handle, loginMethod: "aurion-local", role: "user", lastSignedIn: new Date() });
    const created = await tx.select({ id: users.id }).from(users).where(eq(users.openId, openId)).limit(1);
    if (!created[0]) throw new Error("Das Aurion-Konto konnte nicht angelegt werden.");
    await tx.insert(localCredentials).values({ userId: created[0].id, handle: values.handle, passwordHash: values.passwordHash });
  });
  const user = await getUserByOpenId(openId);
  if (!user) throw new Error("Das Aurion-Konto konnte nicht gelesen werden.");
  return user;
}

export async function getLocalCredential(handle: string) {
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  const result = await db.select({ user: users, credential: localCredentials }).from(localCredentials).innerJoin(users, eq(localCredentials.userId, users.id)).where(eq(localCredentials.handle, handle)).limit(1);
  return result[0];
}

export async function recordLocalAuthFailure(handle: string, failedAttempts: number) {
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  const nextAttempts = failedAttempts + 1;
  const lockedUntil = nextAttempts >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
  await db.update(localCredentials).set({ failedAttempts: nextAttempts, lockedUntil }).where(eq(localCredentials.handle, handle));
  return { lockedUntil };
}

export async function clearLocalAuthFailures(handle: string) {
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");
  await db.update(localCredentials).set({ failedAttempts: 0, lockedUntil: null }).where(eq(localCredentials.handle, handle));
}

export async function createGatewaySession(values: {
  id: string;
  userId: number;
  providerLabel: string;
  tokenDigest: string;
  allowedCommands: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Gateway database is not available");
  await db.insert(gatewaySessions).values(values);
  return getGatewaySessionForUser(values.id, values.userId);
}

export async function getGatewaySessionForUser(id: string, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(gatewaySessions).where(and(eq(gatewaySessions.id, id), eq(gatewaySessions.userId, userId))).limit(1);
  return result[0];
}

export async function listGatewaySessionsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(gatewaySessions).where(eq(gatewaySessions.userId, userId)).orderBy(desc(gatewaySessions.createdAt)).limit(12);
}

export async function getActiveGatewaySessionByTokenDigest(tokenDigest: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(gatewaySessions).where(and(eq(gatewaySessions.tokenDigest, tokenDigest), eq(gatewaySessions.status, "active"), gt(gatewaySessions.expiresAt, new Date()))).limit(1);
  const session = result[0];
  return session && isGatewayGrantActive(session.status, session.expiresAt) ? session : undefined;
}

export async function revokeGatewaySession(id: string, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Gateway database is not available");
  await db.update(gatewaySessions).set({ status: "revoked", revokedAt: new Date() }).where(and(eq(gatewaySessions.id, id), eq(gatewaySessions.userId, userId), eq(gatewaySessions.status, "active")));
}

export async function appendGatewayCommand(values: { gatewaySessionId: string; sequence: number; command: AurionCommand }) {
  const db = await getDb();
  if (!db) throw new Error("Gateway database is not available");
  const latest = await db.select({ sequence: gatewayCommands.sequence }).from(gatewayCommands).where(eq(gatewayCommands.gatewaySessionId, values.gatewaySessionId)).orderBy(desc(gatewayCommands.sequence)).limit(1);
  if (!isStrictlyIncreasingSequence(values.sequence, latest[0]?.sequence)) return { accepted: false as const, reason: "sequence_not_increasing" };
  await db.insert(gatewayCommands).values({ id: `agc_${crypto.randomUUID().replaceAll("-", "")}`, ...values });
  return { accepted: true as const };
}

export async function listGatewayCommandsAfter(gatewaySessionId: string, afterSequence: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(gatewayCommands).where(and(eq(gatewayCommands.gatewaySessionId, gatewaySessionId), gt(gatewayCommands.sequence, afterSequence))).orderBy(gatewayCommands.sequence).limit(40);
}

function newEndgameId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function deterministicRoll(seed: string, label: string): number {
  return Number.parseInt(createHash("sha256").update(`${seed}:${label}`, "utf8").digest("hex").slice(0, 8), 16) % 10_000;
}

function treasureClassForLevel(level: number): string {
  if (level >= 37) return "solarium_t4_weapons";
  if (level >= 21) return "archive_t3_weapons";
  return "asterion_t2_weapons";
}

function canonicalActionForWeapon(track: WeaponTrack): string {
  return { blade: "melee", staff: "bolt", spear: "thrust", focus: "pulse" }[track];
}

async function getAcceptedExpeditionResult(values: { resultReceiptId: string; userId: number; expeditionKey: string; seedDigest: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const result = await db.select().from(expeditionResultReceipts).where(and(
    eq(expeditionResultReceipts.id, values.resultReceiptId),
    eq(expeditionResultReceipts.userId, values.userId),
    eq(expeditionResultReceipts.expeditionKey, values.expeditionKey),
    eq(expeditionResultReceipts.seedDigest, values.seedDigest),
    eq(expeditionResultReceipts.status, "accepted"),
  )).limit(1);
  if (!result[0]) throw new Error("A matching accepted expedition result is required before rewards can be granted");
  return result[0];
}

export async function recordValidatedExpeditionResult(values: { userId: number; expeditionKey: string; seedDigest: string; resultDigest: string; confirmedByUserId: number; idempotencyKey: string }) {
  if (!isServerEvidenceDigest(values.seedDigest) || !isServerEvidenceDigest(values.resultDigest)) throw new Error("Expedition evidence must be a SHA-256 digest");
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const previous = await db.select().from(expeditionResultReceipts).where(eq(expeditionResultReceipts.idempotencyKey, values.idempotencyKey)).limit(1);
  if (previous[0]) return { applied: false as const, receipt: previous[0] };
  await getOrCreatePlayerProfile(values.userId);
  const receiptId = newEndgameId("expres");
  await db.insert(expeditionResultReceipts).values({ id: receiptId, ...values });
  const readback = await db.select().from(expeditionResultReceipts).where(eq(expeditionResultReceipts.id, receiptId)).limit(1);
  if (!readback[0] || readback[0].status !== "accepted") throw new Error("Expedition result receipt readback failed");
  return { applied: true as const, receipt: readback[0] };
}

export async function getOrCreatePlayerProfile(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  await db.insert(playerProfiles).values({ userId }).onDuplicateKeyUpdate({ set: { userId } });
  const result = await db.select().from(playerProfiles).where(eq(playerProfiles.userId, userId)).limit(1);
  if (!result[0]) throw new Error("Could not load player profile");
  return result[0];
}

type GameplayQuestView = {
  key: QuestKey;
  giver: "Lyra" | "Orun";
  title: string;
  objective: string;
  requiredLevel: number;
  state: "locked" | "available" | "active" | "completed";
  readyToTurnIn: boolean;
  reward: { xp: number; points: number; dungeonKey?: "ember_key" };
};

/** Returns only server-derived quest availability. The browser receives this for display, never as a mutation source. */
type ServerSkillProgressionSource = SkillProgressionEvent["source"];

function assertExactPositiveDecimal(value: string): void {
  if (!/^[1-9][0-9]*$/.test(value) || value.length > 128) {
    throw new Error("Skill-XP muss eine kanonische positive Dezimalzahl sein.");
  }
}

/**
 * Records an exact skill event only after the referenced Aurion expedition result
 * has been accepted for the same player. This is intentionally server-internal:
 * browser clients never supply a receipt, source, amount or resolution index.
 */
export async function recordValidatedSkillProgressionEvent(values: {
  userId: number;
  skillId: AurionSkillId;
  amountExact: string;
  source: ServerSkillProgressionSource;
  resultReceiptId: string;
  resolutionIndex: number;
  idempotencyKey: string;
}) {
  assertExactPositiveDecimal(values.amountExact);
  if (!Number.isSafeInteger(values.resolutionIndex) || values.resolutionIndex < 0) {
    throw new Error("Skill-Resolution-Index ist nicht gültig.");
  }
  if (!values.idempotencyKey || values.idempotencyKey.length > 128) {
    throw new Error("Skill-Idempotenzschlüssel ist nicht gültig.");
  }
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const prior = (await tx.select().from(skillProgressionEvents).where(eq(skillProgressionEvents.idempotencyKey, values.idempotencyKey)).limit(1))[0];
    if (prior) return { applied: false as const, event: prior };

    const result = (await tx.select().from(expeditionResultReceipts).where(and(
      eq(expeditionResultReceipts.id, values.resultReceiptId),
      eq(expeditionResultReceipts.userId, values.userId),
      eq(expeditionResultReceipts.status, "accepted"),
    )).limit(1))[0];
    if (!result) throw new Error("Ein bestätigtes Aurion-Result-Receipt desselben Spielers ist erforderlich.");
    if (values.source !== "quest_reward" || !result.expeditionKey.startsWith("quest:")) {
      throw new Error("Die gegenwärtige Skillprogression akzeptiert ausschließlich bestätigte Questbelohnungen.");
    }

    const conflictingEvent = (await tx.select().from(skillProgressionEvents).where(and(
      eq(skillProgressionEvents.userId, values.userId),
      eq(skillProgressionEvents.resultReceiptId, values.resultReceiptId),
      eq(skillProgressionEvents.skillId, values.skillId),
    )).limit(1))[0];
    if (conflictingEvent) throw new Error("Dieses Result-Receipt besitzt bereits ein Skillereignis.");

    const id = newEndgameId("skillev");
    await tx.insert(skillProgressionEvents).values({ id, ...values });
    const event = (await tx.select().from(skillProgressionEvents).where(eq(skillProgressionEvents.id, id)).limit(1))[0];
    if (!event) throw new Error("Skillereignis-Readback fehlgeschlagen.");
    return { applied: true as const, event };
  });
}

async function listConfirmedSkillProgressionEvents(userId: number, skillId: AurionSkillId): Promise<SkillProgressionEvent[]> {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const rows = await db.select().from(skillProgressionEvents).where(and(
    eq(skillProgressionEvents.userId, userId),
    eq(skillProgressionEvents.skillId, skillId),
  ));
  return rows.map(row => ({
    idempotencyKey: row.idempotencyKey,
    skillId: row.skillId as AurionSkillId,
    amountExact: row.amountExact,
    source: row.source as ServerSkillProgressionSource,
    receiptId: row.resultReceiptId,
    resolutionIndex: row.resolutionIndex,
  }));
}

export async function getExactSkillProgressionReadmodel(userId: number, skillId: AurionSkillId = "combat") {
  const events = await listConfirmedSkillProgressionEvents(userId, skillId);
  return resolveSkillProgressionReadmodel({ playerId: String(userId), skillId, events });
}

export async function getGameplayProgress(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const profile = await getOrCreatePlayerProfile(userId);
  const questRows = await db.select().from(gameplayQuestProgress).where(eq(gameplayQuestProgress.userId, userId));
  const keyRows = await db.select().from(gameplayDungeonKeys).where(eq(gameplayDungeonKeys.userId, userId));
  const completed = questRows.filter(row => row.state === "completed").map(row => row.questKey).filter((key): key is QuestKey => aurionQuestline.some(quest => quest.key === key));
  const active = questRows.find(row => row.state === "active")?.questKey;
  const activeQuest = aurionQuestline.some(quest => quest.key === active) ? active as QuestKey : null;
  const readyToTurnIn = questRows.filter(row => row.state === "ready_to_turn_in").map(row => row.questKey).filter((key): key is QuestKey => aurionQuestline.some(quest => quest.key === key));
  const quests: GameplayQuestView[] = aurionQuestline.map(quest => ({
    key: quest.key,
    giver: quest.giver,
    title: quest.title,
    objective: quest.objective,
    requiredLevel: quest.requiredLevel,
    state: resolveQuestState({ key: quest.key, level: profile.level, completed, active: activeQuest }),
    readyToTurnIn: readyToTurnIn.includes(quest.key),
    reward: quest.reward,
  }));
  const keys = keyRows.map(row => row.keyName);
  return {
    profile,
    quests,
    keys,
    activeQuest,
    readyToTurnIn,
    completed,
    canEnterDungeon: mayEnterDungeon({ level: profile.level, completed, keys }),
  };
}

const GLOBAL_WORLD_ID = "echoes-of-aurion-global";
const GLOBAL_WORLD_SEED = "echoes-of-aurion-v1";

/**
 * Resolves the persistent global world plan. Account count is a durable phase-one
 * scale signal; presence-based expansion will be supplied by the zone registry.
 */
export type GlobalWorldAdminReadModel = {
  source: "persisted" | "preview";
  globalWorld: GlobalWorldClientDescriptor;
  updatedAt: string | null;
};

/**
 * Read-only global summary for authenticated administrators and the separate
 * Admin MCP. It must never advance epochs, persist a snapshot, or issue a
 * receipt as a side effect of reading.
 */
export async function getGlobalWorldAdminReadModel(): Promise<GlobalWorldAdminReadModel> {
  const db = await getDb();
  if (!db) {
    const plan = buildGlobalWorldPlan({ worldSeed: GLOBAL_WORLD_SEED, epoch: 0, activePlayerCount: 1, highWaterPlayerCount: 1 });
    return Object.freeze({ source: "preview", globalWorld: toGlobalWorldClientDescriptor(plan), updatedAt: null });
  }
  const [current] = await db.select().from(aurionGlobalWorldStates).where(eq(aurionGlobalWorldStates.worldId, GLOBAL_WORLD_ID)).limit(1);
  if (current) {
    const plan = buildGlobalWorldPlan({
      worldSeed: current.worldSeed,
      epoch: current.epoch,
      activePlayerCount: current.activePlayerCount,
      highWaterPlayerCount: current.highWaterPlayerCount,
    });
    if (plan.deterministicHash !== current.snapshotHash) throw new Error("Der persistierte globale Weltnachweis ist inkonsistent.");
    return Object.freeze({ source: "persisted", globalWorld: toGlobalWorldClientDescriptor(plan), updatedAt: current.updatedAt.toISOString() });
  }
  const players = await db.select({ id: users.id }).from(users);
  const count = Math.max(1, players.length);
  const plan = buildGlobalWorldPlan({ worldSeed: GLOBAL_WORLD_SEED, epoch: 0, activePlayerCount: count, highWaterPlayerCount: count });
  return Object.freeze({ source: "preview", globalWorld: toGlobalWorldClientDescriptor(plan), updatedAt: null });
}

/**
 * Returns the last confirmed global state for player-facing readmodels. This
 * method intentionally never observes account rows, advances an epoch, or
 * writes a snapshot; `resolveAndRecordGlobalWorldEpoch` is the sole resolver.
 */
export async function getGlobalWorldPlan() {
  const db = await getDb();
  if (!db) return buildGlobalWorldPlan({ worldSeed: GLOBAL_WORLD_SEED, epoch: 0, activePlayerCount: 1, highWaterPlayerCount: 1 });
  const [current] = await db.select().from(aurionGlobalWorldStates).where(eq(aurionGlobalWorldStates.worldId, GLOBAL_WORLD_ID)).limit(1);
  if (!current) return buildGlobalWorldPlan({ worldSeed: GLOBAL_WORLD_SEED, epoch: 0, activePlayerCount: 1, highWaterPlayerCount: 1 });
  return planFromStoredGlobalSnapshot(current.snapshotJson, current.snapshotHash);
}

function parseStoredWorldEpochReaction(row: typeof aurionWorldEpochReactions.$inferSelect): WorldEpochReaction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.reactionJson);
  } catch {
    throw new Error("Der gespeicherte Weltreaktionsreceipt ist ungültig.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("Der gespeicherte Weltreaktionsreceipt ist ungültig.");
  const reaction = parsed as Partial<WorldEpochReaction>;
  if (reaction.receiptId !== row.receiptId || reaction.worldId !== row.worldId || reaction.resolutionIndex !== row.epoch || reaction.ruleSetVersion !== row.ruleSetVersion || reaction.contentVersion !== row.contentVersion || reaction.deterministicHash !== row.reactionHash || !Array.isArray(reaction.sectors)) throw new Error("Der gespeicherte Weltreaktionsreceipt ist inkonsistent.");
  return reaction as WorldEpochReaction;
}

/** Reads the immutable reaction for one already confirmed global epoch; it never resolves or writes. */
export async function getWorldEpochReaction(worldId: string, epoch: number, snapshotHash: string): Promise<WorldEpochReaction | null> {
  const db = await getDb();
  if (!db || !Number.isSafeInteger(epoch) || epoch < 1) return null;
  const row = (await db.select().from(aurionWorldEpochReactions).where(and(
    eq(aurionWorldEpochReactions.worldId, worldId),
    eq(aurionWorldEpochReactions.epoch, epoch),
    eq(aurionWorldEpochReactions.snapshotHash, snapshotHash),
  )).limit(1))[0];
  return row ? parseStoredWorldEpochReaction(row) : null;
}

function parseWorldChunkDelta(row: typeof aurionWorldChunkDeltas.$inferSelect): WorldChunkDelta {
  let payload: Record<string, string | number | boolean>;
  try {
    payload = JSON.parse(row.payloadJson) as Record<string, string | number | boolean>;
  } catch {
    throw new Error("Stored chunk delta payload is invalid");
  }
  const delta = createWorldChunkDelta({
    id: row.id,
    worldId: row.worldId,
    coordinate: { x: row.chunkX, z: row.chunkZ },
    baseRevision: row.baseRevision,
    sequence: row.sequence,
    kind: row.kind,
    targetId: row.targetId,
    actorUserId: row.actorUserId,
    idempotencyKey: row.idempotencyKey,
    payload,
  });
  if (delta.deterministicHash !== row.deterministicHash) throw new Error("Stored chunk delta hash mismatch");
  return delta;
}

export const WORLD_CHUNK_DELTA_PAGE_MAXIMUM = 64 as const;

export async function getWorldChunkDeltaPage(input: {
  coordinate: WorldChunkCoordinate;
  afterSequence: number;
  limit: number;
}) {
  if (!Number.isSafeInteger(input.afterSequence) || input.afterSequence < 0) throw new Error("Chunk-Deltacursor muss eine nichtnegative Ganzzahl sein.");
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > WORLD_CHUNK_DELTA_PAGE_MAXIMUM) throw new Error(`Chunk-Deltalimit muss zwischen 1 und ${WORLD_CHUNK_DELTA_PAGE_MAXIMUM} liegen.`);
  const base = generateBaseWorldChunk({ worldId: GLOBAL_WORLD_ID, worldSeed: GLOBAL_WORLD_SEED, coordinate: input.coordinate });
  const db = await getDb();
  if (!db) return Object.freeze({
    generation: Object.freeze({ worldId: base.worldId, coordinate: base.coordinate, baseRevision: base.baseRevision, baseHash: base.deterministicHash }),
    deltas: Object.freeze([]),
    nextAfterSequence: input.afterSequence,
    hasMore: false,
  });
  const rows = await db.select().from(aurionWorldChunkDeltas).where(and(
    eq(aurionWorldChunkDeltas.worldId, GLOBAL_WORLD_ID),
    eq(aurionWorldChunkDeltas.chunkX, input.coordinate.x),
    eq(aurionWorldChunkDeltas.chunkZ, input.coordinate.z),
    gt(aurionWorldChunkDeltas.sequence, input.afterSequence),
  )).orderBy(aurionWorldChunkDeltas.sequence, aurionWorldChunkDeltas.id).limit(input.limit + 1);
  const page = rows.slice(0, input.limit).map(parseWorldChunkDelta).map(toWorldChunkDeltaOverlay);
  return Object.freeze({
    generation: Object.freeze({ worldId: base.worldId, coordinate: base.coordinate, baseRevision: base.baseRevision, baseHash: base.deterministicHash }),
    deltas: Object.freeze(page),
    nextAfterSequence: page.at(-1)?.sequence ?? input.afterSequence,
    hasMore: rows.length > page.length,
  });
}

/** Returns bounded, center-first overlay pages; cursors can address only the current visible window. */
export async function getWorldChunkWindow(input: { center: WorldChunkCoordinate; tier: WorldChunkStreamingTier; afterSequences?: readonly { coordinate: WorldChunkCoordinate; afterSequence: number }[] }) {
  const budget = worldChunkStreamingBudget(input.tier);
  const coordinates = orderedWorldChunkWindow(input.center, budget.visibleRadius);
  const visibleKeys = new Set(coordinates.map(coordinate => `${coordinate.x}:${coordinate.z}`));
  const cursors = new Map<string, number>();
  for (const cursor of input.afterSequences ?? []) {
    const key = `${cursor.coordinate.x}:${cursor.coordinate.z}`;
    if (!visibleKeys.has(key) || !Number.isSafeInteger(cursor.afterSequence) || cursor.afterSequence < 0 || cursors.has(key)) throw new Error("Mehrchunkcursor gehört nicht eindeutig zum sichtbaren Fenster.");
    cursors.set(key, cursor.afterSequence);
  }
  const chunks = await Promise.all(coordinates.map(coordinate => getWorldChunkDeltaPage({ coordinate, afterSequence: cursors.get(`${coordinate.x}:${coordinate.z}`) ?? 0, limit: WORLD_CHUNK_STREAM_PAGE_LIMIT })));
  return Object.freeze({
    tier: input.tier,
    center: Object.freeze({ ...input.center }),
    visibleRadius: budget.visibleRadius,
    chunks: Object.freeze(chunks),
  });
}

export async function getWorldChunkReadModel(coordinate: WorldChunkCoordinate) {
  const base = generateBaseWorldChunk({ worldId: GLOBAL_WORLD_ID, worldSeed: GLOBAL_WORLD_SEED, coordinate });
  const db = await getDb();
  if (!db) return materializeWorldChunk(base, []);
  const rows = await db.select().from(aurionWorldChunkDeltas).where(and(
    eq(aurionWorldChunkDeltas.worldId, GLOBAL_WORLD_ID),
    eq(aurionWorldChunkDeltas.chunkX, coordinate.x),
    eq(aurionWorldChunkDeltas.chunkZ, coordinate.z),
  )).orderBy(aurionWorldChunkDeltas.sequence, aurionWorldChunkDeltas.id);
  return materializeWorldChunk(base, rows.map(parseWorldChunkDelta));
}

function canonicalChunkDeltaReceiptId(actorUserId: number, idempotencyKey: string): string {
  const digest = createHash("sha256").update(`aurion:chunk-delta-receipt:v1:${actorUserId}:${idempotencyKey}`, "utf8").digest("hex");
  return `chunkdelta_${digest.slice(0, 48)}`;
}

function hasEquivalentChunkDeltaRequest(row: typeof aurionWorldChunkDeltas.$inferSelect, input: {
  actorUserId: number;
  coordinate: WorldChunkCoordinate;
  kind: WorldChunkDeltaKind;
  targetId: string;
  payload: Record<string, string | number | boolean>;
}): boolean {
  return row.worldId === GLOBAL_WORLD_ID
    && row.actorUserId === input.actorUserId
    && row.chunkX === input.coordinate.x
    && row.chunkZ === input.coordinate.z
    && row.kind === input.kind
    && row.targetId === input.targetId
    && row.payloadJson === JSON.stringify(input.payload);
}

function isDuplicateKeyError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: unknown; cause?: unknown };
  return candidate.code === "ER_DUP_ENTRY" || isDuplicateKeyError(candidate.cause);
}

/**
 * Persists one server-authorized chunk receipt. Sequence allocation, duplicate-target
 * protection and idempotent replay are transactionally serialized; clients never
 * submit a sequence, canonical delta identifier or receipt hash.
 */
export async function recordWorldChunkDelta(input: {
  actorUserId: number;
  coordinate: WorldChunkCoordinate;
  baseRevision: number;
  kind: WorldChunkDeltaKind;
  targetId: string;
  idempotencyKey: string;
  payload: Record<string, string | number | boolean>;
}) {
  if (!Number.isSafeInteger(input.actorUserId) || input.actorUserId < 1) throw new Error("Chunkdelta-Akteur ist ungültig.");
  if (input.baseRevision !== 1) throw new Error("Chunkdelta-Basisrevision ist ungültig.");
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const prior = (await db.select().from(aurionWorldChunkDeltas).where(eq(aurionWorldChunkDeltas.idempotencyKey, input.idempotencyKey)).limit(1))[0];
    if (prior) {
      if (!hasEquivalentChunkDeltaRequest(prior, input)) throw new Error("Chunkdelta-Idempotenzschlüssel gehört bereits zu einer anderen Aktion.");
      return { delta: parseWorldChunkDelta(prior), source: "persisted" as const };
    }
    try {
      return await db.transaction(async tx => {
        const replay = (await tx.select().from(aurionWorldChunkDeltas).where(eq(aurionWorldChunkDeltas.idempotencyKey, input.idempotencyKey)).limit(1))[0];
        if (replay) {
          if (!hasEquivalentChunkDeltaRequest(replay, input)) throw new Error("Chunkdelta-Idempotenzschlüssel gehört bereits zu einer anderen Aktion.");
          return { delta: parseWorldChunkDelta(replay), source: "persisted" as const };
        }
        if (input.kind === "structure_removed") {
          const placement = (await tx.select().from(aurionWorldChunkDeltas).where(and(
            eq(aurionWorldChunkDeltas.worldId, GLOBAL_WORLD_ID),
            eq(aurionWorldChunkDeltas.chunkX, input.coordinate.x),
            eq(aurionWorldChunkDeltas.chunkZ, input.coordinate.z),
            eq(aurionWorldChunkDeltas.targetId, input.targetId),
            eq(aurionWorldChunkDeltas.kind, "structure_placed"),
          )).limit(1))[0];
          if (!placement || placement.actorUserId !== input.actorUserId) throw new Error("Struktur kann nur von ihrer Eigentümerin oder ihrem Eigentümer entfernt werden.");
          let placementPayload: Record<string, unknown>;
          try { placementPayload = JSON.parse(placement.payloadJson) as Record<string, unknown>; } catch { throw new Error("Strukturreceipt ist ungültig."); }
          if (placementPayload.xMm !== input.payload.xMm || placementPayload.zMm !== input.payload.zMm) throw new Error("Strukturposition stimmt nicht mit dem Eigentumsreceipt überein.");
          const priorRemoval = (await tx.select({ id: aurionWorldChunkDeltas.id }).from(aurionWorldChunkDeltas).where(and(
            eq(aurionWorldChunkDeltas.worldId, GLOBAL_WORLD_ID),
            eq(aurionWorldChunkDeltas.chunkX, input.coordinate.x),
            eq(aurionWorldChunkDeltas.chunkZ, input.coordinate.z),
            eq(aurionWorldChunkDeltas.targetId, input.targetId),
            eq(aurionWorldChunkDeltas.kind, "structure_removed"),
          )).limit(1))[0];
          if (priorRemoval) throw new Error("Struktur wurde bereits entfernt.");
        } else {
          const occupiedTarget = (await tx.select({ id: aurionWorldChunkDeltas.id }).from(aurionWorldChunkDeltas).where(and(
            eq(aurionWorldChunkDeltas.worldId, GLOBAL_WORLD_ID),
            eq(aurionWorldChunkDeltas.chunkX, input.coordinate.x),
            eq(aurionWorldChunkDeltas.chunkZ, input.coordinate.z),
            eq(aurionWorldChunkDeltas.targetId, input.targetId),
          )).limit(1))[0];
          if (occupiedTarget) throw new Error("Chunkdelta-Ziel ist bereits verändert worden.");
        }
        if (input.kind === "structure_placed" || input.kind === "road_built") {
          const currentRows = await tx.select().from(aurionWorldChunkDeltas).where(and(
            eq(aurionWorldChunkDeltas.worldId, GLOBAL_WORLD_ID),
            eq(aurionWorldChunkDeltas.chunkX, input.coordinate.x),
            eq(aurionWorldChunkDeltas.chunkZ, input.coordinate.z),
          )).orderBy(aurionWorldChunkDeltas.sequence, aurionWorldChunkDeltas.id);
          const base = generateBaseWorldChunk({ worldId: GLOBAL_WORLD_ID, worldSeed: GLOBAL_WORLD_SEED, coordinate: input.coordinate });
          const current = materializeWorldChunk(base, currentRows.map(parseWorldChunkDelta));
          if (input.kind === "structure_placed") {
            if (current.structures.length >= WORLD_CHUNK_STRUCTURE_MAXIMUM) throw new Error("Strukturlimit des Chunks ist erreicht.");
            if (current.structures.some(structure => structure.positionMm.x === input.payload.xMm && structure.positionMm.z === input.payload.zMm)) throw new Error("Strukturziel ist bereits besetzt.");
          }
          if (input.kind === "road_built" && current.roads.length >= WORLD_CHUNK_ROAD_MAXIMUM) throw new Error("Straßenlimit des Chunks ist erreicht.");
        }
        const latest = (await tx.select({ sequence: aurionWorldChunkDeltas.sequence }).from(aurionWorldChunkDeltas).where(and(
          eq(aurionWorldChunkDeltas.worldId, GLOBAL_WORLD_ID),
          eq(aurionWorldChunkDeltas.chunkX, input.coordinate.x),
          eq(aurionWorldChunkDeltas.chunkZ, input.coordinate.z),
        )).orderBy(desc(aurionWorldChunkDeltas.sequence)).limit(1))[0];
        const delta = createWorldChunkDelta({
          id: canonicalChunkDeltaReceiptId(input.actorUserId, input.idempotencyKey),
          worldId: GLOBAL_WORLD_ID,
          coordinate: input.coordinate,
          baseRevision: input.baseRevision,
          sequence: (latest?.sequence ?? 0) + 1,
          kind: input.kind,
          targetId: input.targetId,
          actorUserId: input.actorUserId,
          idempotencyKey: input.idempotencyKey,
          payload: input.payload,
        });
        await tx.insert(aurionWorldChunkDeltas).values({
          id: delta.id,
          worldId: delta.worldId,
          chunkX: delta.coordinate.x,
          chunkZ: delta.coordinate.z,
          baseRevision: delta.baseRevision,
          sequence: delta.sequence,
          kind: delta.kind,
          targetId: delta.targetId,
          actorUserId: delta.actorUserId,
          idempotencyKey: delta.idempotencyKey,
          payloadJson: JSON.stringify(delta.payload),
          deterministicHash: delta.deterministicHash,
        });
        return { delta, source: "created" as const };
      });
    } catch (error) {
      if (!isDuplicateKeyError(error) || attempt === 2) throw error;
    }
  }
  throw new Error("Chunkdelta-Sequenz konnte nicht serialisiert werden.");
}

/**
 * Applies a browser world intent only from a non-expired server-observed lease.
 * The user never supplies a position, a target receipt, a sequence, or an asset
 * outside the manifest-bound allowlist encoded by the pure protocol.
 */
export async function applyWorldChunkAction(input: { actorUserId: number; intent: WorldChunkActionIntent }) {
  const actorPresence = (await listActiveWorldPresence()).find(presence => presence.userId === input.actorUserId && presence.chunk.x === input.intent.coordinate.x && presence.chunk.z === input.intent.coordinate.z);
  if (!actorPresence) throw new Error("Keine aktive serverbeobachtete Präsenz im Zielchunk.");
  const resolved = resolveWorldChunkAction({
    actorUserId: input.actorUserId,
    actorPosition: actorPresence.position,
    worldId: GLOBAL_WORLD_ID,
    worldSeed: GLOBAL_WORLD_SEED,
    intent: input.intent,
  });
  return recordWorldChunkDelta({
    actorUserId: input.actorUserId,
    coordinate: input.intent.coordinate,
    baseRevision: input.intent.expectedBaseRevision,
    kind: resolved.kind,
    targetId: resolved.targetId,
    idempotencyKey: input.intent.idempotencyKey,
    payload: resolved.payload,
  });
}

/** A display-only world view derived from authoritative player progression, global scale state and confirmed skill receipts. */
export async function getOpenWorldSnapshot(userId: number) {
  const [progress, skillProgressionEvents, globalWorld] = await Promise.all([
    getGameplayProgress(userId),
    listConfirmedSkillProgressionEvents(userId, "combat"),
    getGlobalWorldPlan(),
  ]);
  const epochReaction = await getWorldEpochReaction(GLOBAL_WORLD_ID, globalWorld.epoch, globalWorld.deterministicHash);
  return buildOpenWorldSnapshot({
    playerId: String(userId),
    level: progress.profile.level,
    completed: progress.completed,
    activeQuest: progress.activeQuest,
    canEnterDungeon: progress.canEnterDungeon,
    skillProgressionEvents,
    globalWorld,
    epochReaction: epochReaction ?? undefined,
  });
}

function parseDialogueInterpretationReceipt(raw: string): DialogueInterpretation {
  try {
    const parsed = JSON.parse(raw) as DialogueInterpretation;
    if (parsed && (parsed.state === "accepted" || parsed.state === "quarantined" || parsed.state === "rejected")) return parsed;
  } catch {
    // A malformed stored receipt must never become a gameplay command.
  }
  throw new Error("Der gespeicherte Dialogreceipt ist ungültig.");
}

function parseDialogueQuestIntentOutcome(raw: string): DialogueQuestIntentResolution {
  try {
    const parsed = JSON.parse(raw) as DialogueQuestIntentResolution;
    if (parsed && (parsed.state === "offer_available_quest" || parsed.state === "turn_in_available" || parsed.state === "no_action")) return parsed;
  } catch {
    // A malformed command receipt must not silently change its visible outcome.
  }
  throw new Error("Der gespeicherte Dialog-Command-Receipt ist ungültig.");
}

function dialogueCommandReadback(row: typeof aurionDialogueCommandReceipts.$inferSelect) {
  return {
    id: row.id,
    dialogueReceiptId: row.dialogueReceiptId,
    npcId: row.npcId,
    actionKind: row.actionKind as DialogueQuestActionKind,
    questKey: row.questKey as QuestKey,
    outcome: parseDialogueQuestIntentOutcome(row.outcomeJson),
    createdAt: row.createdAt,
  } as const;
}

/**
 * Records a player's explicit confirmation of an already moderated dialogue meaning.
 * This command only returns a bounded quest offer or hand-in prompt; it never accepts,
 * completes, rewards or otherwise advances the quest. Those remain separate Aurion commands.
 */
export async function requestQuestActionFromDialogue(values: {
  userId: number;
  dialogueReceiptId: string;
  actionKind: DialogueQuestActionKind;
  questKey: QuestKey;
  idempotencyKey: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Die Aurion-Spielerdatenbank ist nicht verfügbar.");

  // This command writes one receipt only. Fresh reads avoid a repeatable-read snapshot
  // hiding a concurrently confirmed receipt after the unique key has collapsed the race.
  const replay = (await db.select().from(aurionDialogueCommandReceipts).where(eq(aurionDialogueCommandReceipts.idempotencyKey, values.idempotencyKey)).limit(1))[0];
  if (replay) {
    const sameRequest = replay.userId === values.userId
      && replay.dialogueReceiptId === values.dialogueReceiptId
      && replay.actionKind === values.actionKind
      && replay.questKey === values.questKey;
    if (!sameRequest) throw new Error("Dieser Idempotenzschlüssel gehört zu einer anderen Dialogaktion.");
    return { receipt: dialogueCommandReadback(replay), replayed: true as const };
  }

  const dialogue = (await db.select().from(aurionDialogueReceipts).where(and(
      eq(aurionDialogueReceipts.id, values.dialogueReceiptId),
      eq(aurionDialogueReceipts.userId, values.userId),
  )).limit(1))[0];
  if (!dialogue) throw new Error("Ein eigener bestätigter Dialogreceipt ist erforderlich.");

  const interpretation = parseDialogueInterpretationReceipt(dialogue.interpretationJson);
  const progress = await getGameplayProgress(values.userId);
  const outcome = resolveDialogueQuestIntent({
    npcId: dialogue.npcId,
    interpretation,
    quests: progress.quests,
  });
  if (outcome.state === "no_action" || outcome.actionKind !== values.actionKind || outcome.questKey !== values.questKey) {
    throw new Error("Dieser Dialog erlaubt die angefragte Questaktion nicht.");
  }

  const id = newEndgameId("dialogue_cmd");
  await db.insert(aurionDialogueCommandReceipts).values({
      id,
      userId: values.userId,
      dialogueReceiptId: dialogue.id,
      npcId: dialogue.npcId,
      actionKind: outcome.actionKind,
      questKey: outcome.questKey,
      outcomeJson: JSON.stringify(outcome),
      idempotencyKey: values.idempotencyKey,
  }).onDuplicateKeyUpdate({
    set: { outcomeJson: sql`${aurionDialogueCommandReceipts.outcomeJson}` },
  });
  const readback = (await db.select().from(aurionDialogueCommandReceipts).where(or(
      eq(aurionDialogueCommandReceipts.idempotencyKey, values.idempotencyKey),
      and(
        eq(aurionDialogueCommandReceipts.userId, values.userId),
        eq(aurionDialogueCommandReceipts.dialogueReceiptId, values.dialogueReceiptId),
        eq(aurionDialogueCommandReceipts.actionKind, values.actionKind),
        eq(aurionDialogueCommandReceipts.questKey, values.questKey),
      ),
  )).limit(1))[0];
  if (!readback) throw new Error("Dialog-Command-Receipt-Readback fehlgeschlagen.");
  const sameRequest = readback.userId === values.userId
    && readback.dialogueReceiptId === values.dialogueReceiptId
    && readback.actionKind === values.actionKind
    && readback.questKey === values.questKey;
  if (!sameRequest) throw new Error("Dieser Idempotenzschlüssel gehört zu einer anderen Dialogaktion.");
  return { receipt: dialogueCommandReadback(readback), replayed: readback.id !== id };
}

export async function acceptGameplayQuest(values: { userId: number; questKey: QuestKey }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const progress = await getGameplayProgress(values.userId);
  const quest = progress.quests.find(candidate => candidate.key === values.questKey);
  if (!quest || quest.state !== "available") throw new Error("Diese Quest ist für den aktuellen Fortschritt nicht verfügbar.");
  await db.insert(gameplayQuestProgress).values({ id: newEndgameId("quest"), userId: values.userId, questKey: values.questKey, state: "active" });
  return getGameplayProgress(values.userId);
}

/** Rewards are held until the player returns to the authored NPC after a confirmed boss kill. */
export async function completeGameplayQuest(values: { userId: number; questKey: QuestKey; giver: "Lyra" | "Orun" }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const quest = getQuest(values.questKey);
  if (quest.giver !== values.giver) throw new Error("Dieser Questgeber kann den Auftrag nicht abschließen.");
  let completionSessionId: string | null = null;
  await db.transaction(async tx => {
    const row = (await tx.select().from(gameplayQuestProgress).where(and(
      eq(gameplayQuestProgress.userId, values.userId),
      eq(gameplayQuestProgress.questKey, values.questKey),
      eq(gameplayQuestProgress.state, "ready_to_turn_in"),
    )).limit(1))[0];
    if (!row?.completionSessionId) throw new Error("Dieser Auftrag ist noch nicht zur Übergabe bereit.");
    completionSessionId = row.completionSessionId;
    const profile = (await tx.select().from(playerProfiles).where(eq(playerProfiles.userId, values.userId)).limit(1))[0];
    if (!profile) throw new Error("Spielerprofil fehlt beim Questabschluss.");
    const now = new Date();
    const totalXp = profile.totalXp + quest.reward.xp;
    await tx.update(gameplayQuestProgress).set({ state: "completed", completedAt: now }).where(eq(gameplayQuestProgress.id, row.id));
    await tx.update(playerProfiles).set({ totalXp, level: levelFromTotalXp(totalXp), aurionPoints: profile.aurionPoints + quest.reward.points, seasonPoints: profile.seasonPoints + quest.reward.points, victories: profile.victories + 1 }).where(eq(playerProfiles.userId, values.userId));
    await tx.insert(progressionLedger).values([
      { id: newEndgameId("prog"), userId: values.userId, kind: "xp", delta: quest.reward.xp, source: `quest:${quest.key}`, reason: quest.title, idempotencyKey: `quest:${row.completionSessionId}:xp` },
      { id: newEndgameId("prog"), userId: values.userId, kind: "points", delta: quest.reward.points, source: `quest:${quest.key}`, reason: quest.title, idempotencyKey: `quest:${row.completionSessionId}:points` },
      { id: newEndgameId("prog"), userId: values.userId, kind: "victory", delta: 1, source: `encounter:${row.completionSessionId}`, reason: quest.title, idempotencyKey: `quest:${row.completionSessionId}:victory` },
    ]);
    if (quest.reward.dungeonKey) await tx.insert(gameplayDungeonKeys).values({ id: newEndgameId("dkey"), userId: values.userId, keyName: quest.reward.dungeonKey, grantedByQuest: quest.key }).onDuplicateKeyUpdate({ set: { grantedByQuest: quest.key } });
  });
  if (!completionSessionId) throw new Error("Quest completion receipt is missing");
  const profile = await getOrCreatePlayerProfile(values.userId);
  const seedDigest = createHash("sha256").update(`aurion:quest:${completionSessionId}:seed`, "utf8").digest("hex");
  const resultDigest = createHash("sha256").update(`aurion:quest:${completionSessionId}:result`, "utf8").digest("hex");
  const resultReceipt = await recordValidatedExpeditionResult({
    userId: values.userId,
    expeditionKey: `quest:${completionSessionId}`,
    seedDigest,
    resultDigest,
    confirmedByUserId: values.userId,
    idempotencyKey: `quest:${completionSessionId}:result`,
  });
  const completedSession = (await db.select({ nextSequence: gameplaySessions.nextSequence }).from(gameplaySessions).where(and(
    eq(gameplaySessions.id, completionSessionId),
    eq(gameplaySessions.userId, values.userId),
    eq(gameplaySessions.status, "completed"),
  )).limit(1))[0];
  if (!completedSession || completedSession.nextSequence < 2) throw new Error("Die bestätigte Abschlusssequenz fehlt für die Skillprogression.");
  await recordValidatedSkillProgressionEvent({
    userId: values.userId,
    skillId: "combat",
    amountExact: String(quest.reward.xp),
    source: "quest_reward",
    resultReceiptId: resultReceipt.receipt.id,
    resolutionIndex: completedSession.nextSequence - 1,
    idempotencyKey: `quest:${completionSessionId}:combat-skill`,
  });
  const dropResult = await createLootDrop({
    userId: values.userId,
    expeditionKey: `quest:${completionSessionId}`,
    treasureClass: treasureClassForLevel(profile.level),
    qualityRoll: deterministicRoll(seedDigest, "quality"),
    affixRoll: deterministicRoll(seedDigest, "affix"),
    magicFind: 0,
    itemLevel: Math.max(1, Math.min(profile.level, 50)),
    seedDigest,
    resultReceiptId: resultReceipt.receipt.id,
    idempotencyKey: `quest:${completionSessionId}:drop`,
  });
  const loadout = await getWeaponLoadout(values.userId);
  if (loadout) {
    await recordValidatedWeaponEvent({
      userId: values.userId,
      expeditionKey: `quest:${completionSessionId}`,
      seedDigest,
      resultReceiptId: resultReceipt.receipt.id,
      weaponTrack: loadout.weaponTrack as WeaponTrack,
      actionKey: canonicalActionForWeapon(loadout.weaponTrack as WeaponTrack),
      xpGranted: Math.max(8, Math.floor(quest.reward.xp / 12)),
      idempotencyKey: `quest:${completionSessionId}:weapon`,
    });
  }
  const item = dropResult.itemId ? (await db.select().from(itemInstances).where(eq(itemInstances.id, dropResult.itemId)).limit(1))[0] : undefined;
  return { ...(await getGameplayProgress(values.userId)), questDrop: item ? { id: item.id, baseItemKey: item.baseItemKey, quality: item.quality, itemLevel: item.itemLevel, setKey: item.setKey } : null };
}

export async function startGameplayEncounter(values: { userId: number; encounterKey: EncounterKey }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const encounter = getEncounter(values.encounterKey);
  const progress = await getGameplayProgress(values.userId);
  if (encounter.questKey && progress.quests.find(quest => quest.key === encounter.questKey)?.state !== "active") {
    throw new Error("Die zugehörige Quest muss vor dieser Begegnung aktiv sein.");
  }
  if (encounter.requiresDungeonKey && !progress.canEnterDungeon) {
    throw new Error("Der Glutschlüssel und der abgeschlossene Questpfad sind für das Aschengewölbe erforderlich.");
  }
  const sessionId = newEndgameId("game");
  await db.transaction(async tx => {
    await tx.update(gameplaySessions).set({ status: "abandoned" }).where(and(eq(gameplaySessions.userId, values.userId), eq(gameplaySessions.status, "active")));
    await tx.insert(gameplaySessions).values({ id: sessionId, userId: values.userId, encounterKey: values.encounterKey, bossHp: encounter.maxBossHp, maxBossHp: encounter.maxBossHp });
  });
  const session = await db.select().from(gameplaySessions).where(eq(gameplaySessions.id, sessionId)).limit(1);
  if (!session[0]) throw new Error("Die Spielsitzung konnte nicht bestätigt werden.");
  return { session: session[0], progress };
}

export async function applyGameplayAction(values: { userId: number; sessionId: string; sequence: number; command: string; source: "human" | "gateway" }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const normalized = values.command.trim().toUpperCase();
  const action = mcpActionFromCommand(normalized);
  if (!action) throw new Error("Der Spielbefehl ist nicht zulässig.");
  const resolution = await db.transaction(async tx => {
    const session = (await tx.select().from(gameplaySessions).where(and(eq(gameplaySessions.id, values.sessionId), eq(gameplaySessions.userId, values.userId))).limit(1))[0];
    if (!session || session.status !== "active") throw new Error("Die Spielsitzung ist nicht aktiv.");
    if (!Number.isSafeInteger(values.sequence) || values.sequence !== session.nextSequence) throw new Error("Die Aktionssequenz ist nicht gültig.");
    const encounterKey = session.encounterKey as EncounterKey;
    const encounter = getEncounter(encounterKey);
    const damage = damageForMcpAction(action);
    const bossHp = Math.max(0, session.bossHp - damage);
    await tx.insert(gameplayActionReceipts).values({ id: newEndgameId("gact"), sessionId: session.id, userId: values.userId, sequence: values.sequence, command: normalized, action, source: values.source, damage });
    await tx.update(gameplaySessions).set({ bossHp, nextSequence: session.nextSequence + 1 }).where(eq(gameplaySessions.id, session.id));
    let completedQuest: QuestKey | null = null;
    let dungeonKeyGranted: string | null = null;
    let reward = { xp: 0, points: 0 };
    let completedDungeon = false;
    if (bossHp === 0) {
      const now = new Date();
      await tx.update(gameplaySessions).set({ status: "completed", completedAt: now }).where(eq(gameplaySessions.id, session.id));
      if (encounter.questKey) {
        const quest = getQuest(encounter.questKey);
        const questProgress = (await tx.select().from(gameplayQuestProgress).where(and(eq(gameplayQuestProgress.userId, values.userId), eq(gameplayQuestProgress.questKey, quest.key), eq(gameplayQuestProgress.state, "active"))).limit(1))[0];
        if (!questProgress) throw new Error("Die aktive Quest konnte beim Bossabschluss nicht bestätigt werden.");
        completedQuest = quest.key;
        await tx.update(gameplayQuestProgress).set({ state: "ready_to_turn_in", readyAt: now, completionSessionId: session.id }).where(eq(gameplayQuestProgress.id, questProgress.id));
      } else if (encounter.key === "cinder_vault") {
        const profile = (await tx.select().from(playerProfiles).where(eq(playerProfiles.userId, values.userId)).limit(1))[0];
        if (!profile) throw new Error("Spielerprofil fehlt beim Dungeonabschluss.");
        reward = { xp: dungeonCompletionReward.xp, points: dungeonCompletionReward.points };
        completedDungeon = true;
        const totalXp = profile.totalXp + reward.xp;
        await tx.update(playerProfiles).set({ totalXp, level: levelFromTotalXp(totalXp), aurionPoints: profile.aurionPoints + reward.points, seasonPoints: profile.seasonPoints + reward.points, victories: profile.victories + 1 }).where(eq(playerProfiles.userId, values.userId));
        await tx.insert(progressionLedger).values([
          { id: newEndgameId("prog"), userId: values.userId, kind: "xp", delta: reward.xp, source: "dungeon:cinder_vault", reason: "Aschengewölbe gesichert", idempotencyKey: `dungeon:${session.id}:xp` },
          { id: newEndgameId("prog"), userId: values.userId, kind: "points", delta: reward.points, source: "dungeon:cinder_vault", reason: "Aschengewölbe gesichert", idempotencyKey: `dungeon:${session.id}:points` },
          { id: newEndgameId("prog"), userId: values.userId, kind: "victory", delta: 1, source: "dungeon:cinder_vault", reason: encounter.enemyName, idempotencyKey: `dungeon:${session.id}:victory` },
        ]);
      }
    }
    return { sessionId: session.id, encounterKey, action, damage, bossHp, maxBossHp: session.maxBossHp, completed: bossHp === 0, completedQuest, dungeonKeyGranted, completedDungeon, reward, nextSequence: session.nextSequence + 1 };
  });
  if (!resolution.completedDungeon) return { ...resolution, drop: null };
  const profile = await getOrCreatePlayerProfile(values.userId);
  const catalog = await db.select().from(treasureClasses).where(eq(treasureClasses.active, 1));
  const treasureClass = catalog.find(candidate => profile.level >= candidate.minLevel && profile.level <= candidate.maxLevel);
  if (!treasureClass) return { ...resolution, drop: null };
  const seedDigest = createHash("sha256").update(`aurion:dungeon:${resolution.sessionId}:seed`, "utf8").digest("hex");
  const resultDigest = createHash("sha256").update(`aurion:dungeon:${resolution.sessionId}:result`, "utf8").digest("hex");
  const resultReceipt = await recordValidatedExpeditionResult({
    userId: values.userId,
    expeditionKey: `dungeon:${resolution.sessionId}`,
    seedDigest,
    resultDigest,
    confirmedByUserId: values.userId,
    idempotencyKey: `dungeon:${resolution.sessionId}:result`,
  });
  const dropResult = await createLootDrop({
    userId: values.userId,
    expeditionKey: `dungeon:${resolution.sessionId}`,
    treasureClass: treasureClass.classKey,
    qualityRoll: (values.sequence * 631) % 10_000,
    affixRoll: (values.sequence * 929) % 10_000,
    magicFind: 0,
    itemLevel: Math.max(treasureClass.minLevel, Math.min(profile.level, treasureClass.maxLevel)),
    seedDigest,
    resultReceiptId: resultReceipt.receipt.id,
    idempotencyKey: `dungeon:${resolution.sessionId}:drop`,
  });
  const item = dropResult.itemId ? (await db.select().from(itemInstances).where(eq(itemInstances.id, dropResult.itemId)).limit(1))[0] : undefined;
  return { ...resolution, drop: item ? { id: item.id, baseItemKey: item.baseItemKey, quality: item.quality, itemLevel: item.itemLevel } : null };
}

export async function listLeaderboard(limit: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    userId: playerProfiles.userId,
    name: users.name,
    level: playerProfiles.level,
    points: playerProfiles.aurionPoints,
    victories: playerProfiles.victories,
    seasonPoints: playerProfiles.seasonPoints,
    selectedClass: playerProfiles.selectedClass,
  }).from(playerProfiles).leftJoin(users, eq(users.id, playerProfiles.userId)).orderBy(desc(playerProfiles.seasonPoints), desc(playerProfiles.victories), desc(playerProfiles.level)).limit(limit);
}

export async function choosePlayerClass(userId: number, playerClass: PlayerClass) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const profile = await getOrCreatePlayerProfile(userId);
  if (!canChooseClass(profile.level, profile.selectedClass)) throw new Error("Class choice is not available for this profile");
  await db.update(playerProfiles).set({ selectedClass: playerClass, classChosenAt: new Date() }).where(eq(playerProfiles.userId, userId));
  return getOrCreatePlayerProfile(userId);
}

export async function createGuildForFounder(values: { userId: number; name: string; tag: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const activeMembership = await db.select().from(guildMemberships).where(and(eq(guildMemberships.userId, values.userId), eq(guildMemberships.status, "active"))).limit(1);
  if (activeMembership[0]) throw new Error("Player already belongs to an active guild");
  const guildId = newEndgameId("guild");
  await db.insert(guilds).values({ id: guildId, name: values.name, tag: values.tag, founderUserId: values.userId });
  await db.insert(guildMemberships).values({ id: newEndgameId("gmem"), guildId, userId: values.userId, role: "founder", status: "active" });
  return { guildId };
}

export async function getActiveGuildForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const memberships = await db.select().from(guildMemberships).where(and(eq(guildMemberships.userId, userId), eq(guildMemberships.status, "active"))).limit(1);
  if (!memberships[0]) return undefined;
  const guild = await db.select().from(guilds).where(eq(guilds.id, memberships[0].guildId)).limit(1);
  return guild[0] ? { guild: guild[0], membership: memberships[0] } : undefined;
}

export async function grantProgress(values: { userId: number; kind: "xp" | "points" | "victory" | "weapon_xp"; delta: number; source: string; reason: string; idempotencyKey: string; weaponTrack?: WeaponTrack }) {
  if (!Number.isInteger(values.delta) || values.delta <= 0) throw new Error("Progression delta must be a positive integer");
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const previous = await db.select().from(progressionLedger).where(eq(progressionLedger.idempotencyKey, values.idempotencyKey)).limit(1);
  if (previous[0]) return { applied: false as const, profile: await getOrCreatePlayerProfile(values.userId) };
  const profile = await getOrCreatePlayerProfile(values.userId);
  await db.insert(progressionLedger).values({ id: newEndgameId("prog"), userId: values.userId, kind: values.kind, delta: values.delta, source: values.source, reason: values.reason, idempotencyKey: values.idempotencyKey });
  if (values.kind === "xp") {
    const totalXp = profile.totalXp + values.delta;
    await db.update(playerProfiles).set({ totalXp, level: levelFromTotalXp(totalXp) }).where(eq(playerProfiles.userId, values.userId));
  }
  if (values.kind === "points") {
    await db.update(playerProfiles).set({ aurionPoints: profile.aurionPoints + values.delta, seasonPoints: profile.seasonPoints + values.delta }).where(eq(playerProfiles.userId, values.userId));
  }
  if (values.kind === "victory") {
    await db.update(playerProfiles).set({ victories: profile.victories + values.delta }).where(eq(playerProfiles.userId, values.userId));
  }
  if (values.kind === "weapon_xp") {
    if (!values.weaponTrack) throw new Error("Weapon track is required for weapon XP");
    if (!canUseWeaponWithClass(profile.selectedClass, values.weaponTrack)) throw new Error("Weapon track is not available for the selected class");
    const prior = await db.select().from(weaponMasteries).where(and(eq(weaponMasteries.userId, values.userId), eq(weaponMasteries.weaponTrack, values.weaponTrack))).limit(1);
    const xp = (prior[0]?.xp ?? 0) + values.delta;
    const level = levelFromTotalXp(xp);
    if (prior[0]) await db.update(weaponMasteries).set({ xp, level }).where(eq(weaponMasteries.id, prior[0].id));
    else await db.insert(weaponMasteries).values({ id: newEndgameId("wm"), userId: values.userId, weaponTrack: values.weaponTrack, xp, level });
  }
  return { applied: true as const, profile: await getOrCreatePlayerProfile(values.userId) };
}

export async function listWeaponMasteries(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(weaponMasteries).where(eq(weaponMasteries.userId, userId));
}

export async function setWeaponLoadout(values: { userId: number; weaponTrack: WeaponTrack }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const profile = await getOrCreatePlayerProfile(values.userId);
  if (!canUseWeaponWithClass(profile.selectedClass, values.weaponTrack)) throw new Error("Weapon track is not available for the selected class");
  await db.insert(weaponLoadouts).values(values).onDuplicateKeyUpdate({ set: { weaponTrack: values.weaponTrack, configuredAt: new Date() } });
  const readback = await db.select().from(weaponLoadouts).where(eq(weaponLoadouts.userId, values.userId)).limit(1);
  if (!readback[0] || readback[0].weaponTrack !== values.weaponTrack) throw new Error("Weapon loadout readback failed");
  return readback[0];
}

export async function getWeaponLoadout(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(weaponLoadouts).where(eq(weaponLoadouts.userId, userId)).limit(1);
  return result[0];
}

type CatalogAffix = { key: string; slot: "prefix" | "suffix"; stats: Record<string, number> };

function parseCatalogEntries(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.length === 0 || !parsed.every(item => typeof item === "string" && item.length > 0)) throw new Error("Treasure class catalog has no valid entries");
  return parsed;
}

function parseAffix(row: { affixKey: string; slot: "prefix" | "suffix"; modifiersJson: string }): CatalogAffix {
  const parsed: unknown = JSON.parse(row.modifiersJson);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Loot affix modifiers must be an object");
  const stats = Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === "number"));
  return { key: row.affixKey, slot: row.slot, stats };
}

export async function createLootDrop(values: { userId: number; expeditionKey: string; treasureClass: string; qualityRoll: number; affixRoll: number; magicFind: number; itemLevel: number; seedDigest: string; resultReceiptId: string; idempotencyKey: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  await getAcceptedExpeditionResult(values);
  const definition = await db.select().from(treasureClasses).where(and(eq(treasureClasses.classKey, values.treasureClass), eq(treasureClasses.active, 1))).limit(1);
  if (!definition[0] || values.itemLevel < definition[0].minLevel || values.itemLevel > definition[0].maxLevel) throw new Error("Treasure class is unavailable for the item level");
  const entries = parseCatalogEntries(definition[0].entriesJson);
  const quality = rollLootQuality(values.qualityRoll, values.magicFind);
  const baseItemKey = entries[(values.qualityRoll + values.affixRoll) % entries.length]!;
  const candidates = await db.select().from(lootAffixes).where(and(eq(lootAffixes.active, 1), lte(lootAffixes.minItemLevel, values.itemLevel), gte(lootAffixes.maxItemLevel, values.itemLevel)));
  const prefix = candidates.filter(affix => affix.slot === "prefix");
  const suffix = candidates.filter(affix => affix.slot === "suffix");
  const affixes: LootAffix[] = quality === "normal" ? [] : [parseAffix(prefix[values.affixRoll % prefix.length] ?? (() => { throw new Error("No prefix affix is available"); })())];
  if (quality !== "normal" && quality !== "magic") affixes.push(parseAffix(suffix[Math.floor(values.affixRoll / 7) % suffix.length] ?? (() => { throw new Error("No suffix affix is available"); })()));
  const setDefinition = quality === "set" ? (await db.select().from(lootSetDefinitions).where(eq(lootSetDefinitions.active, 1))).find(candidate => parseCatalogEntries(candidate.piecesJson).includes(baseItemKey)) : undefined;
  return db.transaction(async tx => {
    const previous = await tx.select().from(lootDropReceipts).where(eq(lootDropReceipts.idempotencyKey, values.idempotencyKey)).limit(1);
    if (previous[0]) return { applied: false as const, receiptId: previous[0].id };
    const receiptId = newEndgameId("drop");
    const itemId = newEndgameId("item");
    await tx.insert(lootDropReceipts).values({ id: receiptId, userId: values.userId, expeditionKey: values.expeditionKey, treasureClass: values.treasureClass, quality, seedDigest: values.seedDigest, idempotencyKey: values.idempotencyKey });
    await tx.insert(itemInstances).values({ id: itemId, ownerUserId: values.userId, lootReceiptId: receiptId, baseItemKey, quality, itemLevel: values.itemLevel, affixesJson: JSON.stringify(affixes), setKey: setDefinition?.setKey });
    return { applied: true as const, receiptId, itemId, quality };
  });
}

export async function listSetBonusesForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const owned = await db.select().from(itemInstances).where(eq(itemInstances.ownerUserId, userId));
  const definitions = await db.select().from(lootSetDefinitions).where(eq(lootSetDefinitions.active, 1));
  return definitions.flatMap(definition => {
    const pieces = parseCatalogEntries(definition.piecesJson);
    const count = owned.filter(item => item.setKey === definition.setKey && pieces.includes(item.baseItemKey)).length;
    const bonuses: unknown = JSON.parse(definition.bonusesJson);
    if (!Array.isArray(bonuses)) return [];
    const active = bonuses.filter((bonus): bonus is { pieces: number; modifiers: Record<string, number> } => Boolean(bonus) && typeof bonus === "object" && !Array.isArray(bonus) && typeof (bonus as { pieces?: unknown }).pieces === "number" && Boolean((bonus as { modifiers?: unknown }).modifiers) && typeof (bonus as { modifiers: unknown }).modifiers === "object" && count >= (bonus as { pieces: number }).pieces);
    return active.map(bonus => ({ setKey: definition.setKey, displayName: definition.displayName, piecesOwned: count, piecesTotal: pieces.length, modifiers: bonus.modifiers }));
  });
}

export async function listInventoryForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const items = await db.select().from(itemInstances).where(and(eq(itemInstances.ownerUserId, userId), eq(itemInstances.status, "owned"))).orderBy(desc(itemInstances.createdAt)).limit(100);
  return items.map(item => {
    let affixes: LootAffix[] = [];
    try {
      const parsed: unknown = JSON.parse(item.affixesJson);
      if (Array.isArray(parsed)) {
        affixes = parsed.filter((affix): affix is LootAffix => Boolean(affix) && typeof affix === "object" && !Array.isArray(affix) && typeof (affix as { key?: unknown }).key === "string" && ((affix as { slot?: unknown }).slot === "prefix" || (affix as { slot?: unknown }).slot === "suffix") && Boolean((affix as { stats?: unknown }).stats) && typeof (affix as { stats: unknown }).stats === "object");
      }
    } catch {
      affixes = [];
    }
    return { ...item, affixes };
  });
}

type CraftingItemView = {
  id: string;
  baseItemKey: string;
  quality: CraftingItemQuality;
  itemLevel: number;
  affixes: CraftingAffix[];
};

function parseCraftingAffixes(value: string): CraftingAffix[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((affix): affix is CraftingAffix => Boolean(affix) && typeof affix === "object" && !Array.isArray(affix) && typeof (affix as { key?: unknown }).key === "string" && ((affix as { slot?: unknown }).slot === "prefix" || (affix as { slot?: unknown }).slot === "suffix") && Boolean((affix as { stats?: unknown }).stats) && typeof (affix as { stats: unknown }).stats === "object");
  } catch {
    return [];
  }
}

function craftingItemView(item: { id: string; baseItemKey: string; quality: string; itemLevel: number; affixesJson: string }): CraftingItemView {
  return { id: item.id, baseItemKey: item.baseItemKey, quality: item.quality as CraftingItemQuality, itemLevel: item.itemLevel, affixes: parseCraftingAffixes(item.affixesJson) };
}

/** Readmodel-only crafting history. The client cannot derive or mutate a recipe result from this view. */
export async function getCraftingReadmodel(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const [receipts, outputs, progression] = await Promise.all([
    db.select().from(craftingReceipts).where(eq(craftingReceipts.userId, userId)).orderBy(desc(craftingReceipts.createdAt)).limit(30),
    db.select().from(itemInstances).where(and(eq(itemInstances.ownerUserId, userId), eq(itemInstances.status, "owned"), eq(itemInstances.sourceKind, "crafting"), isNotNull(itemInstances.craftingReceiptId))).orderBy(desc(itemInstances.createdAt)).limit(100),
    getExactSkillProgressionReadmodel(userId, "crafting"),
  ]);
  return {
    receipts: receipts.map(receipt => ({ id: receipt.id, recipeKey: receipt.recipeKey, receiptDigest: receipt.receiptDigest, resolutionIndex: receipt.resolutionIndex, createdAt: receipt.createdAt })),
    outputs: outputs.map(craftingItemView),
    progression,
  };
}

/**
 * Resolves one Aurion-native recipe through a single database transaction. The browser may name a
 * recipe and an inventory item, but ownership, eligibility, output, receipt, resolution index and
 * exact Crafting XP are resolved exclusively by the server.
 */
export async function craftItemForUser(values: { userId: number; recipeKey: string; inputItemId: string }) {
  if (!Number.isSafeInteger(values.userId) || values.userId <= 0) throw new Error("Ungültige Crafting-Spielerkennung.");
  if (!values.recipeKey || values.recipeKey.length > 96) throw new Error("Ungültiger Crafting-Rezeptschlüssel.");
  if (!values.inputItemId || values.inputItemId.length > 64) throw new Error("Ungültige Crafting-Eingabe.");
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  // One immutable input can resolve one recipe once. The key is server-derived because the client
  // never supplies an authority-bearing retry token, receipt, XP amount, output or user identity.
  const idempotencyKey = `craft:${values.userId}:${values.recipeKey}:${values.inputItemId}`;
  return db.transaction(async tx => {
    // Serialize every crafting resolution for a player. It makes the persisted count a stable
    // resolution-index source and lets concurrent retries observe the committed receipt.
    const profile = (await tx.select().from(playerProfiles).where(eq(playerProfiles.userId, values.userId)).for("update").limit(1))[0];
    if (!profile) throw new Error("Ein bestätigtes Aurion-Spielerprofil ist für Crafting erforderlich.");

    const replay = (await tx.select().from(craftingReceipts).where(eq(craftingReceipts.idempotencyKey, idempotencyKey)).limit(1))[0];
    if (replay) {
      const output = (await tx.select().from(itemInstances).where(and(eq(itemInstances.craftingReceiptId, replay.id), eq(itemInstances.sourceKind, "crafting"))).limit(1))[0];
      const event = (await tx.select().from(skillProgressionEvents).where(and(eq(skillProgressionEvents.userId, values.userId), eq(skillProgressionEvents.resultReceiptId, replay.id), eq(skillProgressionEvents.receiptKind, "crafting"), eq(skillProgressionEvents.skillId, "crafting"))).limit(1))[0];
      if (!output || !event) throw new Error("Crafting-Receipt besitzt keine vollständige bestätigte Wirkung.");
      return { applied: false as const, receipt: replay, output: craftingItemView(output), skillEvent: event };
    }

    const inputItem = (await tx.select().from(itemInstances).where(and(eq(itemInstances.id, values.inputItemId), eq(itemInstances.ownerUserId, values.userId), eq(itemInstances.status, "owned"))).for("update").limit(1))[0];
    if (!inputItem) throw new Error("Der Crafting-Gegenstand ist nicht verfügbar oder gehört dir nicht.");
    const planResolution = resolveAurionCraftingPlan({ recipeKey: values.recipeKey, playerLevel: profile.level, item: craftingItemView(inputItem) });
    if (!planResolution.ok) throw new Error(`Crafting abgewiesen: ${planResolution.reason}.`);

    const receiptRows = await tx.select({ count: sql<number>`count(*)` }).from(craftingReceipts).where(eq(craftingReceipts.userId, values.userId));
    const resolutionIndex = resolveCraftingResolutionIndex(Number(receiptRows[0]?.count ?? 0));
    const receiptId = newEndgameId("craft");
    const receiptDigest = craftingReceiptDigest({ userId: values.userId, idempotencyKey, plan: planResolution.plan, resolutionIndex });
    const outputId = newEndgameId("crafted");
    const skillEventId = newEndgameId("skillev");
    const consumed = await tx.update(itemInstances).set({ status: "consumed" }).where(and(eq(itemInstances.id, inputItem.id), eq(itemInstances.ownerUserId, values.userId), eq(itemInstances.status, "owned")));
    if (affectedRowCount(consumed) !== 1) throw new Error("Der Crafting-Gegenstand wurde parallel verändert.");

    await tx.insert(craftingReceipts).values({
      id: receiptId,
      userId: values.userId,
      recipeKey: planResolution.plan.recipe.key,
      recipeDigest: planResolution.plan.recipeDigest,
      ruleSetVersion: planResolution.plan.recipe.ruleSetVersion,
      contentVersion: planResolution.plan.recipe.contentVersion,
      inputItemId: inputItem.id,
      receiptDigest,
      resolutionIndex,
      idempotencyKey,
    });
    await tx.insert(itemInstances).values({
      id: outputId,
      ownerUserId: values.userId,
      sourceKind: "crafting",
      craftingReceiptId: receiptId,
      baseItemKey: planResolution.plan.output.baseItemKey,
      quality: planResolution.plan.output.quality,
      itemLevel: inputItem.itemLevel,
      affixesJson: JSON.stringify(planResolution.plan.output.affixes),
    });
    // `recordValidatedSkillProgressionEvent` remains deliberately expedition-only. This sibling
    // path writes only after its same-player Crafting receipt exists in this transaction and labels
    // the generic receipt reference explicitly as `crafting` for readmodel and audit consumers.
    await tx.insert(skillProgressionEvents).values({
      id: skillEventId,
      userId: values.userId,
      skillId: "crafting",
      amountExact: planResolution.plan.recipe.craftingXpExact,
      source: "crafting",
      resultReceiptId: receiptId,
      receiptKind: "crafting",
      resolutionIndex,
      idempotencyKey: `skill:${idempotencyKey}`,
    });
    const receipt = (await tx.select().from(craftingReceipts).where(eq(craftingReceipts.id, receiptId)).limit(1))[0];
    const output = (await tx.select().from(itemInstances).where(and(eq(itemInstances.id, outputId), eq(itemInstances.craftingReceiptId, receiptId), eq(itemInstances.sourceKind, "crafting"))).limit(1))[0];
    const skillEvent = (await tx.select().from(skillProgressionEvents).where(and(eq(skillProgressionEvents.id, skillEventId), eq(skillProgressionEvents.receiptKind, "crafting"))).limit(1))[0];
    if (!receipt || !output || !skillEvent) throw new Error("Crafting-Readback nach Transaktion fehlgeschlagen.");
    return { applied: true as const, receipt, output: craftingItemView(output), skillEvent };
  });
}

export async function listMyMarketListings(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: marketListings.id, askingPrice: marketListings.askingPrice, status: marketListings.status, createdAt: marketListings.createdAt, itemId: itemInstances.id, baseItemKey: itemInstances.baseItemKey, quality: itemInstances.quality, itemLevel: itemInstances.itemLevel })
    .from(marketListings).innerJoin(itemInstances, eq(itemInstances.id, marketListings.itemId)).where(eq(marketListings.sellerUserId, userId)).orderBy(desc(marketListings.createdAt)).limit(100);
}

export async function listActiveMarketListings(limit: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: marketListings.id, itemId: itemInstances.id, askingPrice: marketListings.askingPrice, createdAt: marketListings.createdAt, sellerUserId: marketListings.sellerUserId, sellerName: users.name, baseItemKey: itemInstances.baseItemKey, quality: itemInstances.quality, itemLevel: itemInstances.itemLevel })
    .from(marketListings).innerJoin(itemInstances, eq(itemInstances.id, marketListings.itemId)).leftJoin(users, eq(users.id, marketListings.sellerUserId)).where(eq(marketListings.status, "active")).orderBy(desc(marketListings.createdAt)).limit(limit);
}

export async function sellItemToSystem(values: { itemId: string; sellerUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const item = (await tx.select().from(itemInstances).where(and(eq(itemInstances.id, values.itemId), eq(itemInstances.ownerUserId, values.sellerUserId), eq(itemInstances.status, "owned"))).limit(1))[0];
    if (!item) throw new Error("Der Gegenstand ist nicht verfügbar oder gehört dir nicht.");
    const aurionGranted = systemSaleValue(item.itemLevel, item.quality as MarketQuality);
    const now = new Date();
    await tx.insert(playerProfiles).values({ userId: values.sellerUserId }).onDuplicateKeyUpdate({ set: { userId: values.sellerUserId } });
    await tx.insert(systemSaleReceipts).values({ id: newCommunityId("syssale"), itemId: item.id, sellerUserId: values.sellerUserId, aurionGranted });
    await tx.update(itemInstances).set({ status: "sold", soldAt: now }).where(and(eq(itemInstances.id, item.id), eq(itemInstances.status, "owned")));
    await tx.update(playerProfiles).set({ aurionPoints: sql`${playerProfiles.aurionPoints} + ${aurionGranted}` }).where(eq(playerProfiles.userId, values.sellerUserId));
    return { aurionGranted, itemId: item.id };
  });
}

export async function createMarketListing(values: { itemId: string; sellerUserId: number; askingPrice: number }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const askingPrice = assertMarketPrice(values.askingPrice);
  return db.transaction(async tx => {
    const item = (await tx.select().from(itemInstances).where(and(eq(itemInstances.id, values.itemId), eq(itemInstances.ownerUserId, values.sellerUserId), eq(itemInstances.status, "owned"))).limit(1))[0];
    if (!item) throw new Error("Dieser Gegenstand kann nicht angeboten werden.");
    const id = newCommunityId("listing");
    await tx.insert(marketListings).values({ id, itemId: item.id, sellerUserId: values.sellerUserId, askingPrice });
    await tx.update(itemInstances).set({ status: "listed" }).where(and(eq(itemInstances.id, item.id), eq(itemInstances.status, "owned")));
    return { id, askingPrice };
  });
}

export async function cancelMarketListing(values: { listingId: string; sellerUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const listing = (await tx.select().from(marketListings).where(and(eq(marketListings.id, values.listingId), eq(marketListings.sellerUserId, values.sellerUserId), eq(marketListings.status, "active"))).limit(1))[0];
    if (!listing) throw new Error("Dieses Angebot kann nicht zurückgenommen werden.");
    await tx.update(marketListings).set({ status: "cancelled", settledAt: new Date() }).where(and(eq(marketListings.id, listing.id), eq(marketListings.status, "active")));
    await tx.update(itemInstances).set({ status: "owned" }).where(and(eq(itemInstances.id, listing.itemId), eq(itemInstances.status, "listed")));
    return { cancelled: true as const };
  });
}

export async function buyMarketListing(values: { listingId: string; buyerUserId: number; idempotencyKey: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const prior = (await tx.select().from(marketTransactionReceipts).where(eq(marketTransactionReceipts.idempotencyKey, values.idempotencyKey)).limit(1))[0];
    if (prior) return { applied: false as const, receipt: prior };
    const listing = (await tx.select().from(marketListings).where(and(eq(marketListings.id, values.listingId), eq(marketListings.status, "active"))).limit(1))[0];
    if (!listing) throw new Error("Dieses Angebot ist nicht mehr verfügbar.");
    assertNotOwnListing(listing.sellerUserId, values.buyerUserId);
    await tx.insert(playerProfiles).values([{ userId: values.buyerUserId }, { userId: listing.sellerUserId }]).onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });
    const buyer = (await tx.select().from(playerProfiles).where(eq(playerProfiles.userId, values.buyerUserId)).limit(1))[0];
    if (!buyer || buyer.aurionPoints < listing.askingPrice) throw new Error("Deine Aurion-Währung reicht für dieses Angebot nicht aus.");
    const item = (await tx.select().from(itemInstances).where(and(eq(itemInstances.id, listing.itemId), eq(itemInstances.status, "listed"), eq(itemInstances.ownerUserId, listing.sellerUserId))).limit(1))[0];
    if (!item) throw new Error("Der angebotene Gegenstand ist nicht mehr verfügbar.");
    const receiptId = newCommunityId("marketrec");
    const now = new Date();
    await tx.update(playerProfiles).set({ aurionPoints: sql`${playerProfiles.aurionPoints} - ${listing.askingPrice}` }).where(eq(playerProfiles.userId, values.buyerUserId));
    await tx.update(playerProfiles).set({ aurionPoints: sql`${playerProfiles.aurionPoints} + ${listing.askingPrice}` }).where(eq(playerProfiles.userId, listing.sellerUserId));
    await tx.update(itemInstances).set({ ownerUserId: values.buyerUserId, status: "owned" }).where(and(eq(itemInstances.id, item.id), eq(itemInstances.status, "listed")));
    await tx.update(marketListings).set({ status: "sold", buyerUserId: values.buyerUserId, settledAt: now }).where(and(eq(marketListings.id, listing.id), eq(marketListings.status, "active")));
    await tx.insert(marketTransactionReceipts).values({ id: receiptId, listingId: listing.id, itemId: item.id, sellerUserId: listing.sellerUserId, buyerUserId: values.buyerUserId, aurionTransferred: listing.askingPrice, idempotencyKey: values.idempotencyKey });
    const receipt = (await tx.select().from(marketTransactionReceipts).where(eq(marketTransactionReceipts.id, receiptId)).limit(1))[0];
    if (!receipt) throw new Error("Markttransaktion readback failed");
    return { applied: true as const, receipt };
  });
}

export async function recordValidatedWeaponEvent(values: { userId: number; expeditionKey: string; seedDigest: string; resultReceiptId: string; weaponTrack: WeaponTrack; actionKey: string; xpGranted: number; idempotencyKey: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  await getAcceptedExpeditionResult(values);
  const profile = await getOrCreatePlayerProfile(values.userId);
  if (!canUseWeaponWithClass(profile.selectedClass, values.weaponTrack)) throw new Error("Weapon track is not available for the selected class");
  const loadout = await getWeaponLoadout(values.userId);
  if (!loadout || loadout.weaponTrack !== values.weaponTrack) throw new Error("Weapon track is not equipped in the server loadout");
  if (!isWeaponActionAllowed(values.weaponTrack, values.actionKey)) throw new Error("Weapon action is not allowed for the equipped track");
  return db.transaction(async tx => {
    const previous = await tx.select().from(weaponMasteryReceipts).where(eq(weaponMasteryReceipts.idempotencyKey, values.idempotencyKey)).limit(1);
    if (previous[0]) return { applied: false as const, profile: await getOrCreatePlayerProfile(values.userId) };
    const rewardKey = `weapon:${values.idempotencyKey}`;
    const priorReward = await tx.select().from(progressionLedger).where(eq(progressionLedger.idempotencyKey, rewardKey)).limit(1);
    if (priorReward[0]) throw new Error("Weapon reward receipt already exists without its matching weapon receipt");
    const priorMastery = await tx.select().from(weaponMasteries).where(and(eq(weaponMasteries.userId, values.userId), eq(weaponMasteries.weaponTrack, values.weaponTrack))).limit(1);
    const xp = (priorMastery[0]?.xp ?? 0) + values.xpGranted;
    const level = levelFromTotalXp(xp);
    await tx.insert(weaponMasteryReceipts).values({ id: newEndgameId("wrec"), userId: values.userId, expeditionKey: values.expeditionKey, weaponTrack: values.weaponTrack, actionKey: values.actionKey, xpGranted: values.xpGranted, idempotencyKey: values.idempotencyKey });
    if (priorMastery[0]) await tx.update(weaponMasteries).set({ xp, level }).where(eq(weaponMasteries.id, priorMastery[0].id));
    else await tx.insert(weaponMasteries).values({ id: newEndgameId("wm"), userId: values.userId, weaponTrack: values.weaponTrack, xp, level });
    await tx.insert(progressionLedger).values({ id: newEndgameId("prog"), userId: values.userId, kind: "weapon_xp", delta: values.xpGranted, source: "validated-expedition", reason: `${values.expeditionKey}:${values.actionKey}`, idempotencyKey: rewardKey });
    return { applied: true as const, profile: await getOrCreatePlayerProfile(values.userId) };
  });
}

export async function listGlbAssets() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(glbAssets).orderBy(desc(glbAssets.createdAt)).limit(100);
}

export async function createGlbAssetMetadata(values: { displayName: string; assetType: "character" | "enemy" | "weapon" | "armor" | "arena"; storageKey: string; storageUrl: string; sha256: string; bytes: number; createdByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const id = newEndgameId("glb");
  await db.insert(glbAssets).values({ id, ...values });
  return id;
}

export async function listMonetizationPlacements() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(monetizationPlacements).orderBy(monetizationPlacements.placementKey).limit(100);
}

type AssetType = "character" | "enemy" | "weapon" | "armor" | "arena";
type AssetReviewStatus = "approved" | "rejected" | "archived";
type MonetizationKind = "banner" | "offerwall" | "vote_list";

export async function listAdminPlayers(values: { limit: number; query?: string }) {
  const db = await getDb();
  if (!db) return [];
  const query = values.query?.trim();
  const base = db.select({
    userId: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    lastSignedIn: users.lastSignedIn,
    level: playerProfiles.level,
    totalXp: playerProfiles.totalXp,
    aurionPoints: playerProfiles.aurionPoints,
    victories: playerProfiles.victories,
    selectedClass: playerProfiles.selectedClass,
    guildName: guilds.name,
    guildTag: guilds.tag,
    guildRole: guildMemberships.role,
  }).from(users)
    .leftJoin(playerProfiles, eq(playerProfiles.userId, users.id))
    .leftJoin(guildMemberships, and(eq(guildMemberships.userId, users.id), eq(guildMemberships.status, "active")))
    .leftJoin(guilds, eq(guilds.id, guildMemberships.guildId));
  const filtered = query ? base.where(or(like(users.name, `%${query}%`), like(users.email, `%${query}%`))) : base;
  return filtered.orderBy(desc(users.lastSignedIn)).limit(values.limit);
}

export async function getGlbAsset(assetId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(glbAssets).where(eq(glbAssets.id, assetId)).limit(1);
  return result[0];
}

export async function uploadGlbAsset(values: { displayName: string; assetType: AssetType; contentBase64: string; createdByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const payload = decodeValidatedGlbBase64(values.contentBase64);
  const existing = await db.select().from(glbAssets).where(eq(glbAssets.sha256, payload.sha256)).limit(1);
  if (existing[0]) return { asset: existing[0], deduplicated: true as const };

  const stored = await storagePut(`aurion/glb/${values.createdByUserId}/${payload.sha256}.glb`, payload.bytes, "model/gltf-binary");
  const id = newEndgameId("glb");
  await db.insert(glbAssets).values({
    id,
    displayName: values.displayName,
    assetType: values.assetType,
    storageKey: stored.key,
    storageUrl: stored.url,
    sha256: payload.sha256,
    bytes: payload.bytes.length,
    status: "draft",
    createdByUserId: values.createdByUserId,
  });
  const asset = await getGlbAsset(id);
  if (!asset) throw new Error("GLB metadata readback failed");
  return { asset, deduplicated: false as const };
}

export async function submitPlayerGlbAsset(values: { submittedByUserId: number; assetType: AssetType; subcategory: string; displayName: string; description: string; visibility: "private" | "public"; contentBase64: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  if (values.assetType !== "character" && values.visibility !== "public") throw new Error("Nur persönliche Charaktermodelle dürfen privat eingereicht werden.");
  const payload = decodeValidatedGlbBase64(values.contentBase64, USER_GLB_MAX_BYTES);
  const duplicate = (await db.select().from(glbAssetSubmissions).where(and(eq(glbAssetSubmissions.submittedByUserId, values.submittedByUserId), eq(glbAssetSubmissions.sha256, payload.sha256), eq(glbAssetSubmissions.status, "pending"))).limit(1))[0];
  if (duplicate) return { submission: duplicate, deduplicated: true as const };
  const id = newEndgameId("glbsub");
  const stored = await storagePut(`aurion/submissions/glb/${values.submittedByUserId}/${id}-${payload.sha256}.glb`, payload.bytes, "model/gltf-binary");
  await db.insert(glbAssetSubmissions).values({ id, submittedByUserId: values.submittedByUserId, assetType: values.assetType, subcategory: values.subcategory, displayName: values.displayName, description: values.description, visibility: values.visibility, storageKey: stored.key, storageUrl: stored.url, sha256: payload.sha256, bytes: payload.bytes.length });
  const submission = (await db.select().from(glbAssetSubmissions).where(eq(glbAssetSubmissions.id, id)).limit(1))[0];
  if (!submission) throw new Error("GLB submission readback failed");
  return { submission, deduplicated: false as const };
}

export async function listMyGlbSubmissions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(glbAssetSubmissions).where(eq(glbAssetSubmissions.submittedByUserId, userId)).orderBy(desc(glbAssetSubmissions.createdAt)).limit(100);
}

export async function listVisibleGlbCatalog(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: glbAssets.id, displayName: glbAssets.displayName, assetType: glbAssets.assetType, storageUrl: glbAssets.storageUrl, bytes: glbAssets.bytes, createdAt: glbAssets.createdAt, visibility: glbAssetSubmissions.visibility, submittedByUserId: glbAssetSubmissions.submittedByUserId, subcategory: glbAssetSubmissions.subcategory, description: glbAssetSubmissions.description })
    .from(glbAssets).leftJoin(glbAssetSubmissions, eq(glbAssetSubmissions.approvedAssetId, glbAssets.id))
    .where(and(eq(glbAssets.status, "approved"), or(isNull(glbAssetSubmissions.id), eq(glbAssetSubmissions.visibility, "public"), eq(glbAssetSubmissions.submittedByUserId, userId))))
    .orderBy(desc(glbAssets.createdAt)).limit(100);
}

export async function listPublicGlbCatalog() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: glbAssets.id, displayName: glbAssets.displayName, assetType: glbAssets.assetType, storageUrl: glbAssets.storageUrl, bytes: glbAssets.bytes, createdAt: glbAssets.createdAt, visibility: glbAssetSubmissions.visibility, subcategory: glbAssetSubmissions.subcategory, description: glbAssetSubmissions.description })
    .from(glbAssets).innerJoin(glbAssetSubmissions, eq(glbAssetSubmissions.approvedAssetId, glbAssets.id))
    .where(and(eq(glbAssets.status, "approved"), eq(glbAssetSubmissions.visibility, "public"))).orderBy(desc(glbAssets.createdAt)).limit(100);
}

export async function getPlayerCharacterAppearance(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  return (await db.select({ assetId: playerCharacterAppearances.assetId, visibility: playerCharacterAppearances.visibility, equippedAt: playerCharacterAppearances.equippedAt, displayName: glbAssets.displayName, storageUrl: glbAssets.storageUrl }).from(playerCharacterAppearances).innerJoin(glbAssets, eq(glbAssets.id, playerCharacterAppearances.assetId)).where(eq(playerCharacterAppearances.userId, userId)).limit(1))[0];
}

export async function equipPlayerCharacterAppearance(values: { userId: number; assetId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const asset = (await db.select({ id: glbAssets.id, assetType: glbAssets.assetType, status: glbAssets.status, visibility: glbAssetSubmissions.visibility, submittedByUserId: glbAssetSubmissions.submittedByUserId }).from(glbAssets).leftJoin(glbAssetSubmissions, eq(glbAssetSubmissions.approvedAssetId, glbAssets.id)).where(eq(glbAssets.id, values.assetId)).limit(1))[0];
  if (!asset || asset.assetType !== "character" || asset.status !== "approved") throw new Error("Dieses Charaktermodell ist nicht freigegeben.");
  if (asset.visibility === "private" && asset.submittedByUserId !== values.userId) throw new Error("Private Charaktermodelle dürfen nur vom einreichenden Explorer verwendet werden.");
  await db.insert(playerCharacterAppearances).values({ userId: values.userId, assetId: asset.id, visibility: asset.visibility ?? "public" }).onDuplicateKeyUpdate({ set: { assetId: asset.id, visibility: asset.visibility ?? "public" } });
  const appearance = await getPlayerCharacterAppearance(values.userId);
  if (!appearance || appearance.assetId !== asset.id) throw new Error("Charakterauswahl konnte nicht bestätigt werden.");
  return appearance;
}

export async function listPendingGlbSubmissions() {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: glbAssetSubmissions.id, submittedByUserId: glbAssetSubmissions.submittedByUserId, assetType: glbAssetSubmissions.assetType, subcategory: glbAssetSubmissions.subcategory, displayName: glbAssetSubmissions.displayName, description: glbAssetSubmissions.description, visibility: glbAssetSubmissions.visibility, storageUrl: glbAssetSubmissions.storageUrl, bytes: glbAssetSubmissions.bytes, sha256: glbAssetSubmissions.sha256, createdAt: glbAssetSubmissions.createdAt, submitterName: users.name, submitterEmail: users.email }).from(glbAssetSubmissions).leftJoin(users, eq(users.id, glbAssetSubmissions.submittedByUserId)).where(eq(glbAssetSubmissions.status, "pending")).orderBy(desc(glbAssetSubmissions.createdAt)).limit(100);
}

export async function reviewPlayerGlbSubmission(values: { submissionId: string; reviewedByUserId: number; decision: "approved" | "rejected"; reviewNote?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const submission = (await tx.select().from(glbAssetSubmissions).where(and(eq(glbAssetSubmissions.id, values.submissionId), eq(glbAssetSubmissions.status, "pending"))).limit(1))[0];
    if (!submission) throw new Error("Diese Einreichung ist nicht mehr offen.");
    const reviewedAt = new Date();
    if (values.decision === "rejected") {
      await tx.update(glbAssetSubmissions).set({ status: "rejected", reviewNote: values.reviewNote ?? null, reviewedByUserId: values.reviewedByUserId, reviewedAt }).where(eq(glbAssetSubmissions.id, submission.id));
      return { approved: false as const, assetId: null };
    }
    const assetId = newEndgameId("glb");
    await tx.insert(glbAssets).values({ id: assetId, displayName: submission.displayName, assetType: submission.assetType, storageKey: submission.storageKey, storageUrl: submission.storageUrl, sha256: submission.sha256, bytes: submission.bytes, status: "approved", createdByUserId: submission.submittedByUserId, reviewedByUserId: values.reviewedByUserId, reviewedAt });
    if (submission.assetType === "character") await tx.insert(playerCharacterAppearances).values({ userId: submission.submittedByUserId, assetId, visibility: submission.visibility }).onDuplicateKeyUpdate({ set: { assetId, visibility: submission.visibility } });
    await tx.update(glbAssetSubmissions).set({ status: "approved", reviewNote: values.reviewNote ?? null, reviewedByUserId: values.reviewedByUserId, reviewedAt, approvedAssetId: assetId }).where(eq(glbAssetSubmissions.id, submission.id));
    return { approved: true as const, assetId };
  });
}

export async function setGlbAssetReview(values: { assetId: string; status: AssetReviewStatus; reviewedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const existing = await getGlbAsset(values.assetId);
  if (!existing) throw new Error("GLB asset does not exist");
  await db.update(glbAssets).set({ status: values.status, reviewedByUserId: values.reviewedByUserId, reviewedAt: new Date() }).where(eq(glbAssets.id, values.assetId));
  const asset = await getGlbAsset(values.assetId);
  if (!asset || asset.status !== values.status || asset.reviewedByUserId !== values.reviewedByUserId) throw new Error("GLB review readback failed");
  return asset;
}

export async function listGlbAssignments() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: glbAssignments.id,
    assetId: glbAssignments.assetId,
    targetType: glbAssignments.targetType,
    targetKey: glbAssignments.targetKey,
    active: glbAssignments.active,
    createdAt: glbAssignments.createdAt,
    displayName: glbAssets.displayName,
    assetStatus: glbAssets.status,
  }).from(glbAssignments).innerJoin(glbAssets, eq(glbAssets.id, glbAssignments.assetId)).orderBy(desc(glbAssignments.createdAt)).limit(100);
}

export async function getActiveGlbAssignment(targetType: AssetType, targetKey: string) {
  const db = await getDb();
  if (!db) return null;
  return (await db.select({ assetId: glbAssets.id, displayName: glbAssets.displayName, assetType: glbAssets.assetType, storageUrl: glbAssets.storageUrl, targetKey: glbAssignments.targetKey })
    .from(glbAssignments).innerJoin(glbAssets, eq(glbAssets.id, glbAssignments.assetId))
    .where(and(eq(glbAssignments.targetType, targetType), eq(glbAssignments.targetKey, targetKey), eq(glbAssignments.active, 1), eq(glbAssets.status, "approved"))).limit(1))[0] ?? null;
}

export async function assignApprovedGlbAsset(values: { assetId: string; targetType: AssetType; targetKey: string; assignedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const asset = await getGlbAsset(values.assetId);
  if (!asset || asset.status !== "approved") throw new Error("Only approved GLB assets can be assigned");
  if (asset.assetType !== values.targetType) throw new Error("GLB asset type does not match assignment target");

  const assignmentId = newEndgameId("assign");
  await db.transaction(async tx => {
    await tx.update(glbAssignments).set({ active: 0 }).where(and(eq(glbAssignments.targetType, values.targetType), eq(glbAssignments.targetKey, values.targetKey), eq(glbAssignments.active, 1)));
    await tx.insert(glbAssignments).values({ id: assignmentId, assetId: values.assetId, targetType: values.targetType, targetKey: values.targetKey, active: 1, assignedByUserId: values.assignedByUserId });
  });
  const assignment = (await listGlbAssignments()).find(entry => entry.id === assignmentId);
  if (!assignment || assignment.active !== 1) throw new Error("GLB assignment readback failed");
  return assignment;
}

export async function upsertMonetizationPlacement(values: { placementKey: string; kind: MonetizationKind; providerLabel: string; active: boolean; consentRequired: boolean; configurationJson: string; updatedByUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const configurationJson = normalizeSafePlacementConfiguration(values.configurationJson);
  const existing = await db.select().from(monetizationPlacements).where(eq(monetizationPlacements.placementKey, values.placementKey)).limit(1);
  const update = { kind: values.kind, providerLabel: values.providerLabel, active: values.active ? 1 : 0, consentRequired: values.consentRequired ? 1 : 0, configurationJson, updatedByUserId: values.updatedByUserId };
  if (existing[0]) {
    await db.update(monetizationPlacements).set(update).where(eq(monetizationPlacements.id, existing[0].id));
  } else {
    await db.insert(monetizationPlacements).values({ id: newEndgameId("placement"), placementKey: values.placementKey, ...update });
  }
  const persisted = await db.select().from(monetizationPlacements).where(eq(monetizationPlacements.placementKey, values.placementKey)).limit(1);
  if (!persisted[0] || persisted[0].configurationJson !== configurationJson) throw new Error("Monetization placement readback failed");
  return persisted[0];
}

type UserRole = "user" | "admin";

export async function setManagedUserRole(values: { actorUserId: number; targetUserId: number; role: UserRole }) {
  if (values.actorUserId === values.targetUserId) throw new Error("Administrators cannot change their own role");
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const target = await db.select().from(users).where(eq(users.id, values.targetUserId)).limit(1);
  if (!target[0]) throw new Error("Managed user does not exist");
  if (target[0].openId === ENV.ownerOpenId) throw new Error("The project owner role is immutable through this route");
  await db.update(users).set({ role: values.role }).where(eq(users.id, values.targetUserId));
  const readback = await db.select().from(users).where(eq(users.id, values.targetUserId)).limit(1);
  if (!readback[0] || readback[0].role !== values.role) throw new Error("Managed user role readback failed");
  return readback[0];
}

export async function listAdminLiveLeaderboard(limit: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    userId: playerProfiles.userId,
    name: users.name,
    email: users.email,
    level: playerProfiles.level,
    seasonPoints: playerProfiles.seasonPoints,
    victories: playerProfiles.victories,
    selectedClass: playerProfiles.selectedClass,
  }).from(playerProfiles).leftJoin(users, eq(users.id, playerProfiles.userId)).orderBy(desc(playerProfiles.seasonPoints), desc(playerProfiles.victories), desc(playerProfiles.level)).limit(limit);
}

export async function listSeasons(limit: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(seasons).orderBy(desc(seasons.startsAt)).limit(limit);
}

async function getSeasonById(seasonId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(seasons).where(eq(seasons.id, seasonId)).limit(1);
  return result[0];
}

export async function listSeasonSnapshots(seasonId: string, limit: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    userId: seasonLeaderboardSnapshots.userId,
    name: users.name,
    level: seasonLeaderboardSnapshots.level,
    seasonPoints: seasonLeaderboardSnapshots.seasonPoints,
    victories: seasonLeaderboardSnapshots.victories,
    selectedClass: seasonLeaderboardSnapshots.selectedClass,
    capturedAt: seasonLeaderboardSnapshots.capturedAt,
  }).from(seasonLeaderboardSnapshots).leftJoin(users, eq(users.id, seasonLeaderboardSnapshots.userId)).where(eq(seasonLeaderboardSnapshots.seasonId, seasonId)).orderBy(desc(seasonLeaderboardSnapshots.seasonPoints), desc(seasonLeaderboardSnapshots.victories), desc(seasonLeaderboardSnapshots.level)).limit(limit);
}

export async function startSeason(values: { seasonKey: string; displayName: string; actorUserId: number; idempotencyKey: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const prior = await db.select().from(seasonTransitionReceipts).where(eq(seasonTransitionReceipts.idempotencyKey, values.idempotencyKey)).limit(1);
  if (prior[0]) {
    const season = await getSeasonById(prior[0].toSeasonId);
    if (!season) throw new Error("Prior season transition has no readback season");
    return { applied: false as const, season };
  }
  const seasonId = newEndgameId("season");
  await db.transaction(async tx => {
    const active = await tx.select().from(seasons).where(eq(seasons.status, "active")).limit(1);
    if (active[0]) throw new Error("An active season already exists; use a confirmed rotation");
    await tx.insert(seasons).values({ id: seasonId, seasonKey: values.seasonKey, displayName: values.displayName, createdByUserId: values.actorUserId });
    await tx.insert(seasonTransitionReceipts).values({ id: newEndgameId("seasonrec"), action: "start", toSeasonId: seasonId, actorUserId: values.actorUserId, idempotencyKey: values.idempotencyKey });
  });
  const season = await getSeasonById(seasonId);
  if (!season || season.status !== "active") throw new Error("Season start readback failed");
  return { applied: true as const, season };
}

export async function rotateSeason(values: { confirmedSeasonKey: string; nextSeasonKey: string; nextDisplayName: string; actorUserId: number; idempotencyKey: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const prior = await db.select().from(seasonTransitionReceipts).where(eq(seasonTransitionReceipts.idempotencyKey, values.idempotencyKey)).limit(1);
  if (prior[0]) {
    const season = await getSeasonById(prior[0].toSeasonId);
    if (!season) throw new Error("Prior season transition has no readback season");
    return { applied: false as const, season, snapshotsCaptured: 0 };
  }
  const nextSeasonId = newEndgameId("season");
  let snapshotsCaptured = 0;
  await db.transaction(async tx => {
    const active = await tx.select().from(seasons).where(eq(seasons.status, "active")).limit(1);
    if (!active[0] || active[0].seasonKey !== values.confirmedSeasonKey) throw new Error("Confirmed active season does not match the current server state");
    const profiles = await tx.select({ userId: playerProfiles.userId, level: playerProfiles.level, seasonPoints: playerProfiles.seasonPoints, victories: playerProfiles.victories, selectedClass: playerProfiles.selectedClass }).from(playerProfiles);
    if (profiles.length) {
      await tx.insert(seasonLeaderboardSnapshots).values(profiles.map(profile => ({ id: newEndgameId("seasonsnap"), seasonId: active[0]!.id, ...profile })));
    }
    snapshotsCaptured = profiles.length;
    await tx.update(seasons).set({ status: "closed", endsAt: new Date(), closedByUserId: values.actorUserId }).where(eq(seasons.id, active[0].id));
    await tx.insert(seasons).values({ id: nextSeasonId, seasonKey: values.nextSeasonKey, displayName: values.nextDisplayName, createdByUserId: values.actorUserId });
    await tx.update(playerProfiles).set({ seasonPoints: 0 });
    await tx.insert(seasonTransitionReceipts).values({ id: newEndgameId("seasonrec"), action: "rotate", fromSeasonId: active[0].id, toSeasonId: nextSeasonId, actorUserId: values.actorUserId, idempotencyKey: values.idempotencyKey });
  });
  const season = await getSeasonById(nextSeasonId);
  if (!season || season.status !== "active") throw new Error("Season rotation readback failed");
  return { applied: true as const, season, snapshotsCaptured };
}

function newCommunityId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function listExpeditionChatMessages(limit = 40) {
  const db = await getDb();
  if (!db) return [];
  const messages = await db.select({
    id: expeditionChatMessages.id,
    userId: expeditionChatMessages.userId,
    body: expeditionChatMessages.body,
    createdAt: expeditionChatMessages.createdAt,
    authorName: users.name,
  }).from(expeditionChatMessages).leftJoin(users, eq(users.id, expeditionChatMessages.userId)).orderBy(desc(expeditionChatMessages.createdAt)).limit(limit);
  return messages.reverse();
}

export async function sendExpeditionChatMessage(values: { userId: number; body: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const id = newCommunityId("chat");
  await db.insert(expeditionChatMessages).values({ id, ...values });
  const message = (await listExpeditionChatMessages(1)).find(entry => entry.id === id);
  if (!message) throw new Error("Chat message readback failed");
  return message;
}

async function findActiveTeamForUser(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select({ teamId: expeditionTeams.id }).from(expeditionTeamMembers)
    .innerJoin(expeditionTeams, eq(expeditionTeams.id, expeditionTeamMembers.teamId))
    .where(and(eq(expeditionTeamMembers.userId, userId), eq(expeditionTeamMembers.status, "active"), eq(expeditionTeams.status, "active"))).limit(1);
  return result[0];
}

export async function listOpenPartnerRequests(limit = 40) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: partnerRequests.id,
    requesterUserId: partnerRequests.requesterUserId,
    note: partnerRequests.note,
    createdAt: partnerRequests.createdAt,
    requesterName: users.name,
  }).from(partnerRequests).innerJoin(users, eq(users.id, partnerRequests.requesterUserId))
    .where(eq(partnerRequests.status, "open")).orderBy(desc(partnerRequests.createdAt)).limit(limit);
}

export async function createPartnerRequest(values: { requesterUserId: number; note: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  if (await findActiveTeamForUser(values.requesterUserId)) throw new Error("Dein bestehendes Expeditionsteam muss zuerst verlassen werden.");
  const existing = await db.select().from(partnerRequests).where(and(eq(partnerRequests.requesterUserId, values.requesterUserId), eq(partnerRequests.status, "open"))).limit(1);
  if (existing[0]) throw new Error("Du hast bereits ein offenes Partnergesuch.");
  const id = newCommunityId("req");
  await db.insert(partnerRequests).values({ id, ...values });
  const request = await db.select().from(partnerRequests).where(eq(partnerRequests.id, id)).limit(1);
  if (!request[0]) throw new Error("Partnergesuch readback failed");
  return request[0];
}

export async function cancelPartnerRequest(requestId: string, requesterUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  await db.update(partnerRequests).set({ status: "cancelled" }).where(and(eq(partnerRequests.id, requestId), eq(partnerRequests.requesterUserId, requesterUserId), eq(partnerRequests.status, "open")));
  return { cancelled: true as const };
}

export async function acceptPartnerRequest(values: { requestId: string; responderUserId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  return db.transaction(async tx => {
    const request = (await tx.select().from(partnerRequests).where(and(eq(partnerRequests.id, values.requestId), eq(partnerRequests.status, "open"))).limit(1))[0];
    if (!request) throw new Error("Dieses Partnergesuch ist nicht mehr offen.");
    assertDistinctTeammates(request.requesterUserId, values.responderUserId);
    const occupied = await tx.select({ userId: expeditionTeamMembers.userId }).from(expeditionTeamMembers)
      .innerJoin(expeditionTeams, eq(expeditionTeams.id, expeditionTeamMembers.teamId))
      .where(and(eq(expeditionTeamMembers.status, "active"), eq(expeditionTeams.status, "active"), or(eq(expeditionTeamMembers.userId, request.requesterUserId), eq(expeditionTeamMembers.userId, values.responderUserId)))).limit(1);
    if (occupied[0]) throw new Error("Mindestens ein Explorer ist bereits in einem aktiven Expeditionsteam.");
    const teamId = newCommunityId("team");
    const now = new Date();
    await tx.insert(expeditionTeams).values({ id: teamId, createdByUserId: request.requesterUserId });
    await tx.insert(expeditionTeamMembers).values([
      { id: newCommunityId("member"), teamId, userId: request.requesterUserId, role: "leader", activeUserKey: activeTeamMemberKey(request.requesterUserId) },
      { id: newCommunityId("member"), teamId, userId: values.responderUserId, role: "partner", activeUserKey: activeTeamMemberKey(values.responderUserId) },
    ]);
    await tx.update(partnerRequests).set({ status: "accepted", responderUserId: values.responderUserId, teamId, respondedAt: now }).where(and(eq(partnerRequests.id, request.id), eq(partnerRequests.status, "open")));
    const accepted = (await tx.select().from(partnerRequests).where(eq(partnerRequests.id, request.id)).limit(1))[0];
    if (!accepted || accepted.status !== "accepted" || accepted.teamId !== teamId) throw new Error("Team acceptance readback failed");
    return { teamId, request: accepted };
  });
}

export async function getActiveExpeditionTeam(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const membership = await findActiveTeamForUser(userId);
  if (!membership) return undefined;
  const members = await db.select({ userId: expeditionTeamMembers.userId, role: expeditionTeamMembers.role, name: users.name })
    .from(expeditionTeamMembers).leftJoin(users, eq(users.id, expeditionTeamMembers.userId))
    .where(and(eq(expeditionTeamMembers.teamId, membership.teamId), eq(expeditionTeamMembers.status, "active"))).orderBy(expeditionTeamMembers.joinedAt);
  return { id: membership.teamId, members };
}

export async function leaveActiveExpeditionTeam(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const active = await findActiveTeamForUser(userId);
  if (!active) return { disbanded: false as const };
  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(expeditionTeams).set({ status: "disbanded", disbandedAt: now }).where(and(eq(expeditionTeams.id, active.teamId), eq(expeditionTeams.status, "active")));
    await tx.update(expeditionTeamMembers).set({ status: "left", activeUserKey: null, leftAt: now }).where(and(eq(expeditionTeamMembers.teamId, active.teamId), eq(expeditionTeamMembers.status, "active")));
  });
  return { disbanded: true as const };
}

export async function listActiveTeamSignals(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const active = await findActiveTeamForUser(userId);
  if (!active) return [];
  const signals = await db.select({
    id: expeditionTeamSignals.id,
    senderUserId: expeditionTeamSignals.senderUserId,
    command: expeditionTeamSignals.command,
    createdAt: expeditionTeamSignals.createdAt,
    senderName: users.name,
  }).from(expeditionTeamSignals).leftJoin(users, eq(users.id, expeditionTeamSignals.senderUserId))
    .where(eq(expeditionTeamSignals.teamId, active.teamId)).orderBy(desc(expeditionTeamSignals.createdAt)).limit(60);
  return signals.reverse();
}

export async function sendActiveTeamSignal(values: { userId: number; command: AurionCommand }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const active = await findActiveTeamForUser(values.userId);
  if (!active) throw new Error("Du bist aktuell in keinem aktiven Expeditionsteam.");
  const id = newCommunityId("signal");
  await db.insert(expeditionTeamSignals).values({ id, teamId: active.teamId, senderUserId: values.userId, command: values.command });
  const signal = (await listActiveTeamSignals(values.userId)).find(entry => entry.id === id);
  if (!signal) throw new Error("Team signal readback failed");
  return signal;
}

export async function listForumThreads(category?: ForumCategory) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select({
    id: forumThreads.id,
    category: forumThreads.category,
    authorUserId: forumThreads.authorUserId,
    title: forumThreads.title,
    body: forumThreads.body,
    pinned: forumThreads.pinned,
    createdAt: forumThreads.createdAt,
    updatedAt: forumThreads.updatedAt,
    authorName: users.name,
  }).from(forumThreads).leftJoin(users, eq(users.id, forumThreads.authorUserId));
  return category ? query.where(eq(forumThreads.category, category)).orderBy(desc(forumThreads.pinned), desc(forumThreads.createdAt)).limit(60) : query.orderBy(desc(forumThreads.pinned), desc(forumThreads.createdAt)).limit(60);
}

export async function getForumThread(threadId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const thread = (await db.select({
    id: forumThreads.id,
    category: forumThreads.category,
    authorUserId: forumThreads.authorUserId,
    title: forumThreads.title,
    body: forumThreads.body,
    pinned: forumThreads.pinned,
    createdAt: forumThreads.createdAt,
    updatedAt: forumThreads.updatedAt,
    authorName: users.name,
  }).from(forumThreads).leftJoin(users, eq(users.id, forumThreads.authorUserId)).where(eq(forumThreads.id, threadId)).limit(1))[0];
  if (!thread) return undefined;
  const replies = await db.select({ id: forumReplies.id, body: forumReplies.body, createdAt: forumReplies.createdAt, authorUserId: forumReplies.authorUserId, authorName: users.name })
    .from(forumReplies).leftJoin(users, eq(users.id, forumReplies.authorUserId)).where(eq(forumReplies.threadId, threadId)).orderBy(forumReplies.createdAt).limit(100);
  return { ...thread, replies };
}

export async function createForumThread(values: { authorUserId: number; category: ForumCategory; title: string; body: string; pinned?: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const id = newCommunityId("thread");
  await db.insert(forumThreads).values({ id, ...values, pinned: values.pinned ? 1 : 0 });
  const thread = await getForumThread(id);
  if (!thread) throw new Error("Forum thread readback failed");
  return thread;
}

export async function updateForumThread(values: { threadId: string; category: ForumCategory; title: string; body: string; pinned: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const existing = await db.select({ id: forumThreads.id }).from(forumThreads).where(eq(forumThreads.id, values.threadId)).limit(1);
  if (!existing[0]) throw new Error("Der redaktionelle Forumseintrag existiert nicht.");
  await db.update(forumThreads).set({ category: values.category, title: values.title, body: values.body, pinned: values.pinned ? 1 : 0 }).where(eq(forumThreads.id, values.threadId));
  const thread = await getForumThread(values.threadId);
  if (!thread || thread.category !== values.category || thread.title !== values.title || thread.body !== values.body || thread.pinned !== (values.pinned ? 1 : 0)) throw new Error("Forum-Bearbeitung konnte nicht bestätigt werden.");
  return thread;
}

export async function createForumReply(values: { threadId: string; authorUserId: number; body: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const exists = await db.select({ id: forumThreads.id }).from(forumThreads).where(eq(forumThreads.id, values.threadId)).limit(1);
  if (!exists[0]) throw new Error("Der Forumseintrag existiert nicht.");
  const id = newCommunityId("reply");
  await db.insert(forumReplies).values({ id, ...values });
  return { id };
}
