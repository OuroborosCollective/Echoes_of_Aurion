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
import type { NpcLifeOpportunityKind } from "./npcLifeProtocol.js";

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

export const MERCHANT_GENESIS_VERSION = "aurion-merchant-genesis.v1" as const;

/**
 * Deterministic first decision request for a hub merchant that has never decided.
 *
 * Derived only from canonical Aurion code: the default merchant economy of the hub
 * (defaultNpc) and the hub's bootstrap market. It mirrors the successor request a
 * confirmed action produces, with explicitly neutral genesis values: no risk, no
 * stability change, no market price yet, and the hub's scarcest commodity as the
 * resource target. The same hub always yields the same request, so the genesis
 * receipt id is stable and a repeated or concurrent genesis cannot fork history.
 */
export function merchantGenesisRequest(hubId: HubId) {
  if (!isHubId(hubId)) throw new Error("NPC_GENESIS_HUB_INVALID");
  const npc = defaultNpc(hubId);
  const market = merchantBootstrapMarkets[hubId];
  const [scarcest, stock] = Object.entries(market.stock)
    .sort(([a, x], [b, y]) => x - y || (a < b ? -1 : a > b ? 1 : 0))[0] as [string, number];
  const evidence = `${MERCHANT_GENESIS_VERSION}:${hubId}`;
  const opportunity = (suffix: string, value: Readonly<{ kind: NpcLifeOpportunityKind; targetId?: string; benefitBps: number; distanceBps: number }>) =>
    ({ id: `${evidence}:${suffix}`, regionId: hubId, riskBps: 0, sourceReceiptId: evidence, resolutionIndex: 0, ...value });
  return Object.freeze({
    npcId: npc.npcId,
    regionId: hubId,
    resolutionIndex: 0,
    roleId: "merchant" as const,
    needEvents: [],
    observationIds: [evidence, `market:${hubId}:bootstrap`],
    memory: [],
    economy: {
      currentHubId: hubId, wealthCopper: npc.wealthCopper, hungerBps: npc.hungerBps, fatigueBps: npc.fatigueBps,
      tradeProwessBps: npc.tradeProwessBps, harvestYieldBps: npc.harvestYieldBps,
    },
    opportunities: [
      opportunity("safe", { kind: "safe_hub", targetId: `hub:${hubId}`, benefitBps: 9e3, distanceBps: 0 }),
      opportunity("resource", { kind: "resource", targetId: `commodity:${scarcest}`, benefitBps: Math.max(2e3, Math.min(1e4, 1e4 - Math.min(8e3, stock * 10))), distanceBps: 500 }),
      opportunity("social", { kind: "social", benefitBps: 6e3, distanceBps: 250 }),
      opportunity("reputation", { kind: "reputation", targetId: `polity:${hubId}`, benefitBps: 5500, distanceBps: 500 }),
      opportunity("market", { kind: "market", targetId: `market:${hubId}`, benefitBps: 2500, distanceBps: 300 }),
      opportunity("influence", { kind: "influence", targetId: `polity:${hubId}`, benefitBps: 5e3, distanceBps: 750 }),
    ],
  });
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
