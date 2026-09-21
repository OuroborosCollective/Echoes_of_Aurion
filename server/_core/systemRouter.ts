import { router, publicProcedure } from "./trpc";
import { z } from "zod";

export const systemRouter = router({
  health: publicProcedure.query(() => {
    return { ok: true, timestamp: 0 };
  }),
  dashboardStatus: publicProcedure.query(() => {
    return [
      { service: "Database (MariaDB)", status: "UP" as const },
      { service: "Deterministic Authority", status: "UP" as const },
      { service: "Causal Graph Oracle", status: "UP" as const },
      { service: "Asset Storage & Streaming", status: "UP" as const },
    ];
  }),
  notifyOwner: publicProcedure
    .input(z.object({ title: z.string(), content: z.string() }))
    .mutation(async ({ input }) => {
      return { success: true };
    }),
});
