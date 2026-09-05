import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import content from "../../shared/aurionAx1ContentCatalog.json";
import { validateAurionAx1ContentCatalog } from "../../server/aurionAx1ContentCatalog";
import { xpRequiredForNextSkillLevelExact } from "../../server/wasdAurionSkillProgressionProtocol";
import { activityXpAwardExact, balancingScopes, cumulativeXpToLevelExact, economyBalance, pityChanceBps, pityRules, targetValidatedActionsExact } from "../../server/aurionBalancingProtocol";
import { resolveBonusYieldCarry, resolveProfessionMasteryModifiers } from "../../server/professionMasteryProtocol";
import { buildGlobalWorldPlan } from "../../server/globalWorldProtocol";
import { resolveRegionProgression } from "../../server/aurionRegionProgressionProtocol";
import { resolveDungeonProgression, dungeonVariants } from "../../server/aurionDungeonProgressionProtocol";
import { guildBuildingDefinitions, resolveGuildBuildingUpgrade } from "../../server/guildBankProtocol";
import { chunkPerformanceTiers, resolveChunkSimulationBudget } from "../../server/aurionChunkPerformanceProtocol";
import { encounterBudget, maximumVisibleEnemies } from "../../server/openWorldProtocol";
import { generateBaseWorldChunk, isBaseChunkRoadTile, splitWorldChunkPositionMm } from "../../shared/worldChunkProtocol";
import { worldChunkStreamingBudget } from "../../shared/worldChunkStreamingProtocol";

// This executable samples real protocols. It never supplies a runtime reward,
// writes a gameplay receipt or labels the source catalog as playable content.
const ceil = (n: bigint, d: bigint) => (n + d - 1n) / d;
const levels = ["1", "10", "49", "50", "100", "1000", "1049", "1050", "10000", "1000000000000000000000000"];
const floors = ["1", "2", "4", "9", "10", "99", "100", "999", "1000", "10000", "1000000", "1000000000000000000000000"];
const sourcePaths = [
  "server/wasdAurionSkillProgressionProtocol.ts", "server/scopedMasteryProtocol.ts", "server/professionMasteryProtocol.ts",
  "server/aurionBalancingProtocol.ts", "server/aurionDungeonProgressionProtocol.ts", "server/aurionRegionProgressionProtocol.ts",
  "server/aurionRegionCatalog.ts", "server/aurionChunkPerformanceProtocol.ts", "server/guildBankProtocol.ts",
  "server/globalWorldProtocol.ts", "server/openWorldProtocol.ts", "server/wasdAurionWorldIntegrityProtocol.ts",
  "server/aurionAx1ContentCatalog.ts", "shared/aurionAx1ContentCatalog.json", "shared/aurionRegionProgressionCatalog.json", "shared/worldChunkProtocol.ts",
  "shared/worldChunkStreamingProtocol.ts", "scripts/balancing/aim265-v2.ts", "scripts/balancing/replay-aim265.mjs",
  "scripts/balancing/verify-aim265.py", "scripts/balancing/aim265-wolfram.wl",
];

