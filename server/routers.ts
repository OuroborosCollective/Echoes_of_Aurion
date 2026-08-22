import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { createGatewaySessionId, createPairingToken, defaultGatewayCommands, digestPairingToken, normalizeAurionCommand, type AurionCommand } from "./gatewayProtocol";
import { isPlayerClass, isWeaponTrack, type WeaponTrack } from "./endgameProtocol";
import { MAX_GLB_BASE64_CHARS, USER_GLB_MAX_BASE64_CHARS } from "./adminProtocol";
import { forumCategories, mayPublishForumCategory, normalizeCommunityBody, normalizeCommunityText } from "./communityProtocol";
import { assertLocalHandle, assertLocalPassword, hashLocalPassword, normalizeLocalHandle, verifyLocalPassword } from "./localAuth";
import { proposeAurionDeveloperChange } from "./liveDeveloperGenkit";
import type { EncounterKey, QuestKey } from "./gameplayProtocol";

function gatewayUrl(request: { protocol: string; get(name: string): string | undefined; header(name: string): string | undefined }) {
  const protocol = request.header("x-forwarded-proto") ?? request.protocol;
  return `${protocol}://${request.get("host") ?? "arelogic.space"}/mcp`;
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    registerLocal: publicProcedure.input(z.object({ handle: z.string().trim().min(3).max(32), password: z.string().min(12).max(128) })).mutation(async ({ ctx, input }) => {
      const handle = assertLocalHandle(input.handle);
      const password = assertLocalPassword(input.password);
      const user = await db.createLocalUser({ handle, passwordHash: await hashLocalPassword(password) });
      const token = await sdk.createSessionToken(user.openId, { name: user.name ?? handle, expiresInMs: ONE_YEAR_MS });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return user;
    }),
    loginLocal: publicProcedure.input(z.object({ handle: z.string().trim().min(3).max(32), password: z.string().min(1).max(128) })).mutation(async ({ ctx, input }) => {
      const handle = normalizeLocalHandle(input.handle);
      const record = await db.getLocalCredential(handle);
      if (record.credential.lockedUntil && record.credential.lockedUntil.getTime() > Date.now()) {
        throw new Error("Zu viele Fehlversuche. Versuche es in einigen Minuten erneut.");
      }
      if (!record || !(await verifyLocalPassword(input.password, record.credential.passwordHash))) {
        if (record) await db.recordLocalAuthFailure(handle, record.credential.failedAttempts);
        throw new Error("Rufname oder Passwort stimmen nicht.");
      }
      await db.clearLocalAuthFailures(handle);
      await db.upsertUser({ openId: record.user.openId, lastSignedIn: new Date() });
      const token = await sdk.createSessionToken(record.user.openId, { name: record.user.name ?? handle, expiresInMs: ONE_YEAR_MS });
      ctx.res.cookie(COOKIE_NAME, token, { ...getSessionCookieOptions(ctx.req), maxAge: ONE_YEAR_MS });
      return record.user;
    }),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),
  gateway: router({
    createSession: protectedProcedure.input(z.object({ providerLabel: z.string().trim().min(2).max(120), allowedCommands: z.array(z.string()).min(1).max(13).optional() })).mutation(async ({ ctx, input }) => {
      const allowed = Array.from(new Set((input.allowedCommands ?? defaultGatewayCommands()).map(normalizeAurionCommand).filter((value): value is AurionCommand => value !== null)));
      if (allowed.length === 0) throw new Error("No valid gateway commands selected");
      const pairingToken = createPairingToken();
      const sessionId = createGatewaySessionId();
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 8);
      await db.createGatewaySession({ id: sessionId, userId: ctx.user.id, providerLabel: input.providerLabel, tokenDigest: digestPairingToken(pairingToken), allowedCommands: JSON.stringify(allowed), expiresAt });
      return { sessionId, pairingToken, expiresAt, mcpUrl: gatewayUrl(ctx.req), allowedCommands: allowed };
    }),
    listSessions: protectedProcedure.query(async ({ ctx }) => {
      return db.listGatewaySessionsForUser(ctx.user.id);
    }),
    revokeSession: protectedProcedure.input(z.object({ sessionId: z.string().min(8).max(64) })).mutation(async ({ ctx, input }) => {
      await db.revokeGatewaySession(input.sessionId, ctx.user.id);
      return { revoked: true };
    }),
    pullCommands: protectedProcedure.input(z.object({ sessionId: z.string().min(8).max(64), afterSequence: z.number().int().min(0) })).query(async ({ ctx, input }) => {
      const session = await db.getGatewaySessionForUser(input.sessionId, ctx.user.id);
      if (!session || session.status !== "active" || session.expiresAt <= new Date()) throw new Error("Gateway session unavailable");
      return db.listGatewayCommandsAfter(input.sessionId, input.afterSequence);
    }),
  }),
  player: router({
    me: protectedProcedure.query(async ({ ctx }) => ({
      profile: await db.getOrCreatePlayerProfile(ctx.user.id),
      weaponMasteries: await db.listWeaponMasteries(ctx.user.id),
      weaponLoadout: await db.getWeaponLoadout(ctx.user.id),
      guild: await db.getActiveGuildForUser(ctx.user.id),
      inventory: await db.listInventoryForUser(ctx.user.id),
      setBonuses: await db.listSetBonusesForUser(ctx.user.id),
    })),
    chooseClass: protectedProcedure.input(z.object({ playerClass: z.enum(["vanguard", "seer", "warden"]) })).mutation(async ({ ctx, input }) => {
      if (!isPlayerClass(input.playerClass)) throw new Error("Unsupported class");
      return db.choosePlayerClass(ctx.user.id, input.playerClass);
    }),
    setWeaponLoadout: protectedProcedure.input(z.object({ weaponTrack: z.enum(["blade", "staff", "spear", "focus"]) })).mutation(({ ctx, input }) => db.setWeaponLoadout({ userId: ctx.user.id, weaponTrack: input.weaponTrack })),
  }),
  gameplay: router({
    progress: protectedProcedure.query(({ ctx }) => db.getGameplayProgress(ctx.user.id)),
    openWorld: protectedProcedure.query(({ ctx }) => db.getOpenWorldSnapshot(ctx.user.id)),
    enterOpenWorld: protectedProcedure.mutation(({ ctx }) => db.getOpenWorldSnapshot(ctx.user.id)),
    acceptQuest: protectedProcedure.input(z.object({ questKey: z.enum(["astral_call", "archive_of_echoes", "ember_key"]) })).mutation(({ ctx, input }) => db.acceptGameplayQuest({ userId: ctx.user.id, questKey: input.questKey as QuestKey })),
    startEncounter: protectedProcedure.input(z.object({ encounterKey: z.enum(["asterion", "archive", "solarium", "cinder_vault"]) })).mutation(({ ctx, input }) => db.startGameplayEncounter({ userId: ctx.user.id, encounterKey: input.encounterKey as EncounterKey })),
    act: protectedProcedure.input(z.object({ sessionId: z.string().min(8).max(64), sequence: z.number().int().positive(), command: z.string().trim().length(1), source: z.enum(["human", "gateway"]) })).mutation(({ ctx, input }) => db.applyGameplayAction({ userId: ctx.user.id, ...input })),
  }),
  guild: router({
    mine: protectedProcedure.query(({ ctx }) => db.getActiveGuildForUser(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(3).max(48).regex(/^[^<>]+$/), tag: z.string().trim().toUpperCase().min(2).max(8).regex(/^[A-Z0-9]+$/) })).mutation(({ ctx, input }) => db.createGuildForFounder({ userId: ctx.user.id, ...input })),
  }),
  market: router({
    inventory: protectedProcedure.query(({ ctx }) => db.listInventoryForUser(ctx.user.id)),
    activeListings: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional()).query(({ input }) => db.listActiveMarketListings(input?.limit ?? 50)),
    myListings: protectedProcedure.query(({ ctx }) => db.listMyMarketListings(ctx.user.id)),
    sellToSystem: protectedProcedure.input(z.object({ itemId: z.string().min(8).max(64) })).mutation(({ ctx, input }) => db.sellItemToSystem({ itemId: input.itemId, sellerUserId: ctx.user.id })),
    createListing: protectedProcedure.input(z.object({ itemId: z.string().min(8).max(64), askingPrice: z.number().int().min(1).max(1_000_000) })).mutation(({ ctx, input }) => db.createMarketListing({ ...input, sellerUserId: ctx.user.id })),
    cancelListing: protectedProcedure.input(z.object({ listingId: z.string().min(8).max(64) })).mutation(({ ctx, input }) => db.cancelMarketListing({ listingId: input.listingId, sellerUserId: ctx.user.id })),
    buyListing: protectedProcedure.input(z.object({ listingId: z.string().min(8).max(64), idempotencyKey: z.string().min(16).max(128) })).mutation(({ ctx, input }) => db.buyMarketListing({ ...input, buyerUserId: ctx.user.id })),
  }),
  assetSubmissions: router({
    publicCatalog: publicProcedure.query(() => db.listPublicGlbCatalog()),
    activeArenaAsset: publicProcedure.input(z.object({ targetKey: z.string().trim().min(2).max(120).regex(/^[A-Za-z0-9_-]+$/).default("asterion_courtyard") }).optional()).query(({ input }) => db.getActiveGlbAssignment("arena", input?.targetKey ?? "asterion_courtyard")),
    mine: protectedProcedure.query(({ ctx }) => db.listMyGlbSubmissions(ctx.user.id)),
    catalog: protectedProcedure.query(({ ctx }) => db.listVisibleGlbCatalog(ctx.user.id)),
    characterAppearance: protectedProcedure.query(async ({ ctx }) => (await db.getPlayerCharacterAppearance(ctx.user.id)) ?? null),
    equipCharacter: protectedProcedure.input(z.object({ assetId: z.string().min(8).max(64) })).mutation(({ ctx, input }) => db.equipPlayerCharacterAppearance({ userId: ctx.user.id, assetId: input.assetId })),
    submit: protectedProcedure.input(z.object({ assetType: z.enum(["character", "enemy", "weapon", "armor", "arena"]), subcategory: z.string().trim().min(2).max(80).regex(/^[^<>]+$/), displayName: z.string().trim().min(3).max(120).regex(/^[^<>]+$/), description: z.string().trim().min(12).max(1000).regex(/^[^<>]+$/), visibility: z.enum(["private", "public"]), contentBase64: z.string().min(16).max(USER_GLB_MAX_BASE64_CHARS) })).mutation(({ ctx, input }) => db.submitPlayerGlbAsset({ ...input, submittedByUserId: ctx.user.id })),
  }),
  community: router({
    chat: router({
      list: protectedProcedure.query(() => db.listExpeditionChatMessages()),
      send: protectedProcedure.input(z.object({ body: z.string().max(500) })).mutation(({ ctx, input }) => db.sendExpeditionChatMessage({ userId: ctx.user.id, body: normalizeCommunityText(input.body, 500, "Die Chatnachricht") })),
    }),
    partners: router({
      open: protectedProcedure.query(() => db.listOpenPartnerRequests()),
      create: protectedProcedure.input(z.object({ note: z.string().max(280) })).mutation(({ ctx, input }) => db.createPartnerRequest({ requesterUserId: ctx.user.id, note: normalizeCommunityText(input.note, 280, "Das Partnergesuch") })),
      cancel: protectedProcedure.input(z.object({ requestId: z.string().min(8).max(64) })).mutation(({ ctx, input }) => db.cancelPartnerRequest(input.requestId, ctx.user.id)),
      accept: protectedProcedure.input(z.object({ requestId: z.string().min(8).max(64) })).mutation(({ ctx, input }) => db.acceptPartnerRequest({ requestId: input.requestId, responderUserId: ctx.user.id })),
    }),
    team: router({
      active: protectedProcedure.query(async ({ ctx }) => (await db.getActiveExpeditionTeam(ctx.user.id)) ?? null),
      leave: protectedProcedure.mutation(({ ctx }) => db.leaveActiveExpeditionTeam(ctx.user.id)),
      signals: protectedProcedure.query(({ ctx }) => db.listActiveTeamSignals(ctx.user.id)),
      sendSignal: protectedProcedure.input(z.object({ command: z.string().trim().length(1) })).mutation(({ ctx, input }) => {
        const command = normalizeAurionCommand(input.command);
        if (!command) throw new Error("Nur die Steuerimpulse W, A, S, D und 1–9 sind zulässig.");
        return db.sendActiveTeamSignal({ userId: ctx.user.id, command });
      }),
    }),
    forum: router({
      list: publicProcedure.input(z.object({ category: z.enum(forumCategories).optional() }).optional()).query(({ input }) => db.listForumThreads(input?.category)),
      get: publicProcedure.input(z.object({ threadId: z.string().min(8).max(64) })).query(({ input }) => db.getForumThread(input.threadId)),
      createQuestion: protectedProcedure.input(z.object({ title: z.string().max(160), body: z.string().max(8000) })).mutation(({ ctx, input }) => db.createForumThread({ authorUserId: ctx.user.id, category: "general", title: normalizeCommunityText(input.title, 160, "Der Fragentitel"), body: normalizeCommunityBody(input.body, 8000, "Der Fragetext") })),
      reply: protectedProcedure.input(z.object({ threadId: z.string().min(8).max(64), body: z.string().max(4000) })).mutation(({ ctx, input }) => db.createForumReply({ threadId: input.threadId, authorUserId: ctx.user.id, body: normalizeCommunityBody(input.body, 4000, "Die Antwort") })),
    }),
  }),
  leaderboard: router({
    list: publicProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(25) }).optional()).query(({ input }) => db.listLeaderboard(input?.limit ?? 25)),
  }),
  admin: router({
    developer: router({
      propose: adminProcedure.input(z.object({
        changeKind: z.enum(["world", "quest", "npc_behavior", "content_model"]),
        request: z.string().trim().min(12).max(1_800),
      })).mutation(({ input }) => proposeAurionDeveloperChange({ ...input, actorRole: "admin" })),
    }),
    players: router({
      list: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(25), query: z.string().trim().max(64).regex(/^[A-Za-z0-9@._ -]*$/).optional() }).optional()).query(({ input }) => db.listAdminPlayers(input ?? { limit: 25 })),
      setRole: adminProcedure.input(z.object({ userId: z.number().int().positive(), role: z.enum(["user", "admin"]) })).mutation(({ ctx, input }) => db.setManagedUserRole({ actorUserId: ctx.user.id, targetUserId: input.userId, role: input.role })),
    }),
    rankings: router({
      live: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(25) }).optional()).query(({ input }) => db.listAdminLiveLeaderboard(input?.limit ?? 25)),
      seasons: adminProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(25) }).optional()).query(({ input }) => db.listSeasons(input?.limit ?? 25)),
      snapshots: adminProcedure.input(z.object({ seasonId: z.string().min(8).max(64), limit: z.number().int().min(1).max(100).default(50) })).query(({ input }) => db.listSeasonSnapshots(input.seasonId, input.limit)),
      startSeason: adminProcedure.input(z.object({ seasonKey: z.string().trim().min(3).max(64).regex(/^[a-z0-9_-]+$/), displayName: z.string().trim().min(3).max(120), idempotencyKey: z.string().trim().min(12).max(128) })).mutation(({ ctx, input }) => db.startSeason({ ...input, actorUserId: ctx.user.id })),
      rotateSeason: adminProcedure.input(z.object({ confirmedSeasonKey: z.string().trim().min(3).max(64).regex(/^[a-z0-9_-]+$/), nextSeasonKey: z.string().trim().min(3).max(64).regex(/^[a-z0-9_-]+$/), nextDisplayName: z.string().trim().min(3).max(120), idempotencyKey: z.string().trim().min(12).max(128) })).mutation(({ ctx, input }) => db.rotateSeason({ ...input, actorUserId: ctx.user.id })),
    }),
    progression: router({
      grant: adminProcedure.input(z.object({ userId: z.number().int().positive(), kind: z.enum(["xp", "points", "victory", "weapon_xp"]), delta: z.number().int().positive().max(100000), source: z.string().trim().min(3).max(64), reason: z.string().trim().min(3).max(240), idempotencyKey: z.string().trim().min(12).max(128), weaponTrack: z.enum(["blade", "staff", "spear", "focus"]).optional() })).mutation(async ({ input }) => {
        const weaponTrack = input.weaponTrack && isWeaponTrack(input.weaponTrack) ? input.weaponTrack as WeaponTrack : undefined;
        return db.grantProgress({ ...input, weaponTrack });
      }),
      recordExpeditionResult: adminProcedure.input(z.object({ userId: z.number().int().positive(), expeditionKey: z.string().trim().min(3).max(96), seedDigest: z.string().regex(/^[a-f0-9]{64}/i), resultDigest: z.string().regex(/^[a-f0-9]{64}/i), idempotencyKey: z.string().trim().min(12).max(128) })).mutation(({ ctx, input }) => db.recordValidatedExpeditionResult({ ...input, confirmedByUserId: ctx.user.id })),
      recordLoot: adminProcedure.input(z.object({ userId: z.number().int().positive(), expeditionKey: z.string().min(3).max(96), treasureClass: z.string().min(3).max(96), qualityRoll: z.number().int().min(0).max(9999), affixRoll: z.number().int().min(0).max(9999), magicFind: z.number().int().min(0).max(100), itemLevel: z.number().int().min(1).max(99), seedDigest: z.string().regex(/^[a-f0-9]{64}$/), resultReceiptId: z.string().min(8).max(64), idempotencyKey: z.string().trim().min(12).max(128) })).mutation(({ input }) => db.createLootDrop(input)),
      recordWeaponEvent: adminProcedure.input(z.object({ userId: z.number().int().positive(), expeditionKey: z.string().min(3).max(96), seedDigest: z.string().regex(/^[a-f0-9]{64}$/), resultReceiptId: z.string().min(8).max(64), weaponTrack: z.enum(["blade", "staff", "spear", "focus"]), actionKey: z.string().min(3).max(120), xpGranted: z.number().int().min(1).max(1000), idempotencyKey: z.string().min(12).max(128) })).mutation(({ input }) => db.recordValidatedWeaponEvent(input)),
    }),
    assets: router({
      list: adminProcedure.query(() => db.listGlbAssets()),
      createMetadata: adminProcedure.input(z.object({ displayName: z.string().trim().min(3).max(120), assetType: z.enum(["character", "enemy", "weapon", "armor", "arena"]), storageKey: z.string().trim().min(5).max(512), storageUrl: z.string().trim().min(5).max(768), sha256: z.string().regex(/^[a-f0-9]{64}$/), bytes: z.number().int().positive().max(100_000_000) })).mutation(({ ctx, input }) => db.createGlbAssetMetadata({ ...input, createdByUserId: ctx.user.id })),
      upload: adminProcedure.input(z.object({ displayName: z.string().trim().min(3).max(120), assetType: z.enum(["character", "enemy", "weapon", "armor", "arena"]), contentBase64: z.string().min(16).max(MAX_GLB_BASE64_CHARS) })).mutation(({ ctx, input }) => db.uploadGlbAsset({ ...input, createdByUserId: ctx.user.id })),
      setReview: adminProcedure.input(z.object({ assetId: z.string().min(8).max(64), status: z.enum(["approved", "rejected", "archived"]) })).mutation(({ ctx, input }) => db.setGlbAssetReview({ ...input, reviewedByUserId: ctx.user.id })),
      listAssignments: adminProcedure.query(() => db.listGlbAssignments()),
      assign: adminProcedure.input(z.object({ assetId: z.string().min(8).max(64), targetType: z.enum(["character", "enemy", "weapon", "armor", "arena"]), targetKey: z.string().trim().min(2).max(120).regex(/^[A-Za-z0-9_-]+$/) })).mutation(({ ctx, input }) => db.assignApprovedGlbAsset({ ...input, assignedByUserId: ctx.user.id })),
      pendingSubmissions: adminProcedure.query(() => db.listPendingGlbSubmissions()),
      reviewSubmission: adminProcedure.input(z.object({ submissionId: z.string().min(8).max(64), decision: z.enum(["approved", "rejected"]), reviewNote: z.string().trim().max(500).regex(/^[^<>]*$/).optional() })).mutation(({ ctx, input }) => db.reviewPlayerGlbSubmission({ ...input, reviewedByUserId: ctx.user.id })),
    }),
    monetization: router({
      list: adminProcedure.query(() => db.listMonetizationPlacements()),
      upsert: adminProcedure.input(z.object({ placementKey: z.string().trim().min(3).max(96).regex(/^[a-z0-9_-]+$/), kind: z.enum(["banner", "offerwall", "vote_list"]), providerLabel: z.string().trim().min(2).max(96), active: z.boolean(), consentRequired: z.boolean(), configurationJson: z.string().trim().min(2).max(12_000) })).mutation(({ ctx, input }) => db.upsertMonetizationPlacement({ ...input, updatedByUserId: ctx.user.id })),
    }),
    lootCatalog: router({
      listSetBonusesForUser: adminProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ input }) => db.listSetBonusesForUser(input.userId)),
    }),
    community: router({
      listEditorialThreads: adminProcedure.query(async () => (await db.listForumThreads()).filter(thread => thread.category !== "general")),
      createForumThread: adminProcedure.input(z.object({ category: z.enum(forumCategories), title: z.string().max(160), body: z.string().max(8000), pinned: z.boolean().default(false) })).mutation(({ ctx, input }) => {
        if (!mayPublishForumCategory(ctx.user.role, input.category)) throw new Error("Diese Forumskategorie ist nur der Redaktion vorbehalten.");
        return db.createForumThread({ authorUserId: ctx.user.id, category: input.category, title: normalizeCommunityText(input.title, 160, "Der Beitragstitel"), body: normalizeCommunityBody(input.body, 8000, "Der Beitrag"), pinned: input.pinned });
      }),
      updateForumThread: adminProcedure.input(z.object({ threadId: z.string().min(8).max(64), category: z.enum(forumCategories), title: z.string().max(160), body: z.string().max(8000), pinned: z.boolean() })).mutation(({ ctx, input }) => {
        if (!mayPublishForumCategory(ctx.user.role, input.category)) throw new Error("Diese Forumskategorie ist nur der Redaktion vorbehalten.");
        return db.updateForumThread({ threadId: input.threadId, category: input.category, title: normalizeCommunityText(input.title, 160, "Der Beitragstitel"), body: normalizeCommunityBody(input.body, 8000, "Der Beitrag"), pinned: input.pinned });
      }),
    }),
  }),
});

export type AppRouter = typeof appRouter;
