import { and, desc, eq, gt, gte, lte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { gatewayCommands, gatewaySessions, glbAssets, guildMemberships, guilds, InsertUser, itemInstances, lootAffixes, lootDropReceipts, lootSetDefinitions, monetizationPlacements, playerProfiles, progressionLedger, treasureClasses, users, weaponMasteries, weaponMasteryReceipts } from "../drizzle/schema";
import { ENV } from './_core/env';
import type { AurionCommand } from "./gatewayProtocol";
import { canChooseClass, canUseWeaponWithClass, isPlayerClass, isWeaponTrack, levelFromTotalXp, rollLootQuality, type LootAffix, type PlayerClass, type WeaponTrack } from "./endgameProtocol";

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
  return result[0];
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
  if (latest[0] && values.sequence <= latest[0].sequence) return { accepted: false as const, reason: "sequence_not_increasing" };
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

export async function createLootDrop(values: { userId: number; expeditionKey: string; treasureClass: string; qualityRoll: number; affixRoll: number; magicFind: number; itemLevel: number; seedDigest: string; idempotencyKey: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const previous = await db.select().from(lootDropReceipts).where(eq(lootDropReceipts.idempotencyKey, values.idempotencyKey)).limit(1);
  if (previous[0]) return { applied: false as const, receiptId: previous[0].id };
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
  const receiptId = newEndgameId("drop");
  await db.insert(lootDropReceipts).values({ id: receiptId, userId: values.userId, expeditionKey: values.expeditionKey, treasureClass: values.treasureClass, quality, seedDigest: values.seedDigest, idempotencyKey: values.idempotencyKey });
  const itemId = newEndgameId("item");
  await db.insert(itemInstances).values({ id: itemId, ownerUserId: values.userId, lootReceiptId: receiptId, baseItemKey, quality, itemLevel: values.itemLevel, affixesJson: JSON.stringify(affixes), setKey: setDefinition?.setKey });
  return { applied: true as const, receiptId, itemId, quality };
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

export async function recordValidatedWeaponEvent(values: { userId: number; expeditionKey: string; weaponTrack: WeaponTrack; actionKey: string; xpGranted: number; idempotencyKey: string }) {
  const db = await getDb();
  if (!db) throw new Error("Game database is not available");
  const previous = await db.select().from(weaponMasteryReceipts).where(eq(weaponMasteryReceipts.idempotencyKey, values.idempotencyKey)).limit(1);
  if (previous[0]) return { applied: false as const, profile: await getOrCreatePlayerProfile(values.userId) };
  const profile = await getOrCreatePlayerProfile(values.userId);
  if (!canUseWeaponWithClass(profile.selectedClass, values.weaponTrack)) throw new Error("Weapon track is not available for the selected class");
  await db.insert(weaponMasteryReceipts).values({ id: newEndgameId("wrec"), ...values });
  return grantProgress({ userId: values.userId, kind: "weapon_xp", delta: values.xpGranted, source: "validated-expedition", reason: `${values.expeditionKey}:${values.actionKey}`, idempotencyKey: `weapon:${values.idempotencyKey}`, weaponTrack: values.weaponTrack });
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
