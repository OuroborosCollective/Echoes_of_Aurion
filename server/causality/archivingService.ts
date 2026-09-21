import { getDb } from "../db";
import { globalCausalPersistence } from "./persistence";

export class AurionCausalArchivingService {
  private isRunning = false;
  private interval: NodeJS.Timeout | null = null;

  start(intervalMs: number = 300000) { // Every 5 minutes
    if (this.interval) return;
    
    console.log("[Archiving] Starting Causal Chain Archiving Service...");
    this.interval = setInterval(() => this.runArchiveCycle(), intervalMs);
    // Also run immediately
    this.runArchiveCycle();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async runArchiveCycle() {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // For each zone, find reconciled checkpoints and archive older receipts
      // We look for checkpoints that are at least 1000 ticks old or verified long ago
      // To keep it simple for now, we archive anything before the 2nd latest reconciled checkpoint
      
      const db = await getDb();
      if (!db) return;

      const { aurionCausalCheckpoints } = await import("../../drizzle/aurionCausalitySchema");
      const { eq, and, desc } = await import("drizzle-orm");

      // Find zones with reconciled checkpoints
      const checkpoints = await db.select()
        .from(aurionCausalCheckpoints)
        .where(eq(aurionCausalCheckpoints.reconciled, 1))
        .orderBy(desc(aurionCausalCheckpoints.tick));

      const zones = [...new Set(checkpoints.map((c: any) => c.zoneId))];

      for (const zoneId of zones) {
        const zoneCheckpoints = checkpoints.filter((c: any) => c.zoneId === zoneId);
        if (zoneCheckpoints.length < 2) continue;

        // Keep the latest reconciled checkpoint's receipts for immediate forensic work
        // Archive everything before the one before it
        const archiveThresholdTick = zoneCheckpoints[1].tick;
        
        console.log(`[Archiving] Archiving receipts for zone ${zoneId} before tick ${archiveThresholdTick}`);
        const result = await globalCausalPersistence.archiveOldReceipts(zoneId, archiveThresholdTick);
        
        if (result) {
          console.log(`[Archiving] Archived ${result.archivedCount} receipts into ${result.archiveId}`);
        }
      }
    } catch (error) {
      console.error("[Archiving] Cycle failed:", error);
    } finally {
      this.isRunning = false;
    }
  }

  async triggerZoneBackup(zoneId: string): Promise<boolean> {
    console.log(`[Archiving] Manual backup triggered for zone ${zoneId}`);
    try {
      const db = await getDb();
      if (!db) return false;
      
      // Look for the latest checkpoint
      const { aurionCausalCheckpoints } = await import("../../drizzle/aurionCausalitySchema");
      const { eq, desc } = await import("drizzle-orm");
      const checkpoints = await db.select()
        .from(aurionCausalCheckpoints)
        .where(eq(aurionCausalCheckpoints.zoneId, zoneId))
        .orderBy(desc(aurionCausalCheckpoints.tick))
        .limit(1);
        
      if (checkpoints.length > 0) {
        const latestTick = checkpoints[0].tick;
        await globalCausalPersistence.archiveOldReceipts(zoneId, latestTick);
      }
      return true;
    } catch (error) {
      console.error("[Archiving] Manual backup failed:", error);
      return false;
    }
  }
}

export const globalCausalArchivingService = new AurionCausalArchivingService();
