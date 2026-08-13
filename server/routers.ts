import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, protectedProcedure, publicProcedure, router } from "./_core/trpc";
import * as db from "./db";
import { createGatewaySessionId, createPairingToken, defaultGatewayCommands, digestPairingToken, normalizeAurionCommand, type AurionCommand } from "./gatewayProtocol";
import { isPlayerClass, isWeaponTrack, type WeaponTrack } from "./endgameProtocol";
import { MAX_GLB_BASE64_CHARS } from "./adminProtocol";

function gatewayUrl(request: { protocol: string; get(name: string): string | undefined; header(name: string): string | undefined }) {
  const protocol = request.header("x-forwarded-proto") ?? request.protocol;
  return `${protocol}://${request.get("host") ?? "arelogic.space"}/mcp`;
}

export const appRouter = router({
    // if you need to use socket.io, read and register route in server/_core/index.ts, all api should start with '/api/' so that the gateway can route correctly
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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
  guild: router({
    mine: protectedProcedure.query(({ ctx }) => db.getActiveGuildForUser(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string().trim().min(3).max(48).regex(/^[^<>]+$/), tag: z.string().trim().toUpperCase().min(2).max(8).regex(/^[A-Z0-9]+$/) })).mutation(({ ctx, input }) => db.createGuildForFounder({ userId: ctx.user.id, ...input })),
  }),
  leaderboard: router({
    list: publicProcedure.input(z.object({ limit: z.number().int().min(1).max(100).default(25) }).optional()).query(({ input }) => db.listLeaderboard(input?.limit ?? 25)),
  }),
  admin: router({
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
    }),
    monetization: router({
      list: adminProcedure.query(() => db.listMonetizationPlacements()),
      upsert: adminProcedure.input(z.object({ placementKey: z.string().trim().min(3).max(96).regex(/^[a-z0-9_-]+$/), kind: z.enum(["banner", "offerwall", "vote_list"]), providerLabel: z.string().trim().min(2).max(96), active: z.boolean(), consentRequired: z.boolean(), configurationJson: z.string().trim().min(2).max(12_000) })).mutation(({ ctx, input }) => db.upsertMonetizationPlacement({ ...input, updatedByUserId: ctx.user.id })),
    }),
    lootCatalog: router({
      listSetBonusesForUser: adminProcedure.input(z.object({ userId: z.number().int().positive() })).query(({ input }) => db.listSetBonusesForUser(input.userId)),
    }),
  }),
});

export type AppRouter = typeof appRouter;
