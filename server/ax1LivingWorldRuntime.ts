import { readConfirmedNpcState, resolveAndRecordNpc, resolveAndRecordPolity, resolveAndRecordWorld } from "./wasdAurionRuntime";
import { resolveLivingWorldTick, socialMasteryEvidence, type HubId, type LivingWorldSocialAction, type MarketState, type NpcEconomyState } from "./ax1LivingWorldProtocol";
import type { NpcLifeOpportunity } from "./npcLifeProtocol";
import type { NpcNeedEvent, WorldSignal } from "./wasdAurionProtocol";

const baseMarkets: Readonly<Record<HubId, MarketState>> = Object.freeze({
  observatory_threshold: Object.freeze({ hubId: "observatory_threshold", controllingGuild: "Order of Aurion", taxRateBasisPoints: 400, treasuryCopper: 500_000, stock: Object.freeze({ grain: 150, sandstone: 100, bronze: 80, aether: 40, salve: 60, rune_core: 25 }) }),
  windhollow: Object.freeze({ hubId: "windhollow", controllingGuild: "Aethelgard Pioneers", taxRateBasisPoints: 250, treasuryCopper: 280_000, stock: Object.freeze({ grain: 600, sandstone: 120, bronze: 30, aether: 15, salve: 40, rune_core: 5 }) }),
  emberfall: Object.freeze({ hubId: "emberfall", controllingGuild: "Bronze Syndicate", taxRateBasisPoints: 550, treasuryCopper: 420_000, stock: Object.freeze({ grain: 80, sandstone: 450, bronze: 350, aether: 20, salve: 25, rune_core: 10 }) }),
  cinder_vault: Object.freeze({ hubId: "cinder_vault", controllingGuild: "Starforged Sentinels", taxRateBasisPoints: 600, treasuryCopper: 610_000, stock: Object.freeze({ grain: 40, sandstone: 90, bronze: 60, aether: 180, salve: 30, rune_core: 80 }) }),
});

function npcIdentity(regionId: HubId) { return `ax1_merchant_${regionId}`; }
function npcName(regionId: HubId) { return regionId === "emberfall" ? "Torin" : regionId === "windhollow" ? "Elowen" : regionId === "cinder_vault" ? "Kael" : "Valen"; }
function isHubId(value: string): value is HubId { return value === "observatory_threshold" || value === "windhollow" || value === "emberfall" || value === "cinder_vault"; }

function defaultNpc(regionId: HubId): NpcEconomyState {
  return Object.freeze({ npcId: npcIdentity(regionId), name: npcName(regionId), currentHubId: regionId, wealthCopper: 1_500, hungerBps: 2_000, fatigueBps: 1_500, tradeProwessBps: 10_500, harvestYieldBps: 10_000, memory: Object.freeze([]) });
}

function confirmedNpcEconomy(homeRegionId: HubId, snapshot: Awaited<ReturnType<typeof readConfirmedNpcState>>): NpcEconomyState {
  if (!snapshot || !("lifeState" in snapshot) || !snapshot.lifeState.economy) return defaultNpc(homeRegionId);
  const economy = snapshot.lifeState.economy;
  if (!isHubId(economy.currentHubId)) throw new Error("NPC_LIFE_HUB_INVALID");
  return Object.freeze({ npcId: snapshot.npcId, name: npcName(homeRegionId), currentHubId: economy.currentHubId, wealthCopper: economy.wealthCopper, hungerBps: economy.hungerBps, fatigueBps: economy.fatigueBps, tradeProwessBps: economy.tradeProwessBps, harvestYieldBps: economy.harvestYieldBps, memory: Object.freeze([...snapshot.memory]) });
}

