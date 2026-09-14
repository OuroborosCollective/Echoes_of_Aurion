import { z } from "zod";
import {
  listCivilizationHistoryEvents,
  listRebirthCandidates,
  listVisibleRuins,
} from "./aurionCivilizationHistoryPersistence";
import { publicProcedure, router } from "./trpc";

export const civilizationHistoryRouter = router({
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
});
