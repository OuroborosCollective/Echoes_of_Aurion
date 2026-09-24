import { describe, expect, it } from "vitest";
import {
  AURION_CAUSAL_TICK_SCHEMA_V2,
  type AurionCausalTickReceipt,
} from "../../shared/aurionCausalTickContract";
import { sealHeadlessCausalOracleResult } from "../../shared/aurionHeadlessCausalOracleContract";
import { createCanonicalChunkReceipt, type CanonicalChunkReceipt } from "../../shared/aurionChunkStateContract";
import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { compileDeterministicStructureGrammar } from "../deterministicStructureGrammarCompiler";
import { StructureObservationRuntime, projectStructureObservation } from "../structureObservationRuntime";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import {
  computeWorldGenerationArtifactIntegrityHash,
  computeWorldGenerationDeterminismHash,
} from "./worldGenerationEvidenceHash";
import {
  createGameplayEvidence,
  type WorldGenerationRuntimeIdentity,
  type WorldGenerationSourceIntelligence,
} from "./worldGenerationEvidenceContract";
import {
  buildGameplayEvidenceFromReceipts,
  verifyWorldGenerationParity,
} from "./worldGenerationParityHarness";

const SOURCE_REVISION = "a".repeat(40);
const RUNTIME_IMAGE = "sha256:" + "1".repeat(64);
const WORLD_ID = "echoes-of-aurion-global";
const CHUNK = { x: -17, z: 23 };

const grammar = {
  grammarId: "parity-house",
  grammarVersion: "1.0.0",
  rootRuleId: "root",
  rules: [{
    id: "root",
    body: {
      kind: "primitive" as const,
      primitive: {
        kind: "box" as const,
        assetKey: "aurion_parity_house",
        materialKey: "stone",
        sizeMm: { x: 2_000, y: 2_500, z: 3_000 },
      },
    },
  }],
};

function confirmedChunk(overrides: Partial<CanonicalChunkReceipt> = {}) {
  const pair = createCanonicalChunkReceipt({
    worldId: WORLD_ID,
    worldSeed: "sha256:" + "2".repeat(64),
    coordinate: CHUNK,
    deltas: [],
    epoch: 1,
    sourceRevision: SOURCE_REVISION,
    previousChunkReceiptHash: null,
  });
  return {
    status: "VERIFIED" as const,
    membership: "GENERATOR_AND_EMPTY_STREAM" as const,
    worldRootHash: pair.receipt.worldRootHash,
    receipt: Object.freeze({ ...pair.receipt, ...overrides }),
    state: pair.state,
  };
}

function runtimeIdentity(): WorldGenerationRuntimeIdentity {
  return {
    sourceRevision: SOURCE_REVISION,
    runtimeRevision: SOURCE_REVISION,
    runtimeImageDigest: RUNTIME_IMAGE,
    causalTickSchema: AURION_CAUSAL_TICK_SCHEMA_V2,
    rulesetVersion: "aurion.zone.rules.v2",
  };
}

function sourceIntelligence(): WorldGenerationSourceIntelligence {
  return {
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
  };
}

function causalReceipts(): AurionCausalTickReceipt[] {
  const zone = new AuthoritativeMovementZone("observatory_threshold:world-generation-510-unit" as any);
  zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V2;
  zone.sourceRevisionOverride = SOURCE_REVISION;
  const socket = {
    readyState: 1,
    OPEN: 1,
    send() {},
    close() {},
  } as any;
  const { connectionId } = zone.join({
    userId: 51_010,
    socket,
    combatProfile: { combatLevel: 7, maxHealth: 600, weaponBonus: 15, weaponTrack: "blade" },
  });

  const receipts: AurionCausalTickReceipt[] = [];
  for (let tick = 1; tick <= 2; tick += 1) {
    zone.submitMovement(connectionId, {
      type: "move",
      clientSeq: tick,
      input: tick % 2 === 0 ? { x: 0, z: -1 } : { x: 1, z: 0 },
    });
    zone.tick();
    const receipt = zone.getLatestReceipt();
    if (!receipt) throw new Error("PARITY_TEST_RECEIPT_MISSING");
    receipts.push(receipt);
  }
  return receipts;
}