function lifeOpportunities(resolution: ReturnType<typeof resolveLivingWorldTick>, receiptId: string): readonly NpcLifeOpportunity[] {
  const riskBps = resolution.caravan.ambushed ? 9_000 : Math.max(0, (100 - resolution.caravan.securityIndex) * 100);
  const stock = resolution.market.stock[resolution.commodity];
  const values: NpcLifeOpportunity[] = [
    { id: `${receiptId}:safe`, kind: "safe_hub", regionId: resolution.market.hubId, targetId: `hub:${resolution.market.hubId}`, benefitBps: Math.max(2_000, 9_000 - riskBps), riskBps, distanceBps: 0, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:resource`, kind: "resource", regionId: resolution.market.hubId, targetId: `commodity:${resolution.commodity}`, benefitBps: Math.max(2_000, Math.min(10_000, 10_000 - Math.min(8_000, stock * 10))), riskBps: Math.floor(riskBps / 3), distanceBps: 500, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:social`, kind: "social", regionId: resolution.market.hubId, benefitBps: 6_000, riskBps: Math.floor(riskBps / 4), distanceBps: 250, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:reputation`, kind: "reputation", regionId: resolution.market.hubId, targetId: `polity:${resolution.market.hubId}`, benefitBps: 5_500 + Math.max(0,resolution.stabilityDelta) * 500, riskBps: Math.floor(riskBps / 2), distanceBps: 500, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:market`, kind: "market", regionId: resolution.market.hubId, targetId: `market:${resolution.market.hubId}`, benefitBps: Math.min(10_000,2_500 + resolution.unitPriceCopper * 12), riskBps: Math.floor(riskBps / 3), distanceBps: 300, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
    { id: `${receiptId}:influence`, kind: "influence", regionId: resolution.caravan.destination ?? resolution.market.hubId, targetId: `polity:${resolution.caravan.destination ?? resolution.market.hubId}`, benefitBps: resolution.caravan.destination ? 8_000 : 4_500, riskBps, distanceBps: resolution.caravan.destination ? 2_500 : 800, sourceReceiptId: receiptId, resolutionIndex: resolution.resolutionIndex },
  ];
  return Object.freeze(values.map(value => Object.freeze(value)));
}

export type LivingWorldRuntimeResult = Readonly<{
  resolution: ReturnType<typeof resolveLivingWorldTick>;
  npc: Awaited<ReturnType<typeof resolveAndRecordNpc>>;
  polity: Awaited<ReturnType<typeof resolveAndRecordPolity>>;
  world: Awaited<ReturnType<typeof resolveAndRecordWorld>>;
  socialEvidence?: ReturnType<typeof socialMasteryEvidence>;
}>;

/**
 * Server-internal migration entrypoint. The logical resolution index and world seed
 * must come from Aurion's confirmed world state; clients never submit prices,
 * inventories, caravan outcomes, polity deltas or NPC decisions.
 */
export async function resolveAndRecordAx1LivingWorld(input: Readonly<{
  worldSeed: string;
  resolutionIndex: number;
  regionId: HubId;
  social?: Readonly<{ action: LivingWorldSocialAction; sourceReceiptId: string }>;
}>): Promise<LivingWorldRuntimeResult> {
  const npcId = npcIdentity(input.regionId);
  const prior = await readConfirmedNpcState(npcId);
  const npc = confirmedNpcEconomy(input.regionId,prior);
  const market = baseMarkets[npc.currentHubId];
  const preferredGoal = prior?.decision.goal;
  const resolution = resolveLivingWorldTick({ worldSeed: input.worldSeed, resolutionIndex: input.resolutionIndex, market, npc, polityStability: 72, ...(preferredGoal ? { preferredGoal } : {}) });
  const receiptId = `ax1living:${resolution.deterministicHash.slice(0, 40)}`;
  // Needs are satisfaction values: beneficial outcomes increase them; harm decreases them.
  const needEvents: NpcNeedEvent[] = [
    { id: `${receiptId}:wealth`, need: "wealth", delta: resolution.action === "trade" || resolution.action === "caravan" ? 0.08 : resolution.action === "consume" ? -0.04 : 0, sourceReceiptId: receiptId, resolutionIndex: input.resolutionIndex },
    { id: `${receiptId}:safety`, need: "safety", delta: resolution.caravan.ambushed ? -0.18 : resolution.action === "patrol" ? 0.05 : 0, sourceReceiptId: receiptId, resolutionIndex: input.resolutionIndex },
    { id: `${receiptId}:resources`, need: "resources", delta: resolution.action === "produce" ? 0.07 : resolution.action === "consume" ? -0.04 : 0, sourceReceiptId: receiptId, resolutionIndex: input.resolutionIndex },
    { id: `${receiptId}:belonging`, need: "belonging", delta: resolution.action === "socialize" ? 0.08 : 0, sourceReceiptId: receiptId, resolutionIndex: input.resolutionIndex },
    { id: `${receiptId}:status`, need: "status", delta: resolution.action === "patrol" ? 0.03 : resolution.action === "caravan" && !resolution.caravan.ambushed ? 0.02 : 0, sourceReceiptId: receiptId, resolutionIndex: input.resolutionIndex },
    { id: `${receiptId}:power`, need: "power", delta: resolution.action === "caravan" && !resolution.caravan.ambushed ? 0.02 : 0, sourceReceiptId: receiptId, resolutionIndex: input.resolutionIndex },
  ];
  const newestMemory = resolution.nextMemory.length ? [resolution.nextMemory[resolution.nextMemory.length - 1]!] : [];
  const npcRead = await resolveAndRecordNpc({
    npcId: resolution.npc.npcId,
    regionId: resolution.npc.currentHubId,
    resolutionIndex: input.resolutionIndex,
    roleId: "merchant",
    needEvents,
    observationIds: Object.freeze([receiptId, `market:${resolution.market.hubId}:${resolution.commodity}:${resolution.unitPriceCopper}`]),
    memory: Object.freeze(newestMemory),
    opportunities: lifeOpportunities(resolution,receiptId),
    economy: { currentHubId: resolution.npc.currentHubId, wealthCopper: resolution.npc.wealthCopper, hungerBps: resolution.npc.hungerBps, fatigueBps: resolution.npc.fatigueBps, tradeProwessBps: resolution.npc.tradeProwessBps, harvestYieldBps: resolution.npc.harvestYieldBps },
  });
  const economySignal: WorldSignal = {
    id: `${receiptId}:economy`, kind: "economy", regionId: resolution.market.hubId,
    magnitude: Math.max(-1, Math.min(1, (resolution.taxCopper - (resolution.caravan.ambushed ? 100 : 0)) / 500)),
    sourceReceiptId: receiptId, resolutionIndex: input.resolutionIndex,
  };
  const politicsSignal: WorldSignal = {
    id: `${receiptId}:politics`, kind: resolution.caravan.ambushed ? "war" : "politics", regionId: resolution.market.hubId,
    magnitude: Math.max(-1, Math.min(1, resolution.stabilityDelta / 10)),
    sourceReceiptId: receiptId, resolutionIndex: input.resolutionIndex,
  };
  const world = await resolveAndRecordWorld({ worldSeed: input.worldSeed, regionId: resolution.market.hubId, resolutionIndex: input.resolutionIndex, signals: [economySignal, politicsSignal] });
  const polity = await resolveAndRecordPolity({
    polityId: `polity:${resolution.market.hubId}`,
    governmentType: resolution.market.hubId === "emberfall" ? "trade_republic" : resolution.market.hubId === "cinder_vault" ? "warband" : "council",
    territoryIds: [resolution.market.hubId],
    stability: Math.max(0, Math.min(100, 72 + resolution.stabilityDelta)),
    activeDiplomacy: resolution.action === "caravan" ? ["trade"] : ["non_aggression"],
    warSignals: resolution.caravan.ambushed ? [politicsSignal] : [],
  });
  const socialEvidence = input.social ? socialMasteryEvidence(input.social.action, input.social.sourceReceiptId, input.resolutionIndex) : undefined;
  return Object.freeze({ resolution, npc: npcRead, polity, world, ...(socialEvidence ? { socialEvidence } : {}) });
}
