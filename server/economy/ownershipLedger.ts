import { type EconomicEvent } from "../../shared/aurionEconomicEventContract";
import { AurionEconomicLedger, globalEconomicLedger } from "./aurionEconomicLedger";

export interface AssetOwnershipRecord {
  assetId: string;
  worldId: string;
  currentOwner: string | null;
  status: "ACTIVE" | "BURNED";
  createdEpoch: number;
  creationReceiptHash: string;
  history: {
    epoch: number;
    fromOwner?: string;
    toOwner?: string;
    eventType: string;
    receiptHash: string;
  }[];
}

export class OwnershipLedger {
  constructor(private readonly ledger: AurionEconomicLedger = globalEconomicLedger) {}

  /**
   * Reconstructs full provenance lineage for an asset.
   */
  async getAssetLineage(assetId: string): Promise<AssetOwnershipRecord | null> {
    const events = await this.ledger.getEventsForAsset(assetId);
    if (events.length === 0) return null;

    const first = events[0];
    const history = events.map(e => ({
      epoch: e.epoch,
      fromOwner: e.fromOwner,
      toOwner: e.toOwner,
      eventType: e.eventType,
      receiptHash: e.sourceReceiptHash,
    }));

    const last = events[events.length - 1];
    const isBurned = last.eventType === "BURN" || last.eventType === "CRAFT_INPUT";

    return {
      assetId,
      worldId: first.worldId,
      currentOwner: isBurned ? null : (last.toOwner ?? null),
      status: isBurned ? "BURNED" : "ACTIVE",
      createdEpoch: first.epoch,
      creationReceiptHash: first.sourceReceiptHash,
      history,
    };
  }
}

export const globalOwnershipLedger = new OwnershipLedger();