export function buildBalancingV2Report() {
  const catalog = validateAurionAx1ContentCatalog(content);
  const progression = levels.map(levelExact => ({
    levelExact,
    xpNextExact: xpRequiredForNextSkillLevelExact(levelExact),
    cumulativeXpExact: BigInt(levelExact) <= 10_000n ? cumulativeXpToLevelExact(levelExact) : null,
    cumulativeMode: BigInt(levelExact) <= 10_000n ? "exact_finite_sum" : "not_enumerated",
    targetActions: Object.fromEntries(balancingScopes.map(scope => [scope, targetValidatedActionsExact(levelExact, scope)])),
    yield: resolveBonusYieldCarry(levelExact),
    modifiers: resolveProfessionMasteryModifiers({ masteryLevelExact: levelExact, qualityScoreExact: levelExact }),
  }));
  const professions = catalog.professions.map(profession => ({
    id: profession.id, category: profession.category,
    activities: catalog.activities.filter(activity => activity.professionId === profession.id).map(activity => activity.id),
    recipes: catalog.recipes.filter(recipe => recipe.professionId === profession.id).map(recipe => recipe.id),
    xpCurve: "floor_root_5(50^5 * level^7)", cap: null,
    runtimeCoverage: profession.id === "blacksmith" ? "temper_aurion_spear_only" : "catalog_not_runtime_evidence",
  }));
  const activities = catalog.activities.map(activity => ({
    id: activity.id, professionId: activity.professionId, sourceDurationMs: activity.sourceHint[0],
    sourceXpExact: activity.sourceHint[1], sourceYieldRangeExact: activity.sourceHint.slice(2),
    sourceMaximumActionsPerHourExact: (3_600_000n / BigInt(activity.sourceHint[0])).toString(),
    assumption: "continuous_available_source_no_travel_no_contention_no_misses",
    candidateXp: levels.slice(0, -1).map(levelExact => ({ levelExact, xpExact: activityXpAwardExact({ levelExact, scope: activity.kind === "civic" ? "politics" : "profession", activity: activity.kind === "gather" ? "gathering" : "crafting", repetitionStreak: 0 }) })),
  }));
  const recipes = catalog.recipes.map(recipe => {
    let minimumInputMs = 0n, maximumInputMs = 0n;
    for (const [item, quantity] of recipe.ingredients) {
      const activity = catalog.activities.find(candidate => candidate.output[0] === item)!;
      minimumInputMs += ceil(BigInt(quantity), BigInt(activity.sourceHint[3])) * BigInt(activity.sourceHint[0]);
      maximumInputMs += ceil(BigInt(quantity), BigInt(activity.sourceHint[2])) * BigInt(activity.sourceHint[0]);
    }
    return {
      id: recipe.id, professionId: recipe.professionId, ingredients: recipe.ingredients, baseOutputExact: recipe.output[1],
      sourceXpExact: recipe.sourceHint[0], sourceCraftDurationMs: recipe.sourceHint[1],
      singleBatchInputAcquisitionMs: { minimumExact: minimumInputMs.toString(), maximumExact: maximumInputMs.toString(), assumption: "serial_base_yield_actions_with_available_sources_and_no_travel" },
      yields: levels.map(levelExact => {
        const carry = resolveBonusYieldCarry(levelExact);
        return { levelExact, expectedOutputNumeratorExact: (BigInt(recipe.output[1]) * (1000n + BigInt(carry.expectedBonusMilliExact))).toString(), expectedOutputDenominatorExact: "1000" };
      }),
      economicBoundary: "unbounded_copies_require_source_budget_and_sale_or_salvage_sink_before_activation",
    };
  });
  const global = buildGlobalWorldPlan({ worldSeed: "echoes-of-aurion-v1", epoch: 12, activePlayerCount: 5, highWaterPlayerCount: 16 });
  const mastery = { combatLevelExact: "100", gatheringLevelExact: "100", professionLevelExact: "100", socialLevelExact: "100", politicsLevelExact: "100" };
  const dungeonScenarios = dungeonVariants.flatMap(variant => [1, 2, 5, 8].flatMap(partySize => {
    const region = resolveRegionProgression({ worldSeed: global.worldSeed, epoch: global.epoch, resolutionIndex: 3, sector: global.sectors[3]!, mastery, partySize });
    return floors.map(floorExact => {
      const result = resolveDungeonProgression({ worldSeed: global.worldSeed, epoch: global.epoch, region, variant, floorExact, partySize, combatMasteryLevelExact: "1000", sourceReceiptDigest: "a".repeat(64) });
      return { variant, partySize, floorExact, combatBudgetBps: result.combatBudgetBps, rewardMultiplierBps: result.rewardMultiplierBps, completionXpExact: result.completionXpExact, hpExact: result.enemyBudget.hpExact, challengeScoreExact: result.challengeScoreExact, affixKeys: result.affixes.map(affix => affix.key), deterministicHash: result.deterministicHash };
    });
  }));
  const dungeons = catalog.dungeons.map(dungeon => ({
    id: dungeon.id, entryLevelCandidateExact: dungeon.sourceHint[0], sourceXpExact: dungeon.sourceHint[2], sourceGoldExact: dungeon.sourceHint[3],
    roles: dungeon.partyCapabilities, requiredSessions: dungeon.partyCapabilities.reduce((a, b) => a + b, 0),
    entryLevelXpNextExact: xpRequiredForNextSkillLevelExact(dungeon.sourceHint[0]),
    boundaries: ["AIM-259_real_queue_and_completion_receipt_pending", "source_gold_is_not_granted", "role_ttk_requires_actual_loadout_dps_healing_and_mitigation"],
  }));
  const worldBosses = catalog.worldBosses.map(boss => ({
    id: boss.id, sourceLevelExact: boss.sourceCombatHint[0], sourceHpExact: boss.sourceCombatHint[1],
    respawnTicksExact: boss.respawnTicksExact, respawnMillisecondsExact: (100n * BigInt(boss.respawnTicksExact)).toString(),
    coordinatesMm: boss.coordinatesMm,
    chunk: splitWorldChunkPositionMm({ x: boss.coordinatesMm[0], z: boss.coordinatesMm[1] }),
    ttkScenarios: [1, 2, 5, 8, 20].flatMap(partySize => [50, 100, 250].map(dpsPerPlayer => ({
      partySize, dpsPerPlayer,
      ttkMillisecondsExact: ceil(1000n * BigInt(boss.sourceCombatHint[1]), BigInt(partySize * dpsPerPlayer)).toString(),
    }))),
    assumption: "fixed_damage_uptime_no_armor_no_healing_no_travel_no_player_deaths",
    runtimeCoverage: "AIM-260_boss_ledger_and_damage_contract_pending",
  }));
  const guildBuildings = Object.values(guildBuildingDefinitions).map(building => ({
    id: building.id, maximumLevelExact: building.maximumLevelExact, baseCostExact: building.baseCostExact,
    upgrades: Array.from({ length: Number(building.maximumLevelExact) }, (_, index) => resolveGuildBuildingUpgrade(building.id, String(index))),
    maximumBonusesBps: building.boundedMaxBonusesBps,
    runtimeCoverage: "treasury_and_upgrade_receipts_implemented_perk_consumers_require_lane_evidence",
  }));
  const homesteads = catalog.homesteadBlueprints.map(blueprint => ({ ...blueprint, runtimeCoverage: "AIM-261_tower_bridge_pending", perkFinal: false }));
  const populations = [1, 10, 100, 1000, 10000].map(players => {
    const world = buildGlobalWorldPlan({ worldSeed: global.worldSeed, epoch: 12, activePlayerCount: players, highWaterPlayerCount: players });
    return { players, sectorCount: world.sectors.length, totalPopulation: world.sectors.reduce((sum, sector) => sum + sector.settlement.population, 0), totalCapacity: world.sectors.reduce((sum, sector) => sum + sector.settlement.capacity, 0), overCapacitySectors: world.sectors.filter(sector => sector.settlement.population > sector.settlement.capacity).map(sector => sector.id), worldHash: world.deterministicHash };
  });
  const monsters = [1, 10, 50, 100, 1000, 10000].flatMap(level => [0, 1, 2, 3].map(zoneTier => ({ level, zoneTier, encounterBudget: encounterBudget(level, zoneTier), maximumVisible: maximumVisibleEnemies(level), activeCount: Math.min(maximumVisibleEnemies(level), Math.max(2, zoneTier + Math.floor(Math.max(1, level) / 12) + 1)) })));
  const chunks = [-1, 0, 1].flatMap(x => [-1, 0, 1].map(z => {
    const chunk = generateBaseWorldChunk({ worldId: "echoes-of-aurion-global", worldSeed: global.worldSeed, coordinate: { x, z } });
    return { coordinate: chunk.coordinate, hash: chunk.deterministicHash, resources: chunk.resources, roadCells: chunk.tiles.filter(isBaseChunkRoadTile).map(tile => [tile.x, tile.z]) };
  }));
  const chunkBudgets = chunkPerformanceTiers.map(tier => ({ tier, streaming: worldChunkStreamingBudget(tier), simulationCandidate: resolveChunkSimulationBudget({ tier, dangerBps: 60_000, partySize: 8 }), authoritativeTickMs: 100, simulationCandidateAppliedToServer: false }));
  const economy = [1, 10, 100, 1000].flatMap(players => [2, 8, 60].flatMap(actionsPerMinute => [0, 5000, 9200, 10000, 10800].map(sinkBps => {
    const faucet = BigInt(players * actionsPerMinute * 60 * 100);
    const sink = faucet * BigInt(sinkBps) / 10000n;
    return { players, actionsPerMinute, illustrativeCurrencyPerAction: 100, sinkBps, faucetExact: faucet.toString(), sinkExact: sink.toString(), ...economyBalance({ faucetExact: faucet.toString(), sinkExact: sink.toString() }) };
  })));
  const pity = Object.entries(pityRules).map(([tier, rule]) => ({ tier, hardPityAttempt: rule.hardPityAttempt, chancesBps: Array.from({ length: rule.hardPityAttempt }, (_, misses) => pityChanceBps(tier as keyof typeof pityRules, misses)), runtimeCoverage: "candidate_only_no_boss_pity_activation" }));
  return {
    rulesetVersion: "aurion-balancing-candidate.v2", final: false, authority: "analysis_only_no_gameplay_mutation",
    source: { normative: catalog.normativeRules, engine: catalog.source, targetBaseRevision: "c3596b4fdb358b14e58526d8f19893b08b01fb22", catalogSha256: catalog.catalogSha256, files: sourcePaths.map(path => ({ path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") })) },
    wolfram: { status: "unavailable_mcp_http_404", attemptDate: "2026-09-05", executionVerified: false, pendingReplay: "scripts/balancing/aim265-wolfram.wl" },
    assumptions: { economy: "illustrative_activity_and_sink_sensitivity_not_live_market_forecast", bonusYield: "exact_under_uniform_roll_0_through_9999; SHA32_modulo_bias_not_assumed_zero", spatial: "64m_centered_authoritative_chunks; AX1_80m_visual_chunks_are_a_distinct_projection; road_graph_is_topology_not_terrain_traversability" },
    progression, professions, activities, recipes, dungeons, dungeonScenarios, worldBosses, guildBuildings, homesteads, populations, monsters, chunks, chunkBudgets, economy, pity,
    pending: ["Wolfram_external_replay", "AIM-248_all_recipes_activities_and_material_sinks", "AIM-259_real_party_queue_loadout_roles_and_completion", "AIM-260_boss_population_damage_pity_buyback_and_autoloot", "AIM-261_housing_perk_consumers", "AIM-258_building_and_kingdom_perk_consumers", "AIM-254_live_rendering_and_navigation_collision_evidence"],
  };
}
