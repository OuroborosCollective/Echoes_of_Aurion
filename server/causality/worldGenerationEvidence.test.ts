import { describe, expect, it } from "vitest";
import {
  AURION_CAUSAL_TICK_SCHEMA_V2,
  computeReceiptHash,
  type AurionCausalTickReceiptV2,
} from "../../shared/aurionCausalTickContract";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import {
  assertWorldGenerationEvidence,
  canonicalWorldGenerationEvidenceJson,
  canonicalWorldGenerationHash,
  createGameplayEvidence,
} from "./worldGenerationEvidenceContract";
import {
  computeWorldGenerationArtifactIntegrityHash,
  computeWorldGenerationDeterminismHash,
  verifyWorldGenerationArtifactIntegrityHash,
  verifyWorldGenerationEvidenceBytes,
} from "./worldGenerationEvidenceHash";

const revision = "a".repeat(40);
const digest = (hex: string) => "sha256:" + hex.repeat(64).slice(0, 64);

function receipt(tick: number, previousReceiptHash: string | null): AurionCausalTickReceiptV2 {
  const stages = Array.from([
    "MEMBERSHIP_REVIVAL",
    "MOVEMENT",
    "PLAYER_ACTION",
    "RESOURCE",
    "MOB_FSM",
    "MOB_COMBAT",
    "REGENERATION",
  ] as const).map((stageName, index) => ({
    stageName,
    stageOrdinal: index + 1,
    stageInputIdentity: canonicalSha256({ tick, stageName, kind: "input" }),
    canonicalStateHash: canonicalSha256({ tick, stageName, kind: "state" }),
    transitionHash: canonicalSha256({ tick, stageName, kind: "transition" }),
  }));

  const unsigned = {
    schema: AURION_CAUSAL_TICK_SCHEMA_V2 as const,
    worldId: "world",
    zoneId: "zone",
    tick,
    sourceRevision: revision,
    rulesetVersion: "aurion.zone.rules.v2",
    previousReceiptHash,
    preStateHash: digest("1"),
    orderedIntentHash: digest("2"),
    transitionHash: digest("3"),
    rngRootHash: digest("4"),
    postStateHash: digest("5"),
    stages,
  };
  return { ...unsigned, receiptHash: computeReceiptHash(unsigned) };
}

