// Native Aurion merchant rules.
// Migrated from WASD/AX1 provenance; active implementation is Aurion-owned.

import {
  resolveLivingWorldTick,
  socialMasteryEvidence,
  type HubId,
  type MarketState,
  type NpcEconomyState,
  type LivingWorldSocialAction,
  type LivingWorldResolution,
} from "./ax1LivingWorldProtocol.js";
import type { NpcRequest, NpcSnapshot } from "./npcPersistenceProtocol.js";
import type { PolityGovernmentType, WorldSignal, DiplomacyType } from "./worldPolityRules.js";

export type MerchantDecisionRequests = Readonly<{
  resolution: ReturnType<typeof resolveLivingWorldTick>;
  npcRequest: NpcRequest;
  worldRequest: Readonly<{
    worldSeed: string;
    regionId: HubId;
    resolutionIndex: number;
    signals: readonly WorldSignal[];
  }>;
  polityRequest: Readonly<{
    polityId: string;
    governmentType: PolityGovernmentType;
    territoryIds: readonly string[];
    stability: number;
    activeDiplomacy: readonly DiplomacyType[];
    warSignals: readonly WorldSignal[];
  }>;
  socialEvidence?: ReturnType<typeof socialMasteryEvidence>;
  receiptId: string;
}>;

export const merchantBootstrapMarkets: Readonly<Record<HubId, MarketState>> = Object.freeze({
  observatory_threshold: Object.freeze({
    hubId: "observatory_threshold",
    controllingGuild: "Order of Aurion",
    taxRateBasisPoints: 400,
    treasuryCopper: 5e5,
    stock: Object.freeze({ grain: 150, sandstone: 100, bronze: 80, aether: 40, salve: 60, rune_core: 25 }),
  }) as MarketState,
  windhollow: Object.freeze({
    hubId: "windhollow",
    controllingGuild: "Aethelgard Pioneers",
    taxRateBasisPoints: 250,
    treasuryCopper: 28e4,
    stock: Object.freeze({ grain: 600, sandstone: 120, bronze: 30, aether: 15, salve: 40, rune_core: 5 }),
  }) as MarketState,
  emberfall: Object.freeze({
    hubId: "emberfall",
    controllingGuild: "Bronze Syndicate",
    taxRateBasisPoints: 550,
    treasuryCopper: 42e4,
    stock: Object.freeze({ grain: 80, sandstone: 450, bronze: 350, aether: 20, salve: 25, rune_core: 10 }),
  }) as MarketState,
  cinder_vault: Object.freeze({
    hubId: "cinder_vault",
    controllingGuild: "Starforged Sentinels",
    taxRateBasisPoints: 600,
    treasuryCopper: 61e4,
    stock: Object.freeze({ grain: 40, sandstone: 90, bronze: 60, aether: 180, salve: 30, rune_core: 80 }),
  }) as MarketState,
});

export function npcIdentity(regionId: HubId): string {
  return `ax1_merchant_${regionId}`;
}

function npcName(regionId: HubId): string {
  return regionId === "emberfall" ? "Torin" : regionId === "windhollow" ? "Elowen" : regionId === "cinder_vault" ? "Kael" : "Valen";
}

function isHubId(value: string): value is HubId {
  return value === "observatory_threshold" || value === "windhollow" || value === "emberfall" || value === "cinder_vault";
}

function defaultNpc(regionId: HubId): NpcEconomyState {
  return Object.freeze({
    npcId: npcIdentity(regionId),
    name: npcName(regionId),
    currentHubId: regionId,
    wealthCopper: 1500,
    hungerBps: 2e3,
    fatigueBps: 1500,
    tradeProwessBps: 10500,
    harvestYieldBps: 1e4,
    memory: Object.freeze([]),
  }) as NpcEconomyState;
}

export function confirmedNpcEconomy(homeRegionId: HubId, snapshot: NpcSnapshot | null): NpcEconomyState {
  if (!snapshot || !("lifeState" in snapshot) || !snapshot.lifeState.economy) return defaultNpc(homeRegionId);
  const economy = snapshot.lifeState.economy;
  if (!isHubId(economy.currentHubId)) throw new Error("NPC_LIFE_HUB_INVALID");
  return Object.freeze({
    npcId: snapshot.npcId,
    name: npcName(homeRegionId),
    currentHubId: economy.currentHubId,
    wealthCopper: economy.wealthCopper,
    hungerBps: economy.hungerBps,
    fatigueBps: economy.fatigueBps,
    tradeProwessBps: economy.tradeProwessBps,
    harvestYieldBps: economy.harvestYieldBps,
    memory: Object.freeze([...snapshot.memory]),
  }) as NpcEconomyState;
}
