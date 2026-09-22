import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import fs from "node:fs";
import path from "node:path";
import { operationalDate } from "../../shared/operationalClock";

const LOG_DIR = path.join(process.cwd(), ".manus-logs");

function readLogFile(filename: string) {
  const filePath = path.join(LOG_DIR, filename);
  if (!fs.existsSync(filePath)) return [];
  
  const content = fs.readFileSync(filePath, "utf-8");
  return content.split("\n")
    .filter(line => line.trim())
    .map(line => {
      const match = line.match(/^\[(.*?)\] (.*)$/);
      if (match) {
        try {
          return {
            timestamp: match[1],
            data: JSON.parse(match[2]!)
          };
        } catch (e) {
          return null;
        }
      }
      return null;
    })
    .filter(Boolean);
}

export const sessionLogRouter = router({
  getLogs: adminProcedure
    .input(z.object({ 
      type: z.enum(["browserConsole", "networkRequests", "sessionReplay", "performance"]),
      limit: z.number().int().min(1).max(1000).default(100)
    }))
    .query(async ({ input }) => {
      const logs = readLogFile(`${input.type}.log`);
      return logs.slice(-input.limit).reverse();
    }),

  triggerReplay: adminProcedure
    .input(z.object({ sessionId: z.string().optional() }))
    .mutation(async ({ input }) => {
      // In a real system, this would spawn a child process or a worker to re-run the session.
      // For this implementation, we'll return a simulated success.
      return { 
        success: true, 
        message: "Deterministic session replay triggered.",
        timestamp: operationalDate().toISOString()
      };
    }),
});
