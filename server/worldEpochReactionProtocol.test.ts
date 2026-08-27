import { describe, expect, it } from "vitest";
import { buildGlobalWorldPlan } from "./globalWorldProtocol";
import { resolveWorldEpochReaction, AURION_WORLD_EPOCH_MAX_SECTORS_PER_RESOLUTION, AURION_WORLD_EPOCH_MAX_SOURCE_DELTAS } from "./worldEpochReactionProtocol";
import { createWorldChunkDelta } from "./worldChunkProtocol";
import { createWorldPresenceLease } from "./worldPresenceProtocol";

const plan = buildGlobalWorldPlan({ worldSeed: "epoch-contract-seed", epoch: 1, activePlayerCount: 120, highWaterPlayerCount: 120 });
const treeDelta = createWorldChunkDelta({ id: "delta:tree:001", worldId: "echoes-of-aurion-global", coordinate: { x: 0, z: 0 }, baseRevision: 1, sequence: 1, kind: "resource_depleted", targetId: "tree:0:0:0", actorUserId: 7, idempotencyKey: "epoch:tree:delta:0001", payload: { resourceKind: "tree" } });
const roadDelta = createWorldChunkDelta({ id: "delta:road:001", worldId: "echoes-of-aurion-global", coordinate: { x: 2, z: -1 }, baseRevision: 1, sequence: 1, kind: "road_built", targetId: "road:0:0000000000000001", actorUserId: 7, idempotencyKey: "epoch:road:delta:0001", payload: { fromXmm: 0, fromZmm: 0, toXmm: 12_000, toZmm: 0 } });
const presence = createWorldPresenceLease({ userId: 7, connectionId: "epoch_test_connection_001", zoneId: "observatory_threshold", position: { x: 0, z: 0 }, now: new Date("2026-01-01T00:00:00.000Z") });

