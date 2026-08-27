import { describe, expect, it } from "vitest";
import { AURION_WORLD_SECTOR_CAP, buildGlobalWorldPlan, toGlobalWorldClientDescriptor, unlockedWorldSectorCount } from "./globalWorldProtocol";

describe("globalWorldProtocol", () => {
  it("expands globally from the initial sectors by the durable player high-water mark", () => {
    expect(unlockedWorldSectorCount(0)).toBe(6);
    expect(unlockedWorldSectorCount(4)).toBe(6);
    expect(unlockedWorldSectorCount(5)).toBe(7);
    expect(unlockedWorldSectorCount(9)).toBe(8);
    expect(unlockedWorldSectorCount(100_000)).toBe(AURION_WORLD_SECTOR_CAP);

    const plan = buildGlobalWorldPlan({ worldSeed: "echoes-of-aurion-v1", epoch: 12, activePlayerCount: 3, highWaterPlayerCount: 17 });
    expect(plan.highWaterPlayerCount).toBe(17);
    expect(plan.unlockedSectorCount).toBe(unlockedWorldSectorCount(17));
    expect(plan.nextExpansionAtPlayerCount).toBe(21);
  });

  it("replays the same world plan byte-for-byte for the same authoritative inputs", () => {
    const input = { worldSeed: "echoes-of-aurion-v1", epoch: 73, activePlayerCount: 46, highWaterPlayerCount: 49 };
    const first = buildGlobalWorldPlan(input);
    const replay = buildGlobalWorldPlan(input);
    expect(first).toEqual(replay);
    expect(first.deterministicHash).toBe(replay.deterministicHash);
    expect(new Set(first.sectors.map(sector => sector.id)).size).toBe(first.sectors.length);
    expect(first.sectors.every(sector => sector.settlement.population <= sector.settlement.capacity)).toBe(true);
  });

  it("publishes a compact, deterministic generation descriptor without baseline sectors", () => {
    const plan = buildGlobalWorldPlan({ worldSeed: "echoes-of-aurion-v1", epoch: 12, activePlayerCount: 3, highWaterPlayerCount: 17 });
    const descriptor = toGlobalWorldClientDescriptor(plan);
    expect(descriptor).toEqual({
      version: "aurion-global-world.v1",
      worldId: "echoes-of-aurion-global",
      worldSeed: "echoes-of-aurion-v1",
      epoch: 12,
      unlockedSectorCount: 10,
      nextExpansionAtPlayerCount: 21,
      deterministicHash: plan.deterministicHash,
    });
    expect("sectors" in descriptor).toBe(false);
  });

  it("turns ecological, economic and political pressure into bounded migration and NPC-given quest offers", () => {
    const plans = Array.from({ length: 32 }, (_, epoch) => buildGlobalWorldPlan({ worldSeed: "echoes-of-aurion-v1", epoch, activePlayerCount: 160, highWaterPlayerCount: 160 }));
    const sectors = plans.flatMap(plan => plan.sectors);
    expect(sectors.some(sector => sector.quests.some(quest => quest.kind === "restore_forest"))).toBe(true);
    expect(sectors.some(sector => sector.quests.some(quest => quest.kind === "irrigate_fields"))).toBe(true);
    expect(sectors.some(sector => sector.quests.some(quest => quest.kind === "escort_caravan"))).toBe(true);
    expect(sectors.some(sector => sector.migrations.some(migration => migration.reason === "drought" || migration.reason === "forest_recovery" || migration.reason === "market_demand"))).toBe(true);
    expect(sectors.every(sector => sector.quests.every(quest => quest.sectorId === sector.id && quest.priority >= 2 && quest.priority <= 4))).toBe(true);
  });

  it("rejects invalid global state inputs instead of producing divergent worlds", () => {
    expect(() => buildGlobalWorldPlan({ worldSeed: "", epoch: 0, activePlayerCount: 0, highWaterPlayerCount: 0 })).toThrow(/worldSeed/);
    expect(() => buildGlobalWorldPlan({ worldSeed: "echoes", epoch: -1, activePlayerCount: 0, highWaterPlayerCount: 0 })).toThrow(/epoch/);
  });
});
