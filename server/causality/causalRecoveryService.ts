import { eq, desc } from "drizzle-orm";
import { getDb } from "../db";
import { globalCausalPersistence } from "./persistence";
import { aurionCausalCheckpoints } from "../../drizzle/aurionCausalitySchema";

/**
 * Service for handling causal divergence recovery and zone repair.
 */
export class AurionCausalRecoveryService {

  /**
   * Automatically triggered when a determinism divergence is detected.
   * Finds the last known good checkpoint and initiates a zone repair.
   */
  public async triggerAutomaticRollback(zoneId: string): Promise<boolean> {
    console.warn(`[C-Aurion] TRIGGERING AUTOMATIC ROLLBACK FOR ZONE ${zoneId}`);
    
    const db = await getDb();
    if (!db) return false;

    try {
      // Find the last known reconciled checkpoint
      const results = await db.select()
        .from(aurionCausalCheckpoints)
        .where(eq(aurionCausalCheckpoints.zoneId, zoneId))
        .orderBy(desc(aurionCausalCheckpoints.tick))
        .limit(10);
      
      const lastGood = results.find(c => c.reconciled === 1);
      
      if (!lastGood) {
        console.error(`[C-Aurion] Automatic rollback failed: No reconciled checkpoint found for ${zoneId}`);
        return false;
      }

      console.log(`[C-Aurion] Repairing zone ${zoneId} from checkpoint ${lastGood.id} (tick ${lastGood.tick})`);
      await globalCausalPersistence.repairZone(zoneId, lastGood.id);
      console.log(`[C-Aurion] ROLLBACK SUCCESSFUL for ${zoneId}`);
      return true;

    } catch (error) {
      console.error(`[C-Aurion] Automatic rollback failed for ${zoneId}:`, error);
      return false;
    }
  }

  /**
   * API for manual zone repair.
   */
  public async repairFromCheckpoint(zoneId: string, checkpointId: string): Promise<boolean> {
    try {
      await globalCausalPersistence.repairZone(zoneId, checkpointId);
      return true;
    } catch (error) {
      console.error(`[C-Aurion] Manual repair failed for ${zoneId}:`, error);
      return false;
    }
  }
}

export const globalCausalRecoveryService = new AurionCausalRecoveryService();
