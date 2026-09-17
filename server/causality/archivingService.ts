import { desc, eq } from "drizzle-orm";
import { aurionCausalCheckpoints } from "../../drizzle/aurionCausalitySchema";
import { getDb } from "../db";
import { globalCausalPersistence } from "./persistence";

export type CausalBackupReceipt = Readonly<{
  protocol: "aurion.causal.backup.v1";
  ok: boolean;
  zoneId: string;
  checkpointId: string | null;
  checkpointTick: number | null;
  checkpointHash: string | null;
  archiveId: string | null;
  archivedCount: number;
  status: "ARCHIVED" | "UNPROVABLE" | "NOTHING_TO_ARCHIVE" | "ERROR";
  reason?: string;
}>;

export class AurionCausalArchivingService {
  private isRunning = false;
  private interval: NodeJS.Timeout | null = null;

  start(intervalMs = 300_000): void {
    if (this.interval) return;
    this.interval = setInterval(() => void this.runArchiveCycle(), intervalMs);
    void this.runArchiveCycle();
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private async runArchiveCycle(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    try {
      const db = await getDb();
      if (!db) return;
      const checkpoints = await db.select().from(aurionCausalCheckpoints)
        .where(eq(aurionCausalCheckpoints.reconciled, 1))
        .orderBy(desc(aurionCausalCheckpoints.tick));
      const zones = Array.from(new Set(checkpoints.map(checkpoint => checkpoint.zoneId)));
      for (const zoneId of zones) {
        const zoneCheckpoints = checkpoints.filter(checkpoint => checkpoint.zoneId === zoneId);
        if (zoneCheckpoints.length < 2) continue;
        const threshold = zoneCheckpoints[1].tick + 1;
        await globalCausalPersistence.archiveOldReceipts(zoneId, threshold);
      }
    } catch (error) {
      console.error("[C-Aurion] Archive cycle failed", error);
    } finally {
      this.isRunning = false;
    }
  }

  /** Manual backup is admin-only at the router and returns concrete readback evidence. */
  async triggerZoneBackup(zoneId: string): Promise<CausalBackupReceipt> {
    try {
      const db = await getDb();
      if (!db) return Object.freeze({ protocol: "aurion.causal.backup.v1", ok: false, zoneId, checkpointId: null, checkpointTick: null, checkpointHash: null, archiveId: null, archivedCount: 0, status: "UNPROVABLE", reason: "DATABASE_UNAVAILABLE" });
      const checkpoints = await db.select().from(aurionCausalCheckpoints)
        .where(eq(aurionCausalCheckpoints.zoneId, zoneId))
        .orderBy(desc(aurionCausalCheckpoints.tick)).limit(20);
      const checkpoint = checkpoints.find(candidate => candidate.reconciled === 1);
      if (!checkpoint) return Object.freeze({ protocol: "aurion.causal.backup.v1", ok: false, zoneId, checkpointId: null, checkpointTick: null, checkpointHash: null, archiveId: null, archivedCount: 0, status: "UNPROVABLE", reason: "NO_RECONCILED_CHECKPOINT" });
      const archived = await globalCausalPersistence.archiveOldReceipts(zoneId, checkpoint.tick + 1);
      if (!archived) return Object.freeze({ protocol: "aurion.causal.backup.v1", ok: false, zoneId, checkpointId: checkpoint.id, checkpointTick: checkpoint.tick, checkpointHash: checkpoint.snapshotHash, archiveId: null, archivedCount: 0, status: "NOTHING_TO_ARCHIVE" });
      return Object.freeze({ protocol: "aurion.causal.backup.v1", ok: true, zoneId, checkpointId: checkpoint.id, checkpointTick: checkpoint.tick, checkpointHash: checkpoint.snapshotHash, archiveId: archived.archiveId, archivedCount: archived.archivedCount, status: "ARCHIVED" });
    } catch (error) {
      return Object.freeze({ protocol: "aurion.causal.backup.v1", ok: false, zoneId, checkpointId: null, checkpointTick: null, checkpointHash: null, archiveId: null, archivedCount: 0, status: "ERROR", reason: error instanceof Error ? error.message : String(error) });
    }
  }
}

export const globalCausalArchivingService = new AurionCausalArchivingService();
