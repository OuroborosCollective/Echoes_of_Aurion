import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { aurionCausalArchive, aurionCausalCheckpoints, aurionGlobalStateProofs } from "../../drizzle/aurionCausalitySchema";
import { adminProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { globalCausalArchivingService } from "../causality/archivingService";
import { globalCausalPersistence } from "../causality/persistence";
import { globalCausalRecoveryService } from "../causality/causalRecoveryService";
import { globalCrossZoneSyncService } from "../causality/crossZoneSynchronizationService";
import { globalReadbackService } from "../causality/readbackService";
import { globalStateReconciliationService } from "../causality/globalStateReconciliationService";
import { replayZoneTick } from "../causality/replayZoneTick";
import { isReplayMatch } from "../../shared/aurionReplayContract";

export const causalityRouter = router({
  getReadbackStatus: adminProcedure.query(() => globalReadbackService.getStatus()),
  getGlobalReconciliationStatus: adminProcedure.query(() => globalStateReconciliationService.getStatus()),

  getLatestReceipts: adminProcedure
    .input(z.object({ zoneId: z.string().min(1) }))
    .query(async ({ input }) => {
      const receipt = await globalCausalPersistence.getLatestReceipt(input.zoneId);
      return receipt ? [receipt] : [];
    }),

  getRecordedTick: adminProcedure
    .input(z.object({ zoneId: z.string().min(1), tick: z.number().int().min(0) }))
    .query(({ input }) => globalCausalPersistence.getRecordedTick(input.zoneId, input.tick)),

  /** Pure replay: no persistence, transport or gameplay mutation. */
  replayTick: adminProcedure
    .input(z.object({ zoneId: z.string().min(1), tick: z.number().int().min(0) }))
    .query(async ({ input }) => {
      const entry = await globalCausalPersistence.getRecordedTick(input.zoneId, input.tick);
      if (!entry) return { verdict: { status: "UNPROVABLE", verdict: "UNPROVABLE", tick: input.tick, reason: "RECORDED_TICK_MISSING" } as const, isMatch: false, recordedReceipt: null };
      if (!entry.preState || !entry.intents) return { verdict: { status: "UNPROVABLE", verdict: "UNPROVABLE", tick: input.tick, reason: !entry.preState ? "REPLAY_PRE_STATE_UNAVAILABLE" : "RECORDED_INTENTS_MISSING" } as const, isMatch: false, recordedReceipt: entry.receipt };
      const verdict = replayZoneTick({ preState: entry.preState, intents: entry.intents, expectedReceipt: entry.receipt });
      return { verdict, isMatch: isReplayMatch(verdict), recordedReceipt: entry.receipt };
    }),

  getCheckpoints: adminProcedure
    .input(z.object({ zoneId: z.string().min(1), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(aurionCausalCheckpoints).where(eq(aurionCausalCheckpoints.zoneId, input.zoneId)).orderBy(desc(aurionCausalCheckpoints.tick)).limit(input.limit);
    }),

  getDivergentCheckpoints: adminProcedure
    .input(z.object({ zoneId: z.string().min(1), limit: z.number().int().min(1).max(20).default(5) }))
    .query(({ input }) => globalCausalPersistence.getDivergentCheckpoints(input.zoneId, input.limit)),

  /** Read-only proposal; it has mutationAuthority="none". */
  planRecovery: adminProcedure
    .input(z.object({ zoneId: z.string().min(1) }))
    .query(({ input }) => globalCausalRecoveryService.planRecovery(input.zoneId)),

  getArchiveStats: adminProcedure
    .input(z.object({ zoneId: z.string().min(1) }))
    .query(({ input }) => globalCausalPersistence.getArchiveStats(input.zoneId)),

  getArchives: adminProcedure
    .input(z.object({ zoneId: z.string().min(1), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(aurionCausalArchive).where(eq(aurionCausalArchive.zoneId, input.zoneId)).orderBy(desc(aurionCausalArchive.createdAt)).limit(input.limit);
    }),

  /** Storage-only copy of verified evidence; admin required and returns a concrete receipt. */
  triggerBackup: adminProcedure
    .input(z.object({ zoneId: z.string().min(1).default("observatory_threshold") }))
    .mutation(({ input }) => globalCausalArchivingService.triggerZoneBackup(input.zoneId)),

  getPendingTransfers: adminProcedure
    .input(z.object({ worldId: z.string().default("aurion-world-01"), zoneId: z.string().min(1) }))
    .query(({ input }) => globalCrossZoneSyncService.getPendingInboundTransfers(input.worldId, input.zoneId)),

  getGlobalStateProofs: adminProcedure
    .input(z.object({ worldId: z.string().default("aurion-world-01"), limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      return db.select().from(aurionGlobalStateProofs).where(eq(aurionGlobalStateProofs.worldId, input.worldId)).orderBy(desc(aurionGlobalStateProofs.epoch)).limit(input.limit);
    }),
});
