import { describe, expect, it } from "vitest";
import {
  AURION_WASD_CONTENT_VERSION,
  AURION_WASD_RULESET_VERSION,
  buildWorldSeedDigest,
  decideNpcGoal,
  interpretDialogue,
  readWasdAurionCoverage,
  resolveNpcNeeds,
  resolvePolityState,
  resolveProgression,
  resolveWorldReaction,
  type WorldSignal,
} from "./wasdAurionProtocol";

const signals: readonly WorldSignal[] = [
  { id: "signal_b", kind: "hazard", regionId: "observatory_threshold", magnitude: 0.6, sourceReceiptId: "receipt_b", resolutionIndex: 4 },
  { id: "signal_a", kind: "resonance", regionId: "observatory_threshold", magnitude: 0.3, sourceReceiptId: "receipt_a", resolutionIndex: 3 },
  { id: "signal_c", kind: "ecology", regionId: "windhollow", magnitude: 0.9, sourceReceiptId: "receipt_c", resolutionIndex: 4 },
];

describe("wasdAurionProtocol", () => {
  it("binds world seeds to explicit versions, region and resolution index", () => {
    const first = buildWorldSeedDigest({ worldSeed: "aurion-v1", regionId: "observatory_threshold", resolutionIndex: 7 });
    const second = buildWorldSeedDigest({ worldSeed: "aurion-v1", regionId: "observatory_threshold", resolutionIndex: 7 });
    const changed = buildWorldSeedDigest({ worldSeed: "aurion-v1", regionId: "windhollow", resolutionIndex: 7 });
    expect(first).toBe(second);
    expect(first).not.toBe(changed);
    expect(first).toHaveLength(64);
  });

  it("resolves the same ordered world reaction regardless of source input order", () => {
    const first = resolveWorldReaction({ worldSeed: "aurion-v1", regionId: "observatory_threshold", resolutionIndex: 4, signals });
    const second = resolveWorldReaction({ worldSeed: "aurion-v1", regionId: "observatory_threshold", resolutionIndex: 4, signals: signals.slice().reverse() });
    expect(first).toEqual(second);
    expect(first.ruleSetVersion).toBe(AURION_WASD_RULESET_VERSION);
    expect(first.contentVersion).toBe(AURION_WASD_CONTENT_VERSION);
    expect(first.weatherTone).toBe("clear");
    expect(first.dialogueTone).toBe("guarded");
    expect(first.signalIds).toEqual(["signal_a", "signal_b"]);
  });

  it("uses stable needs and deterministic safety-first tie ordering", () => {
    const needs = resolveNpcNeeds({
      current: { safety: 0.7, resources: 0.7, belonging: 0.4, status: 0.4, wealth: 0.4, power: 0.4 },
      events: [
        { id: "need_2", need: "safety", delta: -0.5, sourceReceiptId: "r2", resolutionIndex: 2 },
        { id: "need_1", need: "resources", delta: -0.5, sourceReceiptId: "r1", resolutionIndex: 1 },
      ],
    });
    const decision = decideNpcGoal({ npcId: "lyra", needs, observationIds: ["world:storm", "quest:active"], resolutionIndex: 2 });
    expect(needs.safety).toBe(0.2);
    expect(needs.resources).toBe(0.2);
    expect(decision.goal).toBe("seek_safety");
    expect(decision.observationIds).toEqual(["quest:active", "world:storm"]);
  });

  it("keeps polity computation bounded and sorted", () => {
    const state = resolvePolityState({
      polityId: "asterion_compact",
      governmentType: "council",
      territoryIds: ["windhollow", "observatory_threshold"],
      stability: 0.7,
      activeDiplomacy: ["trade", "alliance"],
      warSignals: [{ id: "war", kind: "war", regionId: "windhollow", magnitude: 0.8, sourceReceiptId: "war-r", resolutionIndex: 5 }],
    });
    expect(state.territoryIds).toEqual(["observatory_threshold", "windhollow"]);
    expect(state.activeDiplomacy).toEqual(["alliance", "trade"]);
    expect(state.warPressure).toBeGreaterThan(0);
    expect(state.stability).toBeGreaterThan(0);
  });

  it("quarantines sensitive dialogue and never turns parsing into an authority mutation", () => {
    const profile = { languageProfileId: "aurion-common", dialectId: "observatory", lexiconVersion: "v1", grammarVersion: "v1", comprehensionThreshold: 0.6 } as const;
    expect(interpretDialogue({ text: "Seid gegrüßt, ich brauche einen Auftrag.", profile, trust: 0.8, threat: 0.1 })).toMatchObject({ state: "accepted", semanticIntent: "ask_quest" });
    expect(interpretDialogue({ text: "Hier ist mein private key", profile, trust: 1, threat: 0 })).toMatchObject({ state: "quarantined", semanticIntent: "unknown" });
  });

  it("exposes the complete revision-locked Wasd source catalog as a non-authoritative read model", () => {
    const first = readWasdAurionCoverage();
    const second = readWasdAurionCoverage();
    expect(first).toEqual(second);
    expect(first.sourceRevision).toBe("a4d99432e47b82ce98105eadb30360cd8040ad13");
    expect(first.adaptedModuleCount).toBe(712);
    expect(first.domainCounts.world).toBeGreaterThan(0);
    expect(first.paths).toHaveLength(712);
    expect(first.catalogHash).toHaveLength(64);
  });

  it("derives progression only from non-negative inputs and a receipt", () => {
    const next = resolveProgression({ totalXp: 90, weaponXp: 300, xpDelta: 110, weaponXpDelta: 100, receiptId: "receipt:asterion:1" });
    expect(next.totalXp).toBe(200);
    expect(next.weaponXp).toBe(400);
    expect(next.level).toBeGreaterThanOrEqual(1);
    expect(next.weaponRank).toBeGreaterThanOrEqual(1);
    expect(next.receiptHash).toHaveLength(64);
    expect(() => resolveProgression({ totalXp: -1, weaponXp: 0, xpDelta: 0, weaponXpDelta: 0, receiptId: "bad" })).toThrow();
  });
});
