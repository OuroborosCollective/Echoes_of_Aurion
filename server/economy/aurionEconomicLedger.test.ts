import { describe, it, expect, beforeEach } from "vitest";
import {
  createEconomicEvent,
  verifyEconomicEventIntegrity,
  type EconomicEvent,
} from "../../shared/aurionEconomicEventContract";
import { AurionEconomicLedger } from "./aurionEconomicLedger";
import { OwnershipLedger } from "./ownershipLedger";
import { EconomicInvariantService } from "./economicInvariantService";

describe("Aurion Economic Ledger & Double-Entry Invariants (Steps 35-37)", () => {
  let ledger: AurionEconomicLedger;
  let ownershipLedger: OwnershipLedger;
  let invariantService: EconomicInvariantService;

  const WORLD_ID = "echoes-of-aurion-global";
  const ROOT_HASH = "sha256:world_root_eco_test_12345678";

  beforeEach(() => {
    ledger = new AurionEconomicLedger();
    ownershipLedger = new OwnershipLedger(ledger);
    invariantService = new EconomicInvariantService(ledger);
  });

  it("Step 35: Ingests economic events and enforces exact balance tracking without floats", async () => {
    // Quest reward: Mint 100 gold (in minor units: 10000)
    const rewardEvent = createEconomicEvent({
      economicEventId: "eco_rew_1",
      worldId: WORLD_ID,
      epoch: 100,
      eventType: "REWARD",
      currencyId: "gold",
      toOwner: "player_lyra",
      quantity: "10000",
      sourceReceiptHash: "sha256:receipt_quest_reward_100",
      worldRootHash: ROOT_HASH,
    });

    const res1 = await ledger.recordEvent(rewardEvent);
    expect(res1.accepted).toBe(true);
    expect(ledger.getCurrencyBalance(WORLD_ID, "gold", "player_lyra")).toBe("10000");
    expect(ledger.getTotalCurrencySupply(WORLD_ID, "gold")).toBe("10000");

    // Market purchase: Transfer 4000 from Lyra to Merchant
    const transferEvent = createEconomicEvent({
      economicEventId: "eco_trade_1",
      worldId: WORLD_ID,
      epoch: 110,
      eventType: "TRADE",
      currencyId: "gold",
      fromOwner: "player_lyra",
      toOwner: "merchant_boris",
      quantity: "4000",
      sourceReceiptHash: "sha256:receipt_trade_110",
      worldRootHash: ROOT_HASH,
    });

    const res2 = await ledger.recordEvent(transferEvent);
    expect(res2.accepted).toBe(true);
    expect(ledger.getCurrencyBalance(WORLD_ID, "gold", "player_lyra")).toBe("6000");
    expect(ledger.getCurrencyBalance(WORLD_ID, "gold", "merchant_boris")).toBe("4000");
    // Supply unchanged by transfer
    expect(ledger.getTotalCurrencySupply(WORLD_ID, "gold")).toBe("10000");

    // Repair fee: Burn 1500 from Lyra
    const burnEvent = createEconomicEvent({
      economicEventId: "eco_burn_1",
      worldId: WORLD_ID,
      epoch: 120,
      eventType: "BURN",
      currencyId: "gold",
      fromOwner: "player_lyra",
      quantity: "1500",
      sourceReceiptHash: "sha256:receipt_repair_120",
      worldRootHash: ROOT_HASH,
    });

    const res3 = await ledger.recordEvent(burnEvent);
    expect(res3.accepted).toBe(true);
    expect(ledger.getCurrencyBalance(WORLD_ID, "gold", "player_lyra")).toBe("4500");
    expect(ledger.getTotalCurrencySupply(WORLD_ID, "gold")).toBe("8500");
  });

  it("Step 36: Unique Item Lineage & Anti-Duplication", async () => {
    // Drop legendary sword from boss loot
    const lootEvent = createEconomicEvent({
      economicEventId: "eco_loot_1",
      worldId: WORLD_ID,
      epoch: 200,
      eventType: "LOOT_CREATE",
      assetId: "item:flame_blade_99",
      toOwner: "player_arthur",
      quantity: "1",
      sourceReceiptHash: "sha256:receipt_boss_kill_200",
      worldRootHash: ROOT_HASH,
    });

    const r1 = await ledger.recordEvent(lootEvent);
    expect(r1.accepted).toBe(true);
    expect(ledger.getAssetOwner(WORLD_ID, "item:flame_blade_99")).toBe("player_arthur");

    // Trade sword to player_lancelot
    const tradeEvent = createEconomicEvent({
      economicEventId: "eco_trade_sword",
      worldId: WORLD_ID,
      epoch: 210,
      eventType: "TRADE",
      assetId: "item:flame_blade_99",
      fromOwner: "player_arthur",
      toOwner: "player_lancelot",
      quantity: "1",
      sourceReceiptHash: "sha256:receipt_trade_sword_210",
      worldRootHash: ROOT_HASH,
    });

    const r2 = await ledger.recordEvent(tradeEvent);
    expect(r2.accepted).toBe(true);
    expect(ledger.getAssetOwner(WORLD_ID, "item:flame_blade_99")).toBe("player_lancelot");

    // Verify Lineage Reconstruction
    const lineage = await ownershipLedger.getAssetLineage("item:flame_blade_99");
    expect(lineage).not.toBeNull();
    expect(lineage?.currentOwner).toBe("player_lancelot");
    expect(lineage?.status).toBe("ACTIVE");
    expect(lineage?.history.length).toBe(2);

    // Negative Test: Illegal duplicate creation of same item ID
    const duplicateLoot = createEconomicEvent({
      economicEventId: "eco_loot_dupe",
      worldId: WORLD_ID,
      epoch: 220,
      eventType: "LOOT_CREATE",
      assetId: "item:flame_blade_99",
      toOwner: "player_hacker",
      quantity: "1",
      sourceReceiptHash: "sha256:receipt_fake_loot_220",
      worldRootHash: ROOT_HASH,
    });

    const rDupe = await ledger.recordEvent(duplicateLoot);
    expect(rDupe.accepted).toBe(false);
    expect(rDupe.reason).toBe("ASSET_ALREADY_EXISTS");
  });

  it("Step 37: Full Economic Invariant Audit passes on closed supply equation", async () => {
    // Run sequence of mints, transfers, burns
    await ledger.recordEvent(
      createEconomicEvent({
        economicEventId: "eco_m1",
        worldId: WORLD_ID,
        epoch: 10,
        eventType: "MINT",
        currencyId: "silver",
        toOwner: "player_a",
        quantity: "5000",
        sourceReceiptHash: "sha256:r_m1",
        worldRootHash: ROOT_HASH,
      })
    );

    await ledger.recordEvent(
      createEconomicEvent({
        economicEventId: "eco_t1",
        worldId: WORLD_ID,
        epoch: 20,
        eventType: "TRANSFER",
        currencyId: "silver",
        fromOwner: "player_a",
        toOwner: "player_b",
        quantity: "2000",
        sourceReceiptHash: "sha256:r_t1",
        worldRootHash: ROOT_HASH,
      })
    );

    await ledger.recordEvent(
      createEconomicEvent({
        economicEventId: "eco_b1",
        worldId: WORLD_ID,
        epoch: 30,
        eventType: "BURN",
        currencyId: "silver",
        fromOwner: "player_b",
        quantity: "500",
        sourceReceiptHash: "sha256:r_b1",
        worldRootHash: ROOT_HASH,
      })
    );

    const audit = await invariantService.auditEconomy({
      worldId: WORLD_ID,
      fromEpoch: 0,
      toEpoch: 100,
    });

    expect(audit.allInvariantsPassed).toBe(true);
    expect(audit.currencySupplyDeltas["silver"].minted).toBe("5000");
    expect(audit.currencySupplyDeltas["silver"].burned).toBe("500");
    expect(audit.currencySupplyDeltas["silver"].netDelta).toBe("4500");
    expect(audit.currencySupplyDeltas["silver"].totalTransfersVolume).toBe("2000");
  });
});
