import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { economyBounds } from "./aurionBalancingProtocol";
import type { GlobalWorldPlan, GlobalWorldSector } from "./globalWorldProtocol";
import {
  AURION_REGION_PROGRESSION_VERSION,
  regionArchetypeForSector,
  resolveRegionProgression,
  resolveRegionalWorldPlan,
  type RegionMasteryContext,
} from "./aurionRegionProgressionProtocol";
import { regionArchetypeKeys, dungeonAffixKeys } from "./aurionRegionCatalog";
import { AURION_DUNGEON_RULESET_VERSION, dungeonVariants, resolveDungeonProgression } from "./aurionDungeonProgressionProtocol";
import { chunkPerformanceTiers, resolveChunkSimulationBudget } from "./aurionChunkPerformanceProtocol";

const source = readFileSync("server/aurionRegionProgressionProtocol.ts", "utf8");
const catalog = JSON.parse(readFileSync("shared/aurionRegionProgressionCatalog.json", "utf8")) as {
  schemaVersion: number;
  rulesetVersion: string;
  dungeonRulesetVersion: string;
  regionArchetypes: string[];
  regionEvents: string[];
  dungeonVariants: string[];
  dungeonAffixes: string[];
  safety: { oldRegionRewardFloorBps: number; playerLevelMirroring: boolean; receiptDigestRequired: boolean };
};

const mastery = (overrides: Partial<RegionMasteryContext> = {}): RegionMasteryContext => ({
  combatLevelExact: "100",
  gatheringLevelExact: "50",
  professionLevelExact: "70",
  socialLevelExact: "30",
  politicsLevelExact: "10",
  ...overrides,
});

function sector(ordinal: number, polity: { stability?: number; conflictPressure?: number } = {}): GlobalWorldSector {
  return {
    id: `sector:${ordinal.toString().padStart(3, "0")}`,
    ordinal,
    coordinates: { x: ordinal * 4, z: 0 },
    biome: ordinal === 0 ? "highland" : ordinal === 2 ? "ashland" : ordinal === 3 ? "ruins" : "forest",
    settlement: { id: `settlement:${ordinal}`, kind: ordinal === 0 ? "capital" : "village", population: 100, capacity: 140 },
    resources: { timber: 0.6, forestHealth: 0.7, food: 0.6, water: 0.7, ore: 0.5, drought: 0.2 },
    polity: { governmentType: "council", state: "stable", stability: polity.stability ?? 0.8, conflictPressure: polity.conflictPressure ?? 0.2 },
    professions: { farmer: 4, forester: 4, trader: 4, guard: 4, builder: 4, herbalist: 4 },
    migrations: [],
    quests: [],
  };
}

