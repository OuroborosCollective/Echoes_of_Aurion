import {
  type EconomicEvent,
  type EconomicEventType,
  createEconomicEvent,
  verifyEconomicEventIntegrity,
} from "../../shared/aurionEconomicEventContract";

export class AurionEconomicLedger {
  private eventsById: Map<string, EconomicEvent> = new Map();
  private eventsByReceipt: Map<string, string[]> = new Map();
  private eventsByAsset: Map<string, string[]> = new Map();
  private eventsByOwner: Map<string, string[]> = new Map();
  private eventsByWorld: Map<string, string[]> = new Map();

  // Materialized accounting state for fast readmodel checks
  // worldId:currencyId:owner -> BigInt balance
  private balances: Map<string, bigint> = new Map();
  // worldId:assetId -> currentOwnerId
  private assetOwners: Map<string, string> = new Map();
  // worldId:currencyId -> BigInt total minted - total burned
  private totalSupplies: Map<string, bigint> = new Map();

  clear(): void {
    this.eventsById.clear();
    this.eventsByReceipt.clear();
    this.eventsByAsset.clear();
    this.eventsByOwner.clear();
    this.eventsByWorld.clear();
    this.balances.clear();
    this.assetOwners.clear();
    this.totalSupplies.clear();
  }

  async recordEvent(event: EconomicEvent): Promise<{ accepted: boolean; eventHash: string; reason?: string }> {
    const check = verifyEconomicEventIntegrity(event);
    if (!check.valid) {
      return { accepted: false, eventHash: event.economicEventHash, reason: check.reason };
    }

    // Check duplicate ID
    const existing = this.eventsById.get(event.economicEventId);
    if (existing) {
      if (existing.economicEventHash === event.economicEventHash) {
        return { accepted: true, eventHash: event.economicEventHash };
      }
      return { accepted: false, eventHash: event.economicEventHash, reason: "CONTRADICTING_EVENT_ID" };
    }

    const qty = BigInt(event.quantity);

    // Apply accounting mutations strictly
    if (event.currencyId) {
      const supplyKey = `${event.worldId}::${event.currencyId}`;
      const currentSupply = this.totalSupplies.get(supplyKey) ?? 0n;

      if (event.eventType === "MINT" || event.eventType === "REWARD") {
        if (!event.toOwner) return { accepted: false, eventHash: event.economicEventHash, reason: "MISSING_TO_OWNER" };
        const balKey = `${event.worldId}::${event.currencyId}::${event.toOwner}`;
        const prevBal = this.balances.get(balKey) ?? 0n;
        this.balances.set(balKey, prevBal + qty);
        this.totalSupplies.set(supplyKey, currentSupply + qty);
      } else if (event.eventType === "BURN") {
        if (!event.fromOwner) return { accepted: false, eventHash: event.economicEventHash, reason: "MISSING_FROM_OWNER" };
        const balKey = `${event.worldId}::${event.currencyId}::${event.fromOwner}`;
        const prevBal = this.balances.get(balKey) ?? 0n;
        if (prevBal < qty) {
          return { accepted: false, eventHash: event.economicEventHash, reason: "INSUFFICIENT_BALANCE_FOR_BURN" };
        }
        this.balances.set(balKey, prevBal - qty);
        this.totalSupplies.set(supplyKey, currentSupply - qty);
      } else if (
        event.eventType === "TRANSFER" ||
        event.eventType === "TRADE" ||
        event.eventType === "MARKET_SETTLEMENT" ||
        event.eventType === "GUILD_DEPOSIT" ||
        event.eventType === "GUILD_WITHDRAW"
      ) {
        if (!event.fromOwner || !event.toOwner) {
          return { accepted: false, eventHash: event.economicEventHash, reason: "TRANSFER_REQUIRES_BOTH_OWNERS" };
        }
        const fromKey = `${event.worldId}::${event.currencyId}::${event.fromOwner}`;
        const toKey = `${event.worldId}::${event.currencyId}::${event.toOwner}`;
        const fromBal = this.balances.get(fromKey) ?? 0n;
        if (fromBal < qty) {
          return { accepted: false, eventHash: event.economicEventHash, reason: "INSUFFICIENT_BALANCE_FOR_TRANSFER" };
        }
        const toBal = this.balances.get(toKey) ?? 0n;
        this.balances.set(fromKey, fromBal - qty);
        this.balances.set(toKey, toBal + qty);
      }
    }

    // Unique Item / Asset Ownership Tracking
    if (event.assetId) {
      const assetKey = `${event.worldId}::${event.assetId}`;
      const currentOwner = this.assetOwners.get(assetKey);

      if (event.eventType === "LOOT_CREATE" || event.eventType === "CRAFT_OUTPUT" || event.eventType === "MINT") {
        if (currentOwner) {
          return { accepted: false, eventHash: event.economicEventHash, reason: "ASSET_ALREADY_EXISTS" };
        }
        if (!event.toOwner) {
          return { accepted: false, eventHash: event.economicEventHash, reason: "MISSING_ASSET_CREATION_OWNER" };
        }
        this.assetOwners.set(assetKey, event.toOwner);
      } else if (event.eventType === "BURN" || event.eventType === "CRAFT_INPUT") {
        if (currentOwner !== event.fromOwner) {
          return { accepted: false, eventHash: event.economicEventHash, reason: "BURN_FROM_NON_OWNER" };
        }
        this.assetOwners.delete(assetKey);
      } else if (
        event.eventType === "TRANSFER" ||
        event.eventType === "TRADE" ||
        event.eventType === "MARKET_SETTLEMENT" ||
        event.eventType === "GUILD_DEPOSIT" ||
        event.eventType === "GUILD_WITHDRAW"
      ) {
        if (currentOwner !== event.fromOwner) {
          return { accepted: false, eventHash: event.economicEventHash, reason: "TRANSFER_FROM_NON_OWNER" };
        }
        if (!event.toOwner) {
          return { accepted: false, eventHash: event.economicEventHash, reason: "MISSING_DESTINATION_OWNER" };
        }
        this.assetOwners.set(assetKey, event.toOwner);
      }
    }

    // Append to index
    this.eventsById.set(event.economicEventId, Object.freeze({ ...event }));

    const receiptList = this.eventsByReceipt.get(event.sourceReceiptHash) ?? [];
    receiptList.push(event.economicEventId);
    this.eventsByReceipt.set(event.sourceReceiptHash, receiptList);

    const worldList = this.eventsByWorld.get(event.worldId) ?? [];
    worldList.push(event.economicEventId);
    this.eventsByWorld.set(event.worldId, worldList);

    if (event.assetId) {
      const aList = this.eventsByAsset.get(event.assetId) ?? [];
      aList.push(event.economicEventId);
      this.eventsByAsset.set(event.assetId, aList);
    }

    if (event.fromOwner) {
      const fList = this.eventsByOwner.get(event.fromOwner) ?? [];
      fList.push(event.economicEventId);
      this.eventsByOwner.set(event.fromOwner, fList);
    }
    if (event.toOwner && event.toOwner !== event.fromOwner) {
      const tList = this.eventsByOwner.get(event.toOwner) ?? [];
      tList.push(event.economicEventId);
      this.eventsByOwner.set(event.toOwner, tList);
    }

    return { accepted: true, eventHash: event.economicEventHash };
  }

