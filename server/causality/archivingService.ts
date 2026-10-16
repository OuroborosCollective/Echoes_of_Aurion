import { and, desc, eq, gt } from "drizzle-orm";
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
  /** Terminal packet identity; archiveIds identifies the entire verified prefix. */
  archiveId: string | null;
  archiveIds?: readonly string[];
  startTick?: number;
  endTick?: number;
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
      // Never pull checkpoint snapshotJson blobs or an unbounded checkpoint history
      // into the Node heap. Keyset-page zone IDs, then read two ticks per zone.
      // Failure to complete a page is surfaced by the catch below; no archive
      // source rows are deleted, and no zone is silently marked as complete.
      let afterZone = "";
      const zonePageSize = 32;
      while (true) {
        const page = await db.selectDistinct({ zoneId: aurionCausalCheckpoints.zoneId })
          .from(aurionCausalCheckpoints)
          .where(and(eq(aurionCausalCheckpoints.reconciled, 1), gt(aurionCausalCheckpoints.zoneId, afterZone)))
          .orderBy(aurionCausalCheckpoints.zoneId)
          .limit(zonePageSize);
        if (page.length === 0) break;
        for (const { zoneId } of page) {
          const checkpoints = await db.select({ tick: aurionCausalCheckpoints.tick })
            .from(aurionCausalCheckpoints)
            .where(and(eq(aurionCausalCheckpoints.reconciled, 1), eq(aurionCausalCheckpoints.zoneId, zoneId)))
            .orderBy(desc(aurionCausalCheckpoints.tick))
            .limit(2);
          if (checkpoints.length < 2) continue;
          await globalCausalPersistence.archiveOldReceipts(zoneId, checkpoints[1].tick + 1);
        }
        afterZone = page[page.length - 1].zoneId;
        if (page.length < zonePageSize) break;
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
      const checkpoints = await db.select({
        id: aurionCausalCheckpoints.id,
        tick: aurionCausalCheckpoints.tick,
        snapshotHash: aurionCausalCheckpoints.snapshotHash,
        reconciled: aurionCausalCheckpoints.reconciled,
      }).from(aurionCausalCheckpoints)
        .where(eq(aurionCausalCheckpoints.zoneId, zoneId))
        .orderBy(desc(aurionCausalCheckpoints.tick)).limit(20);
      const checkpoint = checkpoints.find(candidate => candidate.reconciled === 1);
      if (!checkpoint) return Object.freeze({ protocol: "aurion.causal.backup.v1", ok: false, zoneId, checkpointId: null, checkpointTick: null, checkpointHash: null, archiveId: null, archivedCount: 0, status: "UNPROVABLE", reason: "NO_RECONCILED_CHECKPOINT" });
      const archived = await globalCausalPersistence.archiveOldReceipts(zoneId, checkpoint.tick + 1);
      if (!archived) return Object.freeze({ protocol: "aurion.causal.backup.v1", ok: false, zoneId, checkpointId: checkpoint.id, checkpointTick: checkpoint.tick, checkpointHash: checkpoint.snapshotHash, archiveId: null, archivedCount: 0, status: "NOTHING_TO_ARCHIVE" });
      if (archived.startTick !== 1 || archived.endTick < checkpoint.tick) throw new Error("CAUSAL_ARCHIVE_CHECKPOINT_NOT_COVERED");
      return Object.freeze({ protocol: "aurion.causal.backup.v1", ok: true, zoneId, checkpointId: checkpoint.id, checkpointTick: checkpoint.tick, checkpointHash: checkpoint.snapshotHash, archiveId: archived.archiveId, archiveIds: archived.archiveIds, startTick: archived.startTick, endTick: archived.endTick, archivedCount: archived.archivedCount, status: "ARCHIVED" });
    } catch (error) {
      return Object.freeze({ protocol: "aurion.causal.backup.v1", ok: false, zoneId, checkpointId: null, checkpointTick: null, checkpointHash: null, archiveId: null, archivedCount: 0, status: "ERROR", reason: error instanceof Error ? error.message : String(error) });
    }
  }
}

export const globalCausalArchivingService = new AurionCausalArchivingService();
