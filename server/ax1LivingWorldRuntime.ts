import { resolveAndRecordNpc, resolveAndRecordPolity, resolveAndRecordWorld } from "./wasdAurionRuntime";
import { resolveLivingWorldTick, socialMasteryEvidence, type HubId, type LivingWorldSocialAction, type MarketState, type NpcEconomyState } from "./ax1LivingWorldProtocol";
import type { NpcNeedEvent, WorldSignal } from "./wasdAurionProtocol";

const baseMarkets: Readonly<Record<HubId, MarketState>> = Object.freeze({
  observatory_threshold: Object.freeze({ hubId: "observatory_threshold", controllingGuild: "Order of Aurion", taxRateBasisPoints: 400, treasuryCopper: 500_000, stock: Object.freeze({ grain: 150, sandstone: 100, bronze: 80, aether: 40, salve: 60, rune_core: 25 }) }),
  windhollow: Object.freeze({ hubId: "windhollow", controllingGuild: "Aethelgard Pioneers", taxRateBasisPoints: 250, treasuryCopper: 280_000, stock: Object.freeze({ grain: 600, sandstone: 120, bronze: 30, aether: 15, salve: 40, rune_core: 5 }) }),
  emberfall: Object.freeze({ hubId: "emberfall", controllingGuild: "Bronze Syndicate", taxRateBasisPoints: 550, treasuryCopper: 420_000, stock: Object.freeze({ grain: 80, sandstone: 450, bronze: 350, aether: 20, salve: 25, rune_core: 10 }) }),
  cinder_vault: Object.freeze({ hubId: "cinder_vault", controllingGuild: "Starforged Sentinels", taxRateBasisPoints: 600, treasuryCopper: 610_000, stock: Object.freeze({ grain: 40, sandstone: 90, bronze: 60, aether: 180, salve: 30, rune_core: 80 }) }),
});

function defaultNpc(regionId: HubId, resolutionIndex: number): NpcEconomyState {
  return Object.freeze({
    npcId: `ax1_merchant_${regionId}`,
    name: regionId === "emberfall" ? "Torin" : regionId === "windhollow" ? "Elowen" : regionId === "cinder_vault" ? "Kael" : "Valen",
    currentHubId: regionId,
    wealthCopper: 1_500 + (resolutionIndex % 700),
    hungerBps: 2_000 + (resolutionIndex * 97) % 6_500,
    fatigueBps: 1_500 + (resolutionIndex * 61) % 7_500,
    tradeProwessBps: 10_500,
    harvestYieldBps: 10_000,
    memory: Object.freeze([]),
  });
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
  const market = baseMarkets[input.regionId];
  const npc = defaultNpc(input.regionId, input.resolutionIndex);
  const resolution = resolveLivingWorldTick({ worldSeed: input.worldSeed, resolutionIndex: input.resolutionIndex, market, npc, polityStability: 72 });
  const receiptId = `ax1living:${resolution.deterministicHash.slice(0, 40)}`;
  const needEvents: NpcNeedEvent[] = [
    { id: `${receiptId}:wealth`, need: "wealth", delta: resolution.action === "trade" || resolution.action === "caravan" ? 0.08 : -0.01, sourceReceiptId: receiptId, resolutionIndex: input.resolutionIndex },
    { id: `${receiptId}:safety`, need: "safety", delta: resolution.caravan.ambushed ? 0.18 : resolution.action === "patrol" ? -0.05 : 0, sourceReceiptId: receiptId, resolutionIndex: input.resolutionIndex },
    { id: `${receiptId}:resources`, need: "resources", delta: resolution.action === "produce" ? -0.07 : 0.02, sourceReceiptId: receiptId, resolutionIndex: input.resolutionIndex },
  ];
  const npcRead = await resolveAndRecordNpc({
    npcId: resolution.npc.npcId,
    regionId: input.regionId,
    resolutionIndex: input.resolutionIndex,
    needEvents,
    observationIds: Object.freeze([receiptId, `market:${input.regionId}:${resolution.commodity}:${resolution.unitPriceCopper}`]),
    memory: resolution.nextMemory,
  });
  const economySignal: WorldSignal = {
    id: `${receiptId}:economy`, kind: "economy", regionId: input.regionId,
    magnitude: Math.max(-1, Math.min(1, (resolution.taxCopper - (resolution.caravan.ambushed ? 100 : 0)) / 500)),
    sourceReceiptId: receiptId, resolutionIndex: input.resolutionIndex,
  };
  const politicsSignal: WorldSignal = {
    id: `${receiptId}:politics`, kind: resolution.caravan.ambushed ? "war" : "politics", regionId: input.regionId,
    magnitude: Math.max(-1, Math.min(1, resolution.stabilityDelta / 10)),
    sourceReceiptId: receiptId, resolutionIndex: input.resolutionIndex,
  };
  const world = await resolveAndRecordWorld({ worldSeed: input.worldSeed, regionId: input.regionId, resolutionIndex: input.resolutionIndex, signals: [economySignal, politicsSignal] });
  const polity = await resolveAndRecordPolity({
    polityId: `polity:${input.regionId}`,
    governmentType: input.regionId === "emberfall" ? "trade_republic" : input.regionId === "cinder_vault" ? "warband" : "council",
    territoryIds: [input.regionId],
    stability: Math.max(0, Math.min(100, 72 + resolution.stabilityDelta)),
    activeDiplomacy: resolution.action === "caravan" ? ["trade"] : ["non_aggression"],
    warSignals: resolution.caravan.ambushed ? [politicsSignal] : [],
  });
  const socialEvidence = input.social ? socialMasteryEvidence(input.social.action, input.social.sourceReceiptId, input.resolutionIndex) : undefined;
  return Object.freeze({ resolution, npc: npcRead, polity, world, ...(socialEvidence ? { socialEvidence } : {}) });
}