describe("AIM-510 world generation evidence contract", () => {
  it("canonicalizes object-key order but preserves array order", () => {
    const first = canonicalWorldGenerationEvidenceJson({
      z: 2,
      a: { b: true, a: 1 },
      list: [3, 1],
    });
    const second = canonicalWorldGenerationEvidenceJson({
      list: [3, 1],
      a: { a: 1, b: true },
      z: 2,
    });
    expect(first).toBe(second);
    expect(canonicalWorldGenerationHash(first)).toBe(canonicalWorldGenerationHash(second));
    expect(canonicalWorldGenerationHash({
      list: [1, 3],
      a: { a: 1, b: true },
      z: 2,
    })).not.toBe(canonicalWorldGenerationHash(second));
  });

  it("requires a contiguous causal receipt chain for gameplay roots", () => {
    const first = receipt(1, null);
    const second = receipt(2, first.receiptHash);
    const gameplay = createGameplayEvidence([second, first], 1, 2);
    expect(gameplay.fromTick).toBe(1);
    expect(gameplay.toTick).toBe(2);
    expect(gameplay.receiptRootHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const broken = { ...second, previousReceiptHash: digest("f") };
    expect(() => createGameplayEvidence([first, broken], 1, 2))
      .toThrow("WORLD_GENERATION_GAMEPLAY_RECEIPT_CHAIN_INVALID");
    expect(() => createGameplayEvidence([first], 1, 2))
      .toThrow("WORLD_GENERATION_GAMEPLAY_RECEIPT_GAP");
  });

  it("makes artifact integrity an independently verifiable boundary", () => {
    const checksums = [
      { path: "b.js", sha256: digest("b") },
      { path: "a.js", sha256: digest("a") },
    ] as const;
    const hash = computeWorldGenerationArtifactIntegrityHash(checksums);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const evidence = {
      schema: "aurion.world-generation.parity.v1",
      mutationAuthority: "none",
      status: "UNPROVABLE",
      runId: "fixture",
      worldId: "world",
      chunkCoordinate: { x: 0, z: 0 },
      anchorId: "anchor",
      worldSeedHash: digest("1"),
      causalRootHash: digest("2"),
      grammarId: "grammar",
      grammarVersion: "1.0.0",
      recipeHash: "f".repeat(64),
      dependencyRootHash: digest("3"),
      observationKey: digest("4"),
      confirmedChunkAuthorityStateHash: digest("5"),
      materializationHash: digest("6"),
      sourceRevision: revision,
      runtimeRevision: revision,
      runtimeImageDigest: digest("7"),
      causalTickSchema: "aurion.causal.tick.v2",
      rulesetVersion: "aurion.zone.rules.v2",
      fromTick: 1,
      toTick: 1,
      inputRootHash: digest("8"),
      preStateRootHash: digest("9"),
      orderedIntentRootHash: digest("a"),
      authorityStageRootHash: digest("b"),
      rngRootHash: digest("c"),
      postStateRootHash: digest("d"),
      receiptRootHash: digest("e"),
      oracleVerdict: null,
      oracleResultHash: null,
      firstDivergenceBoundary: null,
      firstDivergenceStage: null,
      firstDivergenceTick: null,
      firstDivergenceExpectedHash: null,
      firstDivergenceObservedHash: null,
      referenceRuntimeIdentity: {
        sourceRevision: revision,
        runtimeRevision: revision,
        runtimeImageDigest: digest("f"),
        causalTickSchema: "aurion.causal.tick.v2",
        rulesetVersion: "aurion.zone.rules.v2",
      },
      productionRuntimeIdentity: {
        sourceRevision: revision,
        runtimeRevision: revision,
        runtimeImageDigest: digest("f"),
        causalTickSchema: "aurion.causal.tick.v2",
        rulesetVersion: "aurion.zone.rules.v2",
      },
      sourceIntelligence: {
        status: "NOT_CONFIGURED",
        parserVersion: null,
        parserRevision: null,
        parserStructureHash: null,
        inspectorVersion: null,
        inspectorRevision: null,
        inspectorFindingsHash: null,
        analysisVersion: null,
        requestSha256: null,
        responseSha256: null,
        analysisFingerprint: null,
        sourceBoundary: "not_configured",
      },
      sourceIntelligenceStatus: "NOT_CONFIGURED",
      determinismHash: digest("0"),
      artifactIntegrityHash: hash,
      timing: {
        grammarCompileMs: 0,
        cagAnalysisMs: 0,
        observationMs: 0,
        materializationMs: 0,
        simulationMs: 0,
        referenceReplayMs: 0,
        persistenceMs: 0,
        serializationMs: 0,
        evidenceWriteMs: 0,
      },
      artifactChecksums: checksums,
      createdAt: "2026-09-24T00:00:00.000Z",
    } as const;

    expect(verifyWorldGenerationArtifactIntegrityHash(evidence)).toBe(true);
    expect(() => assertWorldGenerationEvidence({
      ...evidence,
      status: "MATCH",
      firstDivergenceBoundary: "RECIPE",
    })).toThrow("WORLD_GENERATION_MATCH_WITH_DIVERGENCE");
  });

  it("reproduces the determinism hash from the evidence payload", () => {
    const unsigned = {
      worldId: "world",
      status: "MATCH",
      recipeHash: "f".repeat(64),
      sourceRevision: revision,
      causalRootHash: digest("1"),
      worldSeedHash: digest("2"),
      chunkCoordinate: { x: 0, z: 0 },
      anchorId: "anchor",
      grammarId: "grammar",
      grammarVersion: "1.0.0",
      dependencyRootHash: digest("3"),
      observationKey: digest("4"),
      confirmedChunkAuthorityStateHash: digest("5"),
      materializationHash: digest("6"),
      causalTickSchema: "aurion.causal.tick.v2",
      rulesetVersion: "aurion.zone.rules.v2",
      fromTick: 1,
      toTick: 1,
      inputRootHash: digest("7"),
      preStateRootHash: digest("8"),
      orderedIntentRootHash: digest("9"),
      authorityStageRootHash: digest("a"),
      rngRootHash: digest("b"),
      postStateRootHash: digest("c"),
      receiptRootHash: digest("d"),
      oracleVerdict: "MATCH",
      oracleResultHash: digest("e"),
      sourceIntelligence: {
        status: "NOT_CONFIGURED",
      },
    } as any;
    const hash = computeWorldGenerationDeterminismHash(unsigned);
    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(verifyWorldGenerationEvidenceBytes(canonicalWorldGenerationEvidenceJson(unsigned))).toMatch(/^sha256:[a-f0-9]{64}$/);
  });
});
