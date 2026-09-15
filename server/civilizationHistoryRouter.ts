import { z } from "zod";
import { createHash } from "node:crypto";
import {
  listCivilizationHistoryEvents,
  listRebirthCandidates,
  listVisibleRuins,
  getActiveCivilization,
} from "./aurionCivilizationHistoryPersistence";
import { orchestrateCivilizationLoop } from "./wasdAurionCivilizationService";
import { publicProcedure, adminProcedure, router } from "./_core/trpc";

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
});
