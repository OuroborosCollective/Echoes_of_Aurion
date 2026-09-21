import { describe, it, expect, beforeEach } from "vitest";
import { AurionEconomicLedger } from "./aurionEconomicLedger";
import { EconomicInvariantService } from "./economicInvariantService";
import { createEconomicEvent } from "../../shared/aurionEconomicEventContract";

describe("EconomicInvariantService", () => {
  let ledger: AurionEconomicLedger;
  let service: EconomicInvariantService;

  beforeEach(() => {
    ledger = new AurionEconomicLedger();
    service = new EconomicInvariantService(ledger);
  });

  it("passes audit when double-entry transfers and asset minting conserve value", async () => {
    // 1. Reward mints 100 gold to Player A
    const ev1 = createEconomicEvent({
      economicEventId: "eco_reward_100",
      worldId: "world-economy",
      epoch: 10,
      eventType: "REWARD",
      currencyId: "gold",
      toOwner: "player:A",
      quantity: "100",
      sourceReceiptHash: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
      worldRootHash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    });
    const r1 = await ledger.recordEvent(ev1);
    expect(r1.accepted).toBe(true);

    // 2. Player A transfers 40 gold to Player B
    const ev2 = createEconomicEvent({
      economicEventId: "eco_transfer_40",
      worldId: "world-economy",
      epoch: 15,
      eventType: "TRANSFER",
      currencyId: "gold",
      fromOwner: "player:A",
      toOwner: "player:B",
      quantity: "40",
      sourceReceiptHash: "sha256:0000000000000000000000000000000000000000000000000000000000000002",
      worldRootHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    });
    const r2 = await ledger.recordEvent(ev2);
    expect(r2.accepted).toBe(true);

    const report = await service.auditEconomy({
      worldId: "world-economy",
      fromEpoch: 1,
      toEpoch: 20,
    });

    expect(report.allInvariantsPassed).toBe(true);
    expect(report.currencySupplyDeltas.gold.minted).toBe("100");
    expect(report.currencySupplyDeltas.gold.burned).toBe("0");
    expect(report.currencySupplyDeltas.gold.netDelta).toBe("100");
    expect(report.currencySupplyDeltas.gold.totalTransfersVolume).toBe("40");
  });

  it("detects double market settlement violation", async () => {
    const receipt = "sha256:3333333333333333333333333333333333333333333333333333333333333333";
    const ev1 = createEconomicEvent({
      economicEventId: "eco_market_settlement_1",
      worldId: "world-economy",
      epoch: 25,
      eventType: "MARKET_SETTLEMENT",
      currencyId: "gold",
      fromOwner: "player:buyer",
      toOwner: "player:seller",
      quantity: "50",
      sourceReceiptHash: receipt,
      worldRootHash: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    });

    // Replay / duplicated payout attempt with same receipt
    const ev2 = createEconomicEvent({
      economicEventId: "eco_market_settlement_2",
      worldId: "world-economy",
      epoch: 26,
      eventType: "MARKET_SETTLEMENT",
      currencyId: "gold",
      fromOwner: "player:buyer",
      toOwner: "player:seller",
      quantity: "50",
      sourceReceiptHash: receipt,
      worldRootHash: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
    });

    const report = service.auditEvents([ev1, ev2], "world-economy", 20, 30);

    expect(report.allInvariantsPassed).toBe(false);
    expect(report.doubleSettlementViolations.length).toBe(1);
    expect(report.doubleSettlementViolations[0]).toContain("DOUBLE_MARKET_SETTLEMENT");
  });

  it("detects duplicate unique asset creation", async () => {
    const ev1 = createEconomicEvent({
      economicEventId: "eco_loot_1",
      worldId: "world-economy",
      epoch: 40,
      eventType: "LOOT_CREATE",
      assetId: "item:unique-blade-77",
      toOwner: "player:hero",
      quantity: "1",
      sourceReceiptHash: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
      worldRootHash: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
    });

    // Duplicate creation of unique asset in event stream
    const ev2 = createEconomicEvent({
      economicEventId: "eco_loot_2",
      worldId: "world-economy",
      epoch: 45,
      eventType: "LOOT_CREATE",
      assetId: "item:unique-blade-77",
      toOwner: "player:villain",
      quantity: "1",
      sourceReceiptHash: "sha256:8888888888888888888888888888888888888888888888888888888888888888",
      worldRootHash: "sha256:9999999999999999999999999999999999999999999999999999999999999999",
    });

    const report = service.auditEvents([ev1, ev2], "world-economy", 35, 50);

    expect(report.allInvariantsPassed).toBe(false);
    expect(report.duplicateOwnershipViolations.length).toBe(1);
    expect(report.duplicateOwnershipViolations[0]).toContain("DUPLICATE_ASSET_CREATION:item:unique-blade-77");
  });
});
