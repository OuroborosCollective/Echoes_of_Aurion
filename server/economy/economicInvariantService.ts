import { type EconomicEvent } from "../../shared/aurionEconomicEventContract";
import { AurionEconomicLedger, globalEconomicLedger } from "./aurionEconomicLedger";

export interface EconomicAuditReport {
  worldId: string;
  fromEpoch: number;
  toEpoch: number;
  totalEventsProcessed: number;
  currencySupplyDeltas: Record<string, { minted: string; burned: string; netDelta: string; totalTransfersVolume: string }>;
  unexplainedAssetCreations: string[];
  duplicateOwnershipViolations: string[];
  balanceDeficits: string[];
  doubleSettlementViolations: string[];
  allInvariantsPassed: boolean;
}

export class EconomicInvariantService {
  constructor(private readonly ledger: AurionEconomicLedger = globalEconomicLedger) {}

  /**
   * Runs a complete deterministic double-entry accounting audit across an epoch window.
   */
  async auditEconomy(params: {
    worldId: string;
    fromEpoch: number;
    toEpoch: number;
  }): Promise<EconomicAuditReport> {
    const { worldId, fromEpoch, toEpoch } = params;
    const events = await this.ledger.getEventsInEpochRange(worldId, fromEpoch, toEpoch);
    return this.auditEvents(events, worldId, fromEpoch, toEpoch);
  }

  /**
   * Directly audits an array of economic events for accounting and invariant violations.
   */
  auditEvents(
    events: EconomicEvent[],
    worldId: string,
    fromEpoch: number,
    toEpoch: number
  ): EconomicAuditReport {
    const currencyMinted: Record<string, bigint> = {};
    const currencyBurned: Record<string, bigint> = {};
    const currencyTransfers: Record<string, bigint> = {};

    const assetCreationCount: Record<string, number> = {};
    const assetOwnerAtStep: Record<string, string | null> = {};

    const unexplainedAssetCreations: string[] = [];
    const duplicateOwnershipViolations: string[] = [];
    const balanceDeficits: string[] = [];
    const doubleSettlementViolations: string[] = [];

    // Track simulated balances within the audit replay window
    const simBalances: Record<string, bigint> = {};
    const settledReceipts = new Set<string>();

    for (const ev of events) {
      const qty = BigInt(ev.quantity);

      // Check double settlement
      if (ev.eventType === "MARKET_SETTLEMENT") {
        if (settledReceipts.has(ev.sourceReceiptHash)) {
          doubleSettlementViolations.push(`DOUBLE_MARKET_SETTLEMENT:${ev.economicEventId}:${ev.sourceReceiptHash}`);
        }
        settledReceipts.add(ev.sourceReceiptHash);
      }

      // Currency Invariants
      if (ev.currencyId) {
        const cId = ev.currencyId;
        currencyMinted[cId] = currencyMinted[cId] ?? 0n;
        currencyBurned[cId] = currencyBurned[cId] ?? 0n;
        currencyTransfers[cId] = currencyTransfers[cId] ?? 0n;

        if (ev.eventType === "MINT" || ev.eventType === "REWARD") {
          currencyMinted[cId] += qty;
          if (ev.toOwner) {
            const key = `${cId}:${ev.toOwner}`;
            simBalances[key] = (simBalances[key] ?? 0n) + qty;
          }
        } else if (ev.eventType === "BURN") {
          currencyBurned[cId] += qty;
          if (ev.fromOwner) {
            const key = `${cId}:${ev.fromOwner}`;
            const curr = simBalances[key] ?? 0n;
            simBalances[key] = curr - qty;
          }
        } else if (
          ev.eventType === "TRANSFER" ||
          ev.eventType === "TRADE" ||
          ev.eventType === "MARKET_SETTLEMENT" ||
          ev.eventType === "GUILD_DEPOSIT" ||
          ev.eventType === "GUILD_WITHDRAW"
        ) {
          currencyTransfers[cId] += qty;
          if (ev.fromOwner && ev.toOwner) {
            const fromKey = `${cId}:${ev.fromOwner}`;
            const toKey = `${cId}:${ev.toOwner}`;
            const fromBal = simBalances[fromKey] ?? 0n;
            simBalances[fromKey] = fromBal - qty;
            simBalances[toKey] = (simBalances[toKey] ?? 0n) + qty;
          }
        }
      }

      // Unique Asset Invariants
      if (ev.assetId) {
        const aId = ev.assetId;
        if (ev.eventType === "LOOT_CREATE" || ev.eventType === "CRAFT_OUTPUT" || ev.eventType === "MINT") {
          assetCreationCount[aId] = (assetCreationCount[aId] ?? 0) + 1;
          if (assetCreationCount[aId] > 1) {
            duplicateOwnershipViolations.push(`DUPLICATE_ASSET_CREATION:${aId}:${ev.economicEventId}`);
          }
          assetOwnerAtStep[aId] = ev.toOwner ?? null;
        } else if (ev.eventType === "BURN" || ev.eventType === "CRAFT_INPUT") {
          if (!assetOwnerAtStep[aId] && !assetCreationCount[aId]) {
            unexplainedAssetCreations.push(`UNEXPLAINED_ASSET_CONSUMPTION:${aId}:${ev.economicEventId}`);
          }
          assetOwnerAtStep[aId] = null;
        } else if (
          ev.eventType === "TRANSFER" ||
          ev.eventType === "TRADE" ||
          ev.eventType === "MARKET_SETTLEMENT" ||
          ev.eventType === "GUILD_DEPOSIT" ||
          ev.eventType === "GUILD_WITHDRAW"
        ) {
          if (!assetOwnerAtStep[aId] && !assetCreationCount[aId]) {
            unexplainedAssetCreations.push(`UNEXPLAINED_ASSET_TRANSFER:${aId}:${ev.economicEventId}`);
          }
          assetOwnerAtStep[aId] = ev.toOwner ?? null;
        }
      }
    }

    const currencySupplyDeltas: Record<string, { minted: string; burned: string; netDelta: string; totalTransfersVolume: string }> = {};
    const allCurrencies = new Set([
      ...Object.keys(currencyMinted),
      ...Object.keys(currencyBurned),
      ...Object.keys(currencyTransfers),
    ]);

    for (const cId of allCurrencies) {
      const m = currencyMinted[cId] ?? 0n;
      const b = currencyBurned[cId] ?? 0n;
      const net = m - b;
      currencySupplyDeltas[cId] = {
        minted: m.toString(),
        burned: b.toString(),
        netDelta: net.toString(),
        totalTransfersVolume: (currencyTransfers[cId] ?? 0n).toString(),
      };
    }

    const allInvariantsPassed =
      unexplainedAssetCreations.length === 0 &&
      duplicateOwnershipViolations.length === 0 &&
      balanceDeficits.length === 0 &&
      doubleSettlementViolations.length === 0;

    return {
      worldId,
      fromEpoch,
      toEpoch,
      totalEventsProcessed: events.length,
      currencySupplyDeltas,
      unexplainedAssetCreations,
      duplicateOwnershipViolations,
      balanceDeficits,
      doubleSettlementViolations,
      allInvariantsPassed,
    };
  }
}

export const globalEconomicInvariantService = new EconomicInvariantService();
