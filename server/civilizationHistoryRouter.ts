import { z } from "zod";
import { createHash } from "node:crypto";
import {
  listCivilizationHistoryEvents,
  listRebirthCandidates,
  listVisibleRuins,
  getActiveCivilization,
} from "./aurionCivilizationHistoryPersistence";
import { orchestrateCivilizationLoop } from "./aurion/civilizationService";
import { publicProcedure, adminProcedure, router } from "./_core/trpc";

const HUB_IDS = ["observatory_threshold", "windhollow", "emberfall", "cinder_vault"] as const;

export const civilizationHistoryRouter = router({
  getActiveCivilization: publicProcedure
    .input(z.object({ worldId: z.string() }))
    .query(async ({ input }) => {
      return (await getActiveCivilization(input.worldId)) ?? null;
    }),

  getHistory: publicProcedure
    .input(z.object({ worldId: z.string() }))
    .query(async ({ input }) => {
      return listCivilizationHistoryEvents(input.worldId);
    }),

  getVisibleRuins: publicProcedure
    .input(z.object({ worldId: z.string() }))
    .query(async ({ input }) => {
      return listVisibleRuins(input.worldId);
    }),

  getRebirthCandidates: publicProcedure
    .input(z.object({ worldId: z.string() }))
    .query(async ({ input }) => {
      return listRebirthCandidates(input.worldId);
    }),

  triggerOrchestration: adminProcedure
    .input(z.object({ worldId: z.string(), epoch: z.number().int() }))
    .mutation(async ({ input }) => {
      const sourceReceiptId = createHash("sha256")
        .update(`manual_trigger_${input.worldId}_${input.epoch}`)
        .digest("hex");
      return orchestrateCivilizationLoop(input.worldId, input.epoch, sourceReceiptId);
    }),

  /**
   * Returns the NPC guild and economic overview for the admin dashboard.
   * Fetches the /healthz endpoint which already aggregates npcLife and
   * npcGuilds readback from the autonomous NPC life runtime.
   */
  getGuildOverview: adminProcedure
    .query(async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${process.env.PORT || 3000}/healthz`);
        if (!response.ok) return { available: false as const, reason: "HEALTHZ_UNAVAILABLE" };
        const health = await response.json() as Record<string, unknown>;
        const npcLife = health.npcLife as Record<string, unknown> | undefined;
        const npcGuilds = health.npcGuilds as Record<string, unknown> | undefined;
        return {
          available: true as const,
          npcLife: npcLife ?? null,
          npcGuilds: npcGuilds ?? null,
        };
      } catch {
        return { available: false as const, reason: "HEALTHZ_FETCH_FAILED" };
      }
    }),
});
