import { and, desc, eq, gt, gte, like, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { gatewayCommands, gatewaySessions, glbAssets, glbAssignments, guildMemberships, guilds, InsertUser, itemInstances, lootAffixes, lootDropReceipts, lootSetDefinitions, monetizationPlacements, playerProfiles, progressionLedger, seasonLeaderboardSnapshots, seasons, seasonTransitionReceipts, treasureClasses, users, weaponMasteries, weaponMasteryReceipts } from "../drizzle/schema";
import { ENV } from './_core/env';
import type { AurionCommand } from "./gatewayProtocol";
import { canChooseClass, canUseWeaponWithClass, isPlayerClass, isWeaponTrack, levelFromTotalXp, rollLootQuality, type LootAffix, type PlayerClass, type WeaponTrack } from "./endgameProtocol";
import { decodeValidatedGlbBase64, normalizeSafePlacementConfiguration } from "./adminProtocol";
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

export async function listInventoryForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const items = await db.select().from(itemInstances).where(eq(itemInstances.ownerUserId, userId)).orderBy(desc(itemInstances.createdAt)).limit(100);
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
