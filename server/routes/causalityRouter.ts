import { getDb } from "../db";
import { z } from "zod";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import { globalCausalPersistence } from "../causality/persistence";
import { globalCausalArchivingService } from "../causality/archivingService";
import { globalCrossZoneSyncService } from "../causality/crossZoneSynchronizationService";
import { replayZoneTick } from "../causality/replayZoneTick";
import { isReplayMatch } from "../../shared/aurionReplayContract";
import { globalReadbackService } from "../causality/readbackService";
import { globalTickRecorder } from "../causality/tickRecorder";

export const causalityRouter = router({
  getReadbackStatus: adminProcedure
    .query(async () => {
      const status = globalReadbackService.getStatus();
      const receipts = globalTickRecorder.getReceipts();
      return {
        observedTicks: receipts.length,
        verifiedTicks: status.verifiedTicks,
        divergences: status.divergences,
        unprovable: 0,
      };
    }),

  planRecovery: adminProcedure
    .input(z.object({ zoneId: z.string().default("observatory_threshold") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) {
        return {
          status: "UNAVAILABLE" as const,
          reason: "Database not connected for recovery evidence.",
          mutationAuthority: "none" as const,
        };
      }
      const { aurionCausalCheckpoints } = await import("../../drizzle/aurionCausalitySchema");
      const { eq, desc, and } = await import("drizzle-orm");
      const results = await db.select()
        .from(aurionCausalCheckpoints)
        .where(and(eq(aurionCausalCheckpoints.zoneId, input.zoneId), eq(aurionCausalCheckpoints.reconciled, 1)))
        .orderBy(desc(aurionCausalCheckpoints.tick))
        .limit(1);

      if (results.length === 0) {
        return {
          status: "UNAVAILABLE" as const,
          reason: `No reconciled checkpoint found for zone ${input.zoneId}.`,
          mutationAuthority: "none" as const,
        };
      }

      const cp = results[0];
      return {
        status: "AVAILABLE" as const,
        checkpointId: cp.id,
        checkpointTick: cp.tick,
        snapshotHash: cp.snapshotHash,
        mutationAuthority: "none" as const,
      };
    }),

  getLatestReceipts: adminProcedure
    .input(z.object({ zoneId: z.string().optional() }).optional())
    .query(async ({ input }) => {
      const zoneId = input?.zoneId;
      if (zoneId) {
        const receipt = await globalCausalPersistence.getLatestReceipt(zoneId);
        return receipt ? [receipt] : [];
      }
      // If no zoneId, we could list all, but for now let's just support specific zone or nothing
      return [];
    }),

  getRecordedTick: adminProcedure
    .input(z.object({ zoneId: z.string(), tick: z.number().int().min(0) }))
    .query(async ({ input }) => {
      return await globalCausalPersistence.getRecordedTick(input.zoneId, input.tick);
    }),

  replayTick: adminProcedure
    .input(z.object({ zoneId: z.string(), tick: z.number().int().min(0) }))
    .query(async ({ input }) => {
      const entry = await globalCausalPersistence.getRecordedTick(input.zoneId, input.tick);
      if (!entry) {
        throw new Error(`Tick ${input.tick} for zone ${input.zoneId} not found in persistence.`);
      }
      if (!entry.preState || !entry.intents) {
        throw new Error(`Tick ${input.tick} for zone ${input.zoneId} is missing pre-state or intents for replay.`);
      }

      const verdict = replayZoneTick({
        preState: entry.preState,
        intents: entry.intents,
        expectedReceipt: entry.receipt,
      });

      return {
        verdict,
        isMatch: isReplayMatch(verdict),
        recordedReceipt: entry.receipt,
      };
    }),

  getCheckpoints: adminProcedure
    .input(z.object({ zoneId: z.string(), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ input }) => {
      const db = await getDb(); // Hack for now or make it public
      if (!db) return [];
      
      const { aurionCausalCheckpoints } = await import("../../drizzle/aurionCausalitySchema");
      const { eq, desc, and } = await import("drizzle-orm");

      return await db.select()
        .from(aurionCausalCheckpoints)
        .where(eq(aurionCausalCheckpoints.zoneId, input.zoneId))
        .orderBy(desc(aurionCausalCheckpoints.tick))
        .limit(input.limit);
    }),

  getDivergentCheckpoints: adminProcedure
    .input(z.object({ zoneId: z.string(), limit: z.number().int().min(1).max(20).default(5) }))
    .query(async ({ input }) => {
      return await globalCausalPersistence.getDivergentCheckpoints(input.zoneId, input.limit);
    }),

  repairZone: adminProcedure
    .input(z.object({ zoneId: z.string(), checkpointId: z.string() }))
    .mutation(async ({ input }) => {
      await globalCausalPersistence.repairZone(input.zoneId, input.checkpointId);
      return { success: true };
    }),

  getArchiveStats: adminProcedure
    .input(z.object({ zoneId: z.string() }))
    .query(async ({ input }) => {
      return await globalCausalPersistence.getArchiveStats(input.zoneId);
    }),

  getArchives: adminProcedure
    .input(z.object({ zoneId: z.string(), limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { aurionCausalArchive } = await import("../../drizzle/aurionCausalitySchema");
      const { eq, desc } = await import("drizzle-orm");

      return await db.select()
        .from(aurionCausalArchive)
        .where(eq(aurionCausalArchive.zoneId, input.zoneId))
        .orderBy(desc(aurionCausalArchive.createdAt))
        .limit(input.limit);
    }),
  
  triggerBackup: protectedProcedure
    .input(z.object({ zoneId: z.string().default("observatory_threshold") }))
    .mutation(async ({ input }) => {
      return globalCausalArchivingService.triggerZoneBackup(input.zoneId);
    }),

  getPendingTransfers: adminProcedure
    .input(z.object({ worldId: z.string().default("aurion-world-01"), zoneId: z.string().optional() }))
    .query(async ({ input }) => {
      if (!input.zoneId) return [];
      return await globalCrossZoneSyncService.getPendingInboundTransfers(input.worldId, input.zoneId);
    }),

  getGlobalStateProofs: adminProcedure
    .input(z.object({ worldId: z.string().default("aurion-world-01"), limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { aurionGlobalStateProofs } = await import("../../drizzle/aurionCausalitySchema");
      const { eq, desc } = await import("drizzle-orm");

      return await db.select()
        .from(aurionGlobalStateProofs)
        .where(eq(aurionGlobalStateProofs.worldId, input.worldId))
        .orderBy(desc(aurionGlobalStateProofs.epoch))
        .limit(input.limit);
    }),

  triggerAutomaticRollback: adminProcedure
    .input(z.object({ zoneId: z.string().default("observatory_threshold") }))
    .mutation(async ({ input }) => {
      const { globalCausalRecoveryService } = await import("../causality/causalRecoveryService");
      return await globalCausalRecoveryService.triggerAutomaticRollback(input.zoneId);
    }),

  repairFromCheckpoint: adminProcedure
    .input(z.object({ zoneId: z.string(), checkpointId: z.string() }))
    .mutation(async ({ input }) => {
      const { globalCausalRecoveryService } = await import("../causality/causalRecoveryService");
      return await globalCausalRecoveryService.repairFromCheckpoint(input.zoneId, input.checkpointId);
    }),
});
