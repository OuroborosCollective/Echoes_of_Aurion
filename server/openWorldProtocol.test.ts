import { describe, expect, it } from "vitest";
import { buildOpenWorldSnapshot, buildOpenWorldTerrain, encounterBudget, maximumVisibleEnemies, type OpenWorldProfile, zoneForOpenWorldProgress } from "./openWorldProtocol";
import { buildGlobalWorldPlan } from "./globalWorldProtocol";
import { resolveWorldEpochReaction } from "./worldEpochReactionProtocol";

function snapshotInput(input: Omit<OpenWorldProfile, "playerId" | "skillProgressionEvents">, skillProgressionEvents: OpenWorldProfile["skillProgressionEvents"] = []): OpenWorldProfile {
  return { playerId: "aurion-test-player", ...input, skillProgressionEvents };
}

describe("open-world protocol", () => {
  it("uses the bounded mobile encounter formulas", () => {
    expect(encounterBudget(1, 0)).toBe(6);
    expect(encounterBudget(50, 3)).toBe(24);
    expect(maximumVisibleEnemies(1)).toBe(10);
    expect(maximumVisibleEnemies(99)).toBe(18);
  });

  it("derives the deepest permitted zone only from confirmed progress", () => {
    expect(zoneForOpenWorldProgress(snapshotInput({ level: 1, completed: [], activeQuest: null, canEnterDungeon: false }))).toBe("observatory_threshold");
    expect(zoneForOpenWorldProgress(snapshotInput({ level: 2, completed: ["astral_call"], activeQuest: null, canEnterDungeon: false }))).toBe("windhollow");
    expect(zoneForOpenWorldProgress(snapshotInput({ level: 3, completed: ["astral_call", "archive_of_echoes"], activeQuest: "ember_key", canEnterDungeon: false }))).toBe("emberfall");
    expect(zoneForOpenWorldProgress(snapshotInput({ level: 4, completed: ["astral_call", "archive_of_echoes", "ember_key"], activeQuest: null, canEnterDungeon: true }))).toBe("cinder_vault");
  });

  it("returns an immutable display snapshot with only explicitly confirmed skill receipts", () => {
    const snapshot = buildOpenWorldSnapshot(snapshotInput(
      { level: 12, completed: ["astral_call"], activeQuest: "archive_of_echoes", canEnterDungeon: false },
      [{ idempotencyKey: "quest:session-a:combat-skill", skillId: "combat", amountExact: "122", source: "quest_reward", receiptId: "result-session-a", resolutionIndex: 3 }],
    ));
    expect(snapshot.zoneId).toBe("windhollow");
    expect(snapshot.encounter.activeCount).toBeLessThanOrEqual(snapshot.encounter.maximumVisible);
    expect(snapshot.allowedCommands).toEqual(["move", "attack", "interact", "return_to_tower"]);
    expect(snapshot.npcs.find(npc => npc.id === "orun")?.memory.quest[0]).toContain("versunkene Halle");
    expect(snapshot.primaryEncounter).toMatchObject({ id: "archive-warden", encounterKey: "archive" });
    expect(snapshot.props.map(prop => prop.kind)).toEqual(["starpath_marker", "flower_shrub", "flower_shrub"]);
    expect(snapshot.worldKernel.integrity).toMatchObject({ ok: true, kappa: 1000 });
    expect(snapshot.worldKernel.cityLayout.sector).toBe(0);
    expect(snapshot.globalWorld).toMatchObject({ version: "aurion-global-world.v1", worldId: "echoes-of-aurion-global", unlockedSectorCount: 6, worldSeed: "echoes-of-aurion-v1" });
    expect(JSON.stringify(snapshot.globalWorld)).not.toContain("sectors");
    expect(snapshot.aiProposal).toMatchObject({ state: "proposal", intent: "trade_decision", commandType: "AURION_TRADE_PROPOSAL" });
    expect(snapshot.skillProgression).toMatchObject({ playerId: "aurion-test-player", skillId: "combat", progression: { totalXpExact: "122", levelExact: "2" }, appliedReceiptIds: ["result-session-a"] });
    expect(JSON.stringify(snapshot)).not.toContain("reward");
  });

  it("renders a versioned deterministic world reaction without adding a reward authority", () => {
    const input = snapshotInput({ level: 3, completed: ["astral_call", "archive_of_echoes"], activeQuest: "ember_key", canEnterDungeon: false }, [{ idempotencyKey: "confirmed:a", skillId: "combat", amountExact: "12", source: "quest_reward", receiptId: "result-a", resolutionIndex: 4 }]);
    const first = buildOpenWorldSnapshot(input);
    const second = buildOpenWorldSnapshot(input);
    expect(first.world).toEqual(second.world);
    expect(first.globalWorld).toEqual(second.globalWorld);
    expect(first.world.worldSeed).toBe("echoes-of-aurion-v1");
    expect(first.world.reaction.ruleSetVersion).toBe("aurion-wasd-rules-v1");
    expect(first.world.reaction.dialogueTone).toBe("calm");
    expect(JSON.stringify(first.world)).not.toContain("reward");
  });

  it("uses only a matching confirmed epoch reaction as a world-signal source", () => {
    const globalWorld = buildGlobalWorldPlan({ worldSeed: "echoes-of-aurion-v1", epoch: 1, activePlayerCount: 4, highWaterPlayerCount: 4 });
    const epochReaction = resolveWorldEpochReaction({ plan: globalWorld, resolutionIndex: 1, confirmedDeltas: [], observedPresence: [] });
    const matching = buildOpenWorldSnapshot(snapshotInput({ level: 1, completed: [], activeQuest: null, canEnterDungeon: false, globalWorld, epochReaction }));
    const mismatched = buildOpenWorldSnapshot(snapshotInput({ level: 1, completed: [], activeQuest: null, canEnterDungeon: false, globalWorld, epochReaction: { ...epochReaction, worldSeed: "unbound" } }));
    expect(matching.world.resolutionIndex).toBe(1);
    expect(matching.world.reaction.signalIds.some(id => id.includes(":ecology"))).toBe(true);
    expect(matching.world.reaction.signalIds.some(id => id.includes(":economy"))).toBe(true);
    expect(matching.world.reaction.signalIds.some(id => id.includes(":politics"))).toBe(true);
    expect(mismatched.world.resolutionIndex).toBe(1_000);
  });

  it("exposes bounded NPC autonomy, dialect profiles and a deterministic fictional polity", () => {
    const snapshot = buildOpenWorldSnapshot(snapshotInput({ level: 1, completed: [], activeQuest: "astral_call", canEnterDungeon: false }));
    const lyra = snapshot.npcs.find(npc => npc.id === "lyra");
    expect(lyra?.autonomy.dialectId).toBe("observatory");
    expect(lyra?.autonomy.goal).toBe("expand_influence");
    expect(lyra?.autonomy.decisionHash).toHaveLength(64);
    expect(snapshot.polity).toMatchObject({ polityId: "asterion_compact", governmentType: "council" });
    expect(snapshot.polity.territoryIds).toEqual(["cinder_vault", "emberfall", "observatory_threshold", "windhollow"]);
    expect(JSON.stringify(snapshot)).not.toContain("private key");
  });

  it("exposes only the encounter unlocked by confirmed active quest or dungeon access", () => {
    expect(buildOpenWorldSnapshot(snapshotInput({ level: 1, completed: [], activeQuest: null, canEnterDungeon: false })).primaryEncounter).toBeNull();
    expect(buildOpenWorldSnapshot(snapshotInput({ level: 3, completed: ["astral_call", "archive_of_echoes", "ember_key"], activeQuest: null, canEnterDungeon: true })).primaryEncounter).toMatchObject({ encounterKey: "cinder_vault" });
  });

  it("returns the Wolfram-budgeted read-only terrain layout without gameplay rewards", () => {
    const terrain = buildOpenWorldTerrain("emberfall");
    const counts = terrain.tiles.reduce<Record<string, number>>((summary, tile) => ({ ...summary, [tile.surface]: (summary[tile.surface] ?? 0) + 1 }), {});
    expect(terrain).toMatchObject({ chunkSizeMeters: 32, tileSizeMeters: 4, columns: 8, rows: 8, roads: { tileCount: 14, fieldTileTarget: 20, gardenTileTarget: 5 } });
    expect(terrain.tiles).toHaveLength(64);
    expect((counts.starpath ?? 0) + (counts.starpath_crossing ?? 0)).toBe(14);
    expect(counts.farmland).toBe(20);
    expect(counts.garden_parcels).toBe(5);
    expect(JSON.stringify(terrain)).not.toContain("reward");
  });

  it("derives Emberfall props from confirmed world progression without reward authority", () => {
    const snapshot = buildOpenWorldSnapshot(snapshotInput({ level: 3, completed: ["astral_call", "archive_of_echoes"], activeQuest: "ember_key", canEnterDungeon: false }));
    expect(snapshot.zoneId).toBe("emberfall");
    expect(snapshot.props.map(prop => prop.kind)).toEqual(["starpath_marker", "garden_border", "garden_border"]);
    expect(snapshot.props.every(prop => prop.tileX >= 0 && prop.tileX < 8 && prop.tileZ >= 0 && prop.tileZ < 8)).toBe(true);
    expect(JSON.stringify(snapshot.props)).not.toContain("reward");
  });
});