describe("worldEpochReactionProtocol", () => {
  it("produces the same receipt-bound world reaction regardless of confirmed source ordering", () => {
    const first = resolveWorldEpochReaction({ plan, resolutionIndex: 1, confirmedDeltas: [treeDelta, roadDelta], observedPresence: [presence] });
    const second = resolveWorldEpochReaction({ plan, resolutionIndex: 1, confirmedDeltas: [roadDelta, treeDelta], observedPresence: [presence] });
    expect(second).toEqual(first);
    expect(first.receiptId).toMatch(/^world-epoch:1:[0-9a-f]{24}$/);
    expect(first.sectors).toHaveLength(Math.min(AURION_WORLD_EPOCH_MAX_SECTORS_PER_RESOLUTION, plan.sectors.length));
    expect(first.sectors.every(sector => sector.polity.civilianStructuresProtected && sector.polity.playerHomesProtected)).toBe(true);
  });

  it("adapts deforestation, bounded regrowth and infrastructure into deterministic resource, profession and quest consequences", () => {
    const reaction = resolveWorldEpochReaction({ plan, resolutionIndex: 1, confirmedDeltas: Array.from({ length: 8 }, (_, index) => createWorldChunkDelta({ id: `delta:tree:${String(index).padStart(3, "0")}`, worldId: "echoes-of-aurion-global", coordinate: { x: 0, z: 0 }, baseRevision: 1, sequence: index + 1, kind: "resource_depleted", targetId: `tree:0:0:${index}`, actorUserId: 7, idempotencyKey: `epoch:tree:pressure:${String(index).padStart(4, "0")}`, payload: { resourceKind: "tree" } })), observedPresence: [presence] });
    const affected = reaction.sectors.find(sector => sector.sourceIds.some(id => id.startsWith("delta:tree:")));
    expect(affected).toBeDefined();
    expect(affected!.resources.timber).toBeLessThanOrEqual(plan.sectors.find(sector => sector.id === affected!.sectorId)!.resources.timber);
    const baseline = resolveWorldEpochReaction({ plan, resolutionIndex: 1, confirmedDeltas: [], observedPresence: [] }).sectors.find(sector => sector.sectorId === affected!.sectorId)!;
    const wood = affected!.market.find(stock => stock.itemId === "wood_log")!;
    const baselineWood = baseline.market.find(stock => stock.itemId === "wood_log")!;
    expect(affected!.professions.forester).toBeGreaterThan(0);
    expect(affected!.market).toHaveLength(3);
    expect(wood.stock).toBeLessThan(baselineWood.stock);
    expect(wood.price).toBeGreaterThanOrEqual(baselineWood.price);
    expect(affected!.migrations).toContainEqual(expect.objectContaining({ profession: "forester", reason: "forest_recovery", protectedRoute: true }));
    expect(affected!.questOffers).toContainEqual(expect.objectContaining({ id: `epoch-quest:${affected!.sectorId}:restore-forest`, npcRole: "forester" }));
    expect(affected!.migrations.every(migration => migration.protectedRoute)).toBe(true);
    expect(JSON.stringify(affected!.questOffers)).not.toContain("reward");
  });

  it("derives bounded deescalation from confirmed infrastructure and replays quest offers exactly", () => {
    const roads = Array.from({ length: 8 }, (_, index) => createWorldChunkDelta({ id: `delta:road:care:${String(index).padStart(3, "0")}`, worldId: "echoes-of-aurion-global", coordinate: { x: 41, z: -19 }, baseRevision: 1, sequence: index + 1, kind: "road_built", targetId: `road:care:${index.toString(16).padStart(16, "0")}`, actorUserId: 7, idempotencyKey: `epoch:road:care:${String(index).padStart(4, "0")}`, payload: { fromXmm: index * 1_000, fromZmm: 0, toXmm: index * 1_000 + 750, toZmm: 0 } }));
    const first = resolveWorldEpochReaction({ plan, resolutionIndex: 1, confirmedDeltas: roads, observedPresence: [presence] });
    const replay = resolveWorldEpochReaction({ plan, resolutionIndex: 1, confirmedDeltas: roads.slice().reverse(), observedPresence: [presence] });
    const affected = first.sectors.find(sector => sector.sourceIds.some(id => id.startsWith("delta:road:care:")))!;
    const baseline = resolveWorldEpochReaction({ plan, resolutionIndex: 1, confirmedDeltas: [], observedPresence: [] }).sectors.find(sector => sector.sectorId === affected.sectorId)!;
    expect(replay).toEqual(first);
    expect(affected.polity.deescalation).toBeGreaterThan(baseline.polity.deescalation);
    expect(affected.polity.conflictPressure).toBeLessThanOrEqual(baseline.polity.conflictPressure);
    expect(affected.polity.stability).toBeGreaterThanOrEqual(baseline.polity.stability);
    expect(affected.polity.conflictPressure).toBeGreaterThanOrEqual(0);
    expect(affected.polity.conflictPressure).toBeLessThanOrEqual(1);
    expect(affected.polity.civilianStructuresProtected && affected.polity.playerHomesProtected).toBe(true);
    expect(affected.questOffers).toEqual(replay.sectors.find(sector => sector.sectorId === affected.sectorId)!.questOffers);
  });

  it("bounds accepted delta work and rejects an index that does not equal the persisted global epoch", () => {
    const deltas = Array.from({ length: AURION_WORLD_EPOCH_MAX_SOURCE_DELTAS + 7 }, (_, index) => createWorldChunkDelta({ id: `delta:bounded:${String(index).padStart(4, "0")}`, worldId: "echoes-of-aurion-global", coordinate: { x: index % 3, z: Math.floor(index / 3) }, baseRevision: 1, sequence: index + 1, kind: "structure_placed", targetId: `structure:7:${index.toString(16).padStart(16, "0")}`, actorUserId: 7, idempotencyKey: `epoch:bounded:delta:${String(index).padStart(4, "0")}`, payload: { assetKey: "aurion_tripo_starpath_marker", xMm: 1_000, zMm: 1_000 } }));
    const reaction = resolveWorldEpochReaction({ plan, resolutionIndex: 1, confirmedDeltas: deltas, observedPresence: [] });
    expect(reaction.ignoredSourceDeltaCount).toBe(7);
    expect(() => resolveWorldEpochReaction({ plan, resolutionIndex: 2, confirmedDeltas: [], observedPresence: [] })).toThrow(/must equal/);
  });
});
