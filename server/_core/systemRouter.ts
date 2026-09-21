import { z } from "zod";
import { notifyOwner } from "./notification";
import { adminProcedure, publicProcedure, router } from "./trpc";
import { canConnectToDatabase, isConfiguredDatabaseUrl } from "../db";
import { createClient } from "redis";

export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),

  dashboardStatus: adminProcedure
    .query(async () => {
      const statuses: Array<{ service: string; status: "UP" | "DOWN" | "MAINTAINED"; reason?: string }> = [];

      // 1. API
      statuses.push({ service: "API (Core)", status: "UP" });

      // 2. Database
      if (!process.env.DATABASE_URL || !isConfiguredDatabaseUrl(process.env.DATABASE_URL)) {
        statuses.push({ service: "Database (MariaDB/MySQL)", status: "MAINTAINED", reason: "DATABASE_URL environment variable is missing or improperly configured" });
      } else {
        try {
          const ok = await canConnectToDatabase(2000);
          if (ok) {
            statuses.push({ service: "Database (MariaDB/MySQL)", status: "UP" });
          } else {
            statuses.push({ service: "Database (MariaDB/MySQL)", status: "DOWN", reason: "Connection timed out or failed to execute verification query" });
          }
        } catch (error: any) {
          statuses.push({ service: "Database (MariaDB/MySQL)", status: "DOWN", reason: error.message || "Unknown database error" });
        }
      }

      // 3. Redis
      if (!process.env.REDIS_URL) {
        statuses.push({ service: "Redis (Cache & PubSub)", status: "MAINTAINED", reason: "REDIS_URL environment variable not configured" });
      } else {
        try {
          const client = createClient({ url: process.env.REDIS_URL });
          client.on("error", () => {}); // Suppress unhandled error events
          await client.connect();
          await client.ping();
          await client.quit();
          statuses.push({ service: "Redis (Cache & PubSub)", status: "UP" });
        } catch (error: any) {
          statuses.push({ service: "Redis (Cache & PubSub)", status: "DOWN", reason: error.message || "Failed to connect to Redis" });
        }
      }

      // 4. Firebase
      if (!process.env.FIREBASE_PROJECT_ID && !process.env.FIREBASE_CONFIG) {
        statuses.push({ service: "Firebase (Auth / Firestore)", status: "MAINTAINED", reason: "Firebase configuration is completely missing from environment variables" });
      } else {
        // We lack actual firebase-admin in package, so if it's there but we can't load it, it's down
        statuses.push({ service: "Firebase (Auth / Firestore)", status: "DOWN", reason: "Firebase dependencies not initialized in backend runtime" });
      }

      return statuses;
    }),

  notifyOwner: adminProcedure
    .input(
      z.object({
        title: z.string().min(1, "title is required"),
        content: z.string().min(1, "content is required"),
      })
    )
    .mutation(async ({ input }) => {
      const delivered = await notifyOwner(input);
      return {
        success: delivered,
      } as const;
    }),
});
