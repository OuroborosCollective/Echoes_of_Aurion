import { and, desc, eq, gt, gte, isNull, like, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { expeditionChatMessages, expeditionResultReceipts, expeditionTeamMembers, expeditionTeams, expeditionTeamSignals, forumReplies, forumThreads, gatewayCommands, gatewaySessions, glbAssetSubmissions, glbAssets, glbAssignments, guildMemberships, guilds, InsertUser, itemInstances, lootAffixes, lootDropReceipts, lootSetDefinitions, marketListings, marketTransactionReceipts, monetizationPlacements, partnerRequests, playerCharacterAppearances, playerProfiles, progressionLedger, seasonLeaderboardSnapshots, seasons, seasonTransitionReceipts, systemSaleReceipts, treasureClasses, users, weaponLoadouts, weaponMasteries, weaponMasteryReceipts } from "../drizzle/schema";
import { ENV } from './_core/env';
import type { AurionCommand } from "./gatewayProtocol";
import { canChooseClass, canUseWeaponWithClass, isPlayerClass, isServerEvidenceDigest, isWeaponActionAllowed, isWeaponTrack, levelFromTotalXp, rollLootQuality, type LootAffix, type PlayerClass, type WeaponTrack } from "./endgameProtocol";
import { isGatewayGrantActive, isStrictlyIncreasingSequence } from "./gatewayProtocol";
import { decodeValidatedGlbBase64, normalizeSafePlacementConfiguration, USER_GLB_MAX_BYTES } from "./adminProtocol";
import { activeTeamMemberKey, assertDistinctTeammates, type ForumCategory } from "./communityProtocol";
import { assertMarketPrice, assertNotOwnListing, systemSaleValue, type MarketQuality } from "./marketProtocol";
import { storagePut } from "./storage";

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