  getCurrencyBalance(worldId: string, currencyId: string, ownerId: string): string {
    const balKey = `${worldId}::${currencyId}::${ownerId}`;
    return (this.balances.get(balKey) ?? 0n).toString();
  }

  getAssetOwner(worldId: string, assetId: string): string | null {
    return this.assetOwners.get(`${worldId}::${assetId}`) ?? null;
  }

  getTotalCurrencySupply(worldId: string, currencyId: string): string {
    const supplyKey = `${worldId}::${currencyId}`;
    return (this.totalSupplies.get(supplyKey) ?? 0n).toString();
  }

  async getEventsForAsset(assetId: string): Promise<EconomicEvent[]> {
    const ids = this.eventsByAsset.get(assetId) ?? [];
    const res: EconomicEvent[] = [];
    for (const id of ids) {
      const ev = this.eventsById.get(id);
      if (ev) res.push({ ...ev });
    }
    return res.sort((a, b) => a.epoch - b.epoch || a.economicEventId.localeCompare(b.economicEventId));
  }

  async getEventsForWorld(worldId: string): Promise<EconomicEvent[]> {
    const ids = this.eventsByWorld.get(worldId) ?? [];
    const res: EconomicEvent[] = [];
    for (const id of ids) {
      const ev = this.eventsById.get(id);
      if (ev) res.push({ ...ev });
    }
    return res.sort((a, b) => a.epoch - b.epoch || a.economicEventId.localeCompare(b.economicEventId));
  }

  async getEventsInEpochRange(worldId: string, fromEpoch: number, toEpoch: number): Promise<EconomicEvent[]> {
    const worldEvents = await this.getEventsForWorld(worldId);
    return worldEvents.filter(ev => ev.epoch >= fromEpoch && ev.epoch <= toEpoch);
  }
}

export const globalEconomicLedger = new AurionEconomicLedger();
