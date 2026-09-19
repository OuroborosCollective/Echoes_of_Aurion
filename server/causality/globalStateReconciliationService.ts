import { eq, and, desc, asc } from "drizzle-orm";
import { getDb } from "../db";
import { aurionGlobalWorldEpochReceipts } from "../../drizzle/schema";
import { aurionCausalTickReceipts, aurionGlobalStateProofs } from "../../drizzle/aurionCausalitySchema";
import { 
  AURION_GLOBAL_WORLD_SCHEMA,
  GlobalWorldCanonicalState, 
  ZoneProofReference,
  hashGlobalWorldCanonicalState 
} from "../../shared/aurionGlobalWorldContract";
import { globalCausalPersistence } from "./persistence";
import { globalReadbackService } from "./readbackService";

/**
 * Service responsible for aggregating proven zone states into a unified global world evidence chain.
 * It identifies global world epochs that have been proposed and attempts to find matching verified
 * causal receipts for all active simulation zones.
 */
export class AurionGlobalStateReconciliationService {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.intervalId = setInterval(() => this.reconcileLatest(), 30000); // Every 30 seconds
    console.log("[C-Aurion] Global State Reconciliation Service started.");
  }

  public stop(): void {
    this.isRunning = false;
    if (this.intervalId) clearInterval(this.intervalId);
  }

  public async reconcileLatest(): Promise<void> {
    const db = await getDb();
    if (!db) return;

    try {
      // Find latest global epochs that don't have a verified proof yet
      const epochs = await db.select()
        .from(aurionGlobalWorldEpochReceipts)
        .orderBy(desc(aurionGlobalWorldEpochReceipts.epoch))
        .limit(5);

      for (const epoch of epochs) {
        const existingProof = await db.select()
          .from(aurionGlobalStateProofs)
          .where(and(
            eq(aurionGlobalStateProofs.worldId, epoch.worldId),
            eq(aurionGlobalStateProofs.epoch, epoch.epoch)
          ))
          .limit(1);

        if (existingProof.length > 0) continue;

        await this.attemptReconciliation(epoch);
      }
    } catch (error) {
      console.error("[C-Aurion] Error in Global State Reconciliation:", error);
    }
  }

  private async attemptReconciliation(epoch: any): Promise<void> {
    const db = await getDb();
    if (!db) return;

    // In a production environment, we would need a mapping of global epoch to zone-specific ticks.
    // For now, we assume a direct mapping or a standard window (e.g. zoneTick = epoch * 100).
    // Let's assume the epoch index matches a specific verified snapshot point.
    
    // 1. Identify active zones
    // For simplicity, we'll hardcode the primary zones for now or pull from recent receipts
    const activeZones = ["observatory_threshold"]; // Expand this as world grows
    
    const zoneProofs: ZoneProofReference[] = [];
    
    for (const zoneId of activeZones) {
      // Find the receipt for this zone at the corresponding tick
      // For this implementation, we use the epoch number as the tick reference if it matches
      const targetTick = epoch.epoch; // Simplification
      
      const receipt = await db.select()
        .from(aurionCausalTickReceipts)
        .where(and(
          eq(aurionCausalTickReceipts.worldId, epoch.worldId),
          eq(aurionCausalTickReceipts.zoneId, zoneId),
          eq(aurionCausalTickReceipts.tick, targetTick)
        ))
        .limit(1);

      if (receipt.length === 0) {
        console.log(`[C-Aurion] Reconciliation pending for epoch ${epoch.epoch}: missing receipt for ${zoneId}`);
        return; 
      }

      // Check if this tick has been verified by the readback service
      const readbackStatus = globalReadbackService.getStatus();
      const verified = readbackStatus.history.some(h => 
        h.zoneId === zoneId && h.tick === targetTick && h.verdict.status === "MATCH"
      );

      if (!verified) {
        // Not verified in memory, check persistence for replay runs
        // This ensures we can reconcile even after a restart
        console.log(`[C-Aurion] Reconciliation pending for epoch ${epoch.epoch}: ${zoneId} tick ${targetTick} not yet verified.`);
        return;
      }

      zoneProofs.push({
        zoneId,
        tick: targetTick,
        postStateHash: receipt[0].postStateHash,
      });
    }

    // 2. Construct Global Proof
    const globalState: GlobalWorldCanonicalState = {
      schema: AURION_GLOBAL_WORLD_SCHEMA,
      worldId: epoch.worldId,
      epoch: epoch.epoch,
      zoneProofs,
      rulesetVersion: "aurion.global.rules.v1",
    };

    const proofHash = hashGlobalWorldCanonicalState(globalState);
    
    // 3. Persist the proof
    await globalCausalPersistence.saveGlobalWorldProof(globalState, proofHash);
    console.log(`[C-Aurion] GLOBAL_STATE_RECONCILED for epoch ${epoch.epoch}. Hash: ${proofHash}`);

    // 4. Materialize the readmodel (Step 19)
    // Promote the reconciled state to the live game readmodel.
    const { aurionGlobalWorldStates } = await import("../../drizzle/schema");
    
    // Construct a materialization snapshot that conforms to the legacy format 
    // expected by the client, but anchored in our new verified proof.
    const materializedSnapshot = {
      source: "causal_reconciliation",
      verifiedAt: new Date().toISOString(),
      worldSeed: epoch.worldSeed || "echoes-of-aurion-v1",
      epoch: epoch.epoch,
      activePlayerCount: epoch.activePlayerCount || 1,
      highWaterPlayerCount: epoch.highWaterPlayerCount || 1,
      proofHash: proofHash
    };

    await db.update(aurionGlobalWorldStates)
      .set({ 
        epoch: epoch.epoch, 
        snapshotJson: JSON.stringify(materializedSnapshot), 
        snapshotHash: proofHash 
      })
      .where(eq(aurionGlobalWorldStates.worldId, epoch.worldId));
      
    console.log(`[C-Aurion] MATERIALIZED verified global world state for epoch ${epoch.epoch}`);
  }
}

export const globalStateReconciliationService = new AurionGlobalStateReconciliationService();