describe("AIM-250 deterministic region and dungeon progression", () => {
  it("keeps the machine-readable catalog aligned with the executable protocol", () => {
    expect(catalog).toMatchObject({
      schemaVersion: 1,
      rulesetVersion: AURION_REGION_PROGRESSION_VERSION,
      dungeonRulesetVersion: AURION_DUNGEON_RULESET_VERSION,
      safety: { oldRegionRewardFloorBps: economyBounds.oldRegionRewardFloorBps, playerLevelMirroring: false, receiptDigestRequired: true },
    });
    expect(catalog.regionArchetypes).toEqual([...regionArchetypeKeys]);
    expect(catalog.dungeonVariants).toEqual([...dungeonVariants]);
    expect(catalog.dungeonAffixes).toEqual([...dungeonAffixKeys]);
  });

  it("preserves the named Aurion entry regions and deterministically expands later sectors", () => {
    expect([0, 1, 2, 3].map(ordinal => regionArchetypeForSector("aurion-seed", ordinal).key)).toEqual([
      "observatory_threshold",
      "windhollow",
      "emberfall",
      "cinder_vault",
    ]);
    const first = regionArchetypeForSector("aurion-seed", 739);
    const second = regionArchetypeForSector("aurion-seed", 739);
    expect(first).toEqual(second);
    expect(regionArchetypeKeys).toContain(first.key);
  });

  it("does not mirror player level and keeps old-region danger fixed while mastery improves bounded rewards", () => {
    const low = resolveRegionProgression({ worldSeed: "aurion-seed", epoch: 12, resolutionIndex: 3, sector: sector(0), mastery: mastery({ combatLevelExact: "1", gatheringLevelExact: "1", professionLevelExact: "1", socialLevelExact: "1", politicsLevelExact: "1" }), partySize: 1 });
    const high = resolveRegionProgression({ worldSeed: "aurion-seed", epoch: 12, resolutionIndex: 3, sector: sector(0), mastery: mastery({ combatLevelExact: "1000000", gatheringLevelExact: "1000000", professionLevelExact: "1000000", socialLevelExact: "1000000", politicsLevelExact: "1000000" }), partySize: 1 });
    expect(low.dangerBps).toBe(high.dangerBps);
    expect(high.rewardMultiplierBps).toBeGreaterThanOrEqual(low.rewardMultiplierBps);
    expect(low.rewardMultiplierBps).toBeGreaterThanOrEqual(economyBounds.oldRegionRewardFloorBps);
    expect(low.relevanceReasons).toEqual(expect.arrayContaining([
      expect.stringContaining("unique-resource:"),
      expect.stringContaining("economy-role:"),
      expect.stringContaining("faction:"),
      expect.stringContaining("dungeon:"),
      expect.stringContaining("world-event:"),
    ]));
    expect(source).not.toContain("playerLevel");
  });

  it("binds resource access to exact scoped mastery rather than a global level range", () => {
    const locked = resolveRegionProgression({ worldSeed: "aurion-seed", epoch: 12, resolutionIndex: 3, sector: sector(0), mastery: mastery({ levelsByKey: { "navigation:observatory": "24" } }), partySize: 1 });
    const unlocked = resolveRegionProgression({ worldSeed: "aurion-seed", epoch: 12, resolutionIndex: 3, sector: sector(0), mastery: mastery({ levelsByKey: { "navigation:observatory": "25" } }), partySize: 1 });
    expect(locked.resources.find(resource => resource.masteryKey === "navigation:observatory")?.unlocked).toBe(false);
    expect(unlocked.resources.find(resource => resource.masteryKey === "navigation:observatory")?.unlocked).toBe(true);
  });

  it("changes causal region events by epoch while replaying identical inputs exactly", () => {
    const input = { worldSeed: "aurion-seed", epoch: 12, resolutionIndex: 3, sector: sector(7), mastery: mastery(), partySize: 2 } as const;
    const first = resolveRegionProgression(input);
    const replay = resolveRegionProgression(input);
    const later = resolveRegionProgression({ ...input, epoch: 13 });
    expect(replay).toEqual(first);
    expect(replay.deterministicHash).toBe(first.deterministicHash);
    expect(later.deterministicHash).not.toBe(first.deterministicHash);
    expect(first.event.masteryScopes.length).toBeGreaterThan(0);
    expect(first.event.npcDirective.length).toBeGreaterThan(12);
  });

  it("supports normal, elite, challenge and unbounded endless dungeon floors from a receipt digest", () => {
    const region = resolveRegionProgression({ worldSeed: "aurion-seed", epoch: 12, resolutionIndex: 3, sector: sector(3, { stability: 0.35, conflictPressure: 0.8 }), mastery: mastery(), partySize: 4 });
    for (const variant of dungeonVariants) {
      const floorExact = variant === "endless" ? "1000000000000000000000000" : variant === "challenge" ? "250" : "1";
      const input = { worldSeed: "aurion-seed", epoch: 12, region, variant, floorExact, partySize: 4, combatMasteryLevelExact: "1000", sourceReceiptDigest: "a".repeat(64) } as const;
      const first = resolveDungeonProgression(input);
      const replay = resolveDungeonProgression(input);
      expect(replay).toEqual(first);
      expect(first.deterministicHash).toMatch(/^[a-f0-9]{64}$/);
      expect(first.combatBudgetBps).toBeGreaterThanOrEqual(10_000);
      expect(first.combatBudgetBps).toBeLessThanOrEqual(60_000);
      expect(first.rewardMultiplierBps).toBeLessThanOrEqual(50_000);
      expect(new Set(first.affixes.map(affix => affix.key)).size).toBe(first.affixes.length);
      expect(first.affixes.every(affix => dungeonAffixKeys.includes(affix.key))).toBe(true);
      expect(BigInt(first.challengeScoreExact)).toBeGreaterThan(0n);
      expect(BigInt(first.completionXpExact)).toBeGreaterThan(0n);
    }
    expect(AURION_DUNGEON_RULESET_VERSION).toBe("aurion-dungeon-progression.v2");
    expect(() => resolveDungeonProgression({ worldSeed: "aurion-seed", epoch: 12, region, variant: "normal", floorExact: "1", partySize: 1, combatMasteryLevelExact: "1", sourceReceiptDigest: "client-picked" })).toThrow(/SHA-256/);
  });

  it("defines bounded phone, tablet and desktop chunk/AOI budgets", () => {
    const budgets = chunkPerformanceTiers.map(tier => resolveChunkSimulationBudget({ tier, dangerBps: 25_000, partySize: 4 }));
    expect(budgets.map(budget => budget.tier)).toEqual(["phone", "tablet", "desktop"]);
    expect(budgets[0]!.activeProps).toBeLessThan(budgets[1]!.activeProps);
    expect(budgets[1]!.activeProps).toBeLessThan(budgets[2]!.activeProps);
    expect(budgets[0]!.serverTickDivisor).toBe(4);
    expect(budgets[2]!.serverTickDivisor).toBe(1);
    expect(budgets.every(budget => budget.remotePlayers >= 4 && budget.activeMobs > 0 && budget.aoiRadiusMeters > 0)).toBe(true);
  });

  it("keeps a run's difficulty and rewards monotone over floor and affix-count boundaries", () => {
    const region = resolveRegionProgression({ worldSeed: "aurion-seed", epoch: 12, resolutionIndex: 3, sector: sector(3), mastery: mastery(), partySize: 5 });
    for (const variant of dungeonVariants) {
      let previous: ReturnType<typeof resolveDungeonProgression> | undefined;
      for (const floor of [...Array.from({ length: 250 }, (_, index) => String(index + 1)), "999", "1000", "999999", "1000000", "1000000000000000000000000"]) {
        const next = resolveDungeonProgression({ worldSeed: "aurion-seed", epoch: 12, region, variant, floorExact: floor, partySize: 5, combatMasteryLevelExact: "1000", sourceReceiptDigest: "a".repeat(64) });
        if (previous) {
          expect(next.combatBudgetBps, `${variant} floor ${floor}`).toBeGreaterThanOrEqual(previous.combatBudgetBps);
          expect(next.rewardMultiplierBps, `${variant} floor ${floor}`).toBeGreaterThanOrEqual(previous.rewardMultiplierBps);
          expect(BigInt(next.completionXpExact)).toBeGreaterThanOrEqual(BigInt(previous.completionXpExact));
          expect(BigInt(next.enemyBudget.hpExact)).toBeGreaterThanOrEqual(BigInt(previous.enemyBudget.hpExact));
          expect(BigInt(next.challengeScoreExact)).toBeGreaterThan(BigInt(previous.challengeScoreExact));
          expect(next.affixes.slice(0, previous.affixes.length)).toEqual(previous.affixes);
          expect(next.deterministicHash).not.toBe(previous.deterministicHash);
        }
        previous = next;
      }
    }
  });

  it("projects many existing global sectors without duplicating persistent world state", () => {
    const sectors = Array.from({ length: 64 }, (_, ordinal) => sector(ordinal));
    const globalWorld: GlobalWorldPlan = {
      version: "aurion-global-world.v1",
      worldSeed: "aurion-seed",
      epoch: 12,
      activePlayerCount: 24,
      highWaterPlayerCount: 256,
      unlockedSectorCount: sectors.length,
      nextExpansionAtPlayerCount: 261,
      sectors,
      deterministicHash: "fnv1a-deadbeef",
    };
    const first = resolveRegionalWorldPlan({ globalWorld, mastery: mastery(), partySize: 2, resolutionIndex: 3 });
    const replay = resolveRegionalWorldPlan({ globalWorld, mastery: mastery(), partySize: 2, resolutionIndex: 3 });
    expect(first.version).toBe(AURION_REGION_PROGRESSION_VERSION);
    expect(first.regions).toHaveLength(64);
    expect(new Set(first.regions.map(region => region.regionId)).size).toBe(64);
    expect(first).toEqual(replay);
    expect(first.sourceWorldHash).toBe(globalWorld.deterministicHash);
  });

  it("contains no wall-clock, browser RNG or stored full-region authority", () => {
    expect(source).not.toContain("Date.now(");
    expect(source).not.toContain("Math.random(");
    expect(source).not.toContain("performance.now(");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("INSERT INTO");
  });
});