async function buildInput() {
  const confirmed = confirmedChunk();
  const generation = compileDeterministicStructureGrammar({
    worldId: WORLD_ID,
    worldSeedHash: confirmed.state.materialized.worldSeedHash,
    grammar,
    chunkCoordinate: CHUNK,
    anchorId: "anchor:parity-house",
    sourceCausalRoot: confirmed.worldRootHash,
    sourceRevision: SOURCE_REVISION,
  });

  const observationRuntime = new StructureObservationRuntime({
    causalRootService: { readChunk: async () => confirmed } as any,
    deltaPageReader: async () => ({
      worldId: WORLD_ID,
      chunkX: CHUNK.x,
      chunkZ: CHUNK.z,
      baseRevision: 1,
      deltas: [],
      nextCursor: null,
      pageHash: canonicalSha256({ domain: "parity-test-page", value: 0 }),
    }),
  });

  const observation = await observationRuntime.observe({
    worldId: WORLD_ID,
    epoch: 1,
    chunkCoordinate: CHUNK,
    structureId: "parity-house",
    anchorId: "anchor:parity-house",
    grammar,
  });
  if (observation.status !== "VERIFIED") throw new Error(observation.reason);

  const projection = projectStructureObservation(observation);
  const receipts = causalReceipts();
  const gameplay = createGameplayEvidence(receipts, 1, 2);
  const oracle = sealHeadlessCausalOracleResult({
    schema: "aurion.headless-causal-oracle.v2",
    mutationAuthority: "none",
    status: "MATCH",
    zoneId: gameplay.zoneId,
    requestedRange: { fromTick: 1, toTick: 2 },
    checkpoint: null,
    warmupTicks: [],
    verifiedTicks: [1, 2],
    sourceRevision: SOURCE_REVISION,
    rulesetVersion: gameplay.rulesetVersion,
    firstDivergence: null,
    reason: null,
    terminalReceiptHash: receipts.at(-1)?.receiptHash ?? null,
    finalStateHash: receipts.at(-1)?.postStateHash ?? null,
  });

  return {
    runId: "parity-test-run",
    generation,
    observation,
    projection,
    runtime: runtimeIdentity(),
    gameplay,
    oracle,
    sourceIntelligence: sourceIntelligence(),
    timing: {
      grammarCompileMs: 1,
      cagAnalysisMs: 0,
      observationMs: 2,
      materializationMs: 1,
      simulationMs: 3,
      referenceReplayMs: 2,
      persistenceMs: 4,
      serializationMs: 1,
      evidenceWriteMs: 1,
    },
    artifactChecksums: [{
      path: "dist/example.js",
      sha256: "sha256:" + "3".repeat(64),
    }],
    createdAt: "2026-09-24T00:00:00.000Z",
  };
}

