import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  AURION_REPLAY_VERDICT_SCHEMA,
  isReplayMatch,
  replayMatch,
  replayUnprovable,
  replayVerdictSchema,
} from "../shared/aurionReplayContract";
import { QuestReplayReceiptSchema } from "../shared/aurionQuestContract";

describe("Blocker 6 shared replay verdict gate", () => {
  const context = {
    domain: "ZONE_TICK" as const,
    sourceRevision: "a".repeat(40),
    rulesetVersion: "aurion.test.rules.v1",
    scopeIdentity: { worldId: "world_test", zoneId: "zone_test" },
    range: { fromTick: 7, toTick: 7 },
  };

  it("fails closed: missing evidence is never a MATCH", () => {
    const missing = replayUnprovable(context, [], "REQUIRED_EVIDENCE_MISSING", { tick: 7 });
    expect(missing.status).toBe("UNPROVABLE");
    expect(isReplayMatch(missing)).toBe(false);
    expect(missing.verifiedStages).toEqual([]);
    expect(missing.firstDivergentStage).toBeNull();
    expect(missing.expectedHash).toBeNull();
    expect(missing.observedHash).toBeNull();

    const match = replayMatch(context, ["PRE_STATE"]);
    expect(isReplayMatch(match)).toBe(true);
    expect(match.schemaVersion).toBe(AURION_REPLAY_VERDICT_SCHEMA);
  });

  it("rejects contradictory verdict metadata", () => {
    expect(() => replayVerdictSchema.parse({
      ...replayMatch(context, ["PRE_STATE"]),
      reason: "MISSING_EVIDENCE",
    })).toThrow();

    expect(() => replayVerdictSchema.parse({
      ...replayUnprovable(context, [], "MISSING_EVIDENCE"),
      status: "MATCH",
      verdict: "MATCH",
      reason: null,
    })).toThrow();
  });

  it("rejects a quest compatibility projection that disagrees with the shared verdict", () => {
    const shared = replayUnprovable({
      domain: "QUEST_COMPILER",
      sourceRevision: "b".repeat(40),
      rulesetVersion: "aurion.quest.compiler.v1",
      scopeIdentity: { worldId: "world_test", instanceId: "quest_1" },
      range: { fromSequence: 1, toSequence: 1 },
    }, [], "QUEST_WORLD_FACT_EVIDENCE_MISSING");

    expect(() => QuestReplayReceiptSchema.parse({
      instanceId: "quest_1",
      sourceTuple: {
        worldId: "world_test",
        worldStateRevision: 1,
        triggerEventId: "evt_1",
        compilerVersion: "1.0.0",
        templateSetHash: "c".repeat(64),
        candidateSetHash: "d".repeat(64),
        seedDigest: "seed",
        roleBindingHash: "e".repeat(64),
        expectedPlanHash: "f".repeat(64),
      },
      replayedPlanHash: "UNPROVABLE",
      replayedGraphHash: "0".repeat(64),
      replayedOutcomeHash: "UNPROVABLE",
      replayVerdict: shared,
      verdict: "MATCH",
      timestamp: "2026-09-18T00:00:00.000Z",
    })).toThrow("QUEST_REPLAY_VERDICT_PROJECTION_MISMATCH");
  });

  it("inventories every formal replay engine and keeps NPC receipt rehydration distinct", () => {
    const inventory = JSON.parse(readFileSync("architecture/replay-inventory.json", "utf8"));
    const formal = inventory.systems.filter((entry: any) => entry.classification === "FORMAL_REPLAY_ENGINE");
    expect(formal.map((entry: any) => entry.replayId).sort()).toEqual([
      "quest.compiler",
      "world.context",
      "zone.tick",
    ]);
    for (const entry of formal) {
      expect(entry.verdictContract).toBe("shared/aurionReplayContract.ts");
      const source = readFileSync(entry.implementation, "utf8");
      expect(source).toContain("aurionReplayContract");
    }

    expect(inventory.systems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        replayId: "npc.decision-rehydration",
        classification: "RECEIPT_REHYDRATION_ONLY",
        verdictContract: null,
      }),
    ]));
  });
});