describe("AIM-510 world generation parity harness", () => {
  it("proves one canonical recipe through observation, projection and causal replay", async () => {
    const input = await buildInput();
    const first = verifyWorldGenerationParity(input);
    const second = verifyWorldGenerationParity(input);

    expect(first.verified).toBe(true);
    expect(first.evidence.status).toBe("MATCH");
    expect(first.evidence.observationKey).toBe(input.observation.observationKey);
    expect(first.evidence.recipeHash).toBe(input.generation.deterministicFingerprint);
    expect(first.evidence.materializationHash).toBe(input.observation.materialization.materializationHash);
    expect(first.evidence.inputRootHash).toBe(input.gameplay.inputRootHash);
    expect(first.evidence.receiptRootHash).toBe(input.gameplay.receiptRootHash);
    expect(first.evidence.determinismHash).toBe(second.evidence.determinismHash);
    expect(first.evidence.artifactIntegrityHash).toBe(second.evidence.artifactIntegrityHash);
  });

  it("localizes a changed recipe at the recipe boundary", async () => {
    const input = await buildInput();
    const changed = {
      ...input,
      observation: {
        ...input.observation,
        recipeHash: "e" + "0".repeat(63),
      },
    };
    const result = verifyWorldGenerationParity(changed as typeof input);
    expect(result.verified).toBe(false);
    expect(result.evidence.status).toBe("FIRST_DIVERGENCE");
    expect(result.evidence.firstDivergenceBoundary).toBe("RECIPE");
  });

  it("fails closed when runtime identity does not match the generation revision", async () => {
    const input = await buildInput();
    const result = verifyWorldGenerationParity({
      ...input,
      runtime: { ...input.runtime, runtimeRevision: "b".repeat(40) },
    });
    expect(result.verified).toBe(false);
    expect(result.evidence.status).toBe("UNPROVABLE");
    expect(result.evidence.firstDivergenceBoundary).toBe("RUNTIME_IDENTITY");
  });

  it("localizes an oracle first divergence without converting it into a generator failure", async () => {
    const input = await buildInput();
    const oracle = sealHeadlessCausalOracleResult({
      schema: "aurion.headless-causal-oracle.v2",
      mutationAuthority: "none",
      status: "FIRST_DIVERGENCE",
      zoneId: input.gameplay.zoneId,
      requestedRange: { fromTick: 1, toTick: 2 },
      checkpoint: null,
      warmupTicks: [],
      verifiedTicks: [1],
      sourceRevision: SOURCE_REVISION,
      rulesetVersion: input.gameplay.rulesetVersion,
      firstDivergence: {
        tick: 2,
        stage: "PLAYER_ACTION",
        expectedHash: "sha256:" + "4".repeat(64),
        observedHash: "sha256:" + "5".repeat(64),
      },
      reason: null,
      terminalReceiptHash: null,
      finalStateHash: null,
    });
    const result = verifyWorldGenerationParity({ ...input, oracle });
    expect(result.verified).toBe(false);
    expect(result.evidence.status).toBe("FIRST_DIVERGENCE");
    expect(result.evidence.firstDivergenceBoundary).toBe("AUTHORITY_STAGE");
    expect(result.evidence.firstDivergenceStage).toBe("PLAYER_ACTION");
    expect(result.evidence.firstDivergenceTick).toBe(2);
    expect(result.evidence.firstDivergenceExpectedHash).toBe("sha256:" + "4".repeat(64));
    expect(result.evidence.firstDivergenceObservedHash).toBe("sha256:" + "5".repeat(64));
  });

  it("keeps CAG/source-intelligence optional and still produces a MATCH", async () => {
    const input = await buildInput();
    const result = verifyWorldGenerationParity({
      ...input,
      sourceIntelligence: undefined,
    });
    expect(result.verified).toBe(true);
    expect(result.evidence.sourceIntelligenceStatus).toBe("NOT_CONFIGURED");
  });

  it("builds identical gameplay roots from the same receipt sequence", () => {
    const receipts = causalReceipts();
    const first = buildGameplayEvidenceFromReceipts(receipts, 1, 2);
    const second = createGameplayEvidence(receipts, 1, 2);
    expect(first).toEqual(second);
  });

  it("artifact and determinism hashes verify independently", async () => {
    const input = await buildInput();
    const result = verifyWorldGenerationParity(input);
    expect(computeWorldGenerationArtifactIntegrityHash(result.evidence.artifactChecksums))
      .toBe(result.evidence.artifactIntegrityHash);
    const unsigned = { ...result.evidence };
    delete (unsigned as any).determinismHash;
    delete (unsigned as any).artifactIntegrityHash;
    expect(computeWorldGenerationDeterminismHash(unsigned as never))
      .toBe(result.evidence.determinismHash);
  });
});
