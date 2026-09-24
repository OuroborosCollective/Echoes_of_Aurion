import type { WorldGenerationParityEvidence } from "./worldGenerationEvidenceContract";

export type WorldGenerationParityManifestRow = Readonly<{
  run_id: string;
  world_id: string;
  chunk_coordinate: string;
  anchor_id: string;
  grammar_id: string;
  grammar_version: string;
  recipe_hash: string;
  observation_key: string;
  materialization_hash: string;
  source_revision: string;
  runtime_revision: string;
  schema: string;
  from_tick: number;
  to_tick: number;
  verdict: WorldGenerationParityEvidence["status"];
  first_divergence_boundary: string;
  first_divergence_stage: string;
  first_divergence_tick: string;
  first_divergence_expected_hash: string;
  first_divergence_observed_hash: string;
  input_root_hash: string;
  post_state_root_hash: string;
  receipt_root_hash: string;
  oracle_result_hash: string;
  artifact_sha256: string;
  grammar_compile_ms: number;
  cag_analysis_ms: number;
  observation_ms: number;
  materialization_ms: number;
  simulation_ms: number;
  reference_replay_ms: number;
  persistence_ms: number;
  evidence_write_ms: number;
  serialization_ms: number;
}>;

const COLUMNS = [
  "run_id",
  "world_id",
  "chunk_coordinate",
  "anchor_id",
  "grammar_id",
  "grammar_version",
  "recipe_hash",
  "observation_key",
  "materialization_hash",
  "source_revision",
  "runtime_revision",
  "schema",
  "from_tick",
  "to_tick",
  "verdict",
  "first_divergence_boundary",
  "first_divergence_stage",
  "first_divergence_tick",
  "first_divergence_expected_hash",
  "first_divergence_observed_hash",
  "input_root_hash",
  "post_state_root_hash",
  "receipt_root_hash",
  "oracle_result_hash",
  "artifact_sha256",
  "grammar_compile_ms",
  "cag_analysis_ms",
  "observation_ms",
  "materialization_ms",
  "simulation_ms",
  "reference_replay_ms",
  "persistence_ms",
  "evidence_write_ms",
  "serialization_ms",
] as const;

export function toWorldGenerationParityManifestRow(
  evidence: WorldGenerationParityEvidence,
): WorldGenerationParityManifestRow {
  return Object.freeze({
    run_id: evidence.runId,
    world_id: evidence.worldId,
    chunk_coordinate: String(evidence.chunkCoordinate.x) + ":" + String(evidence.chunkCoordinate.z),
    anchor_id: evidence.anchorId,
    grammar_id: evidence.grammarId,
    grammar_version: evidence.grammarVersion,
    recipe_hash: evidence.recipeHash,
    observation_key: evidence.observationKey,
    materialization_hash: evidence.materializationHash,
    source_revision: evidence.sourceRevision,
    runtime_revision: evidence.runtimeRevision,
    schema: evidence.schema,
    from_tick: evidence.fromTick,
    to_tick: evidence.toTick,
    verdict: evidence.status,
    first_divergence_boundary: evidence.firstDivergenceBoundary ?? "",
    first_divergence_stage: evidence.firstDivergenceStage ?? "",
    first_divergence_tick: evidence.firstDivergenceTick === null ? "" : String(evidence.firstDivergenceTick),
    first_divergence_expected_hash: evidence.firstDivergenceExpectedHash ?? "",
    first_divergence_observed_hash: evidence.firstDivergenceObservedHash ?? "",
    input_root_hash: evidence.inputRootHash,
    post_state_root_hash: evidence.postStateRootHash,
    receipt_root_hash: evidence.receiptRootHash,
    oracle_result_hash: evidence.oracleResultHash ?? "",
    artifact_sha256: evidence.artifactIntegrityHash,
    grammar_compile_ms: evidence.timing.grammarCompileMs,
    cag_analysis_ms: evidence.timing.cagAnalysisMs,
    observation_ms: evidence.timing.observationMs,
    materialization_ms: evidence.timing.materializationMs,
    simulation_ms: evidence.timing.simulationMs,
    reference_replay_ms: evidence.timing.referenceReplayMs,
    persistence_ms: evidence.timing.persistenceMs,
    evidence_write_ms: evidence.timing.evidenceWriteMs,
    serialization_ms: evidence.timing.serializationMs,
  });
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}

export function serializeWorldGenerationParityManifest(
  rows: readonly WorldGenerationParityManifestRow[],
): string {
  const ordered = [...rows];
  const lines = [
    COLUMNS.join(","),
    ...ordered.map(row => COLUMNS.map(column => csvCell(row[column])).join(",")),
  ];
  return lines.join("\n") + "\n";
}

export function evidenceToWorldGenerationParityManifest(
  evidence: WorldGenerationParityEvidence,
): string {
  return serializeWorldGenerationParityManifest([
    toWorldGenerationParityManifestRow(evidence),
  ]);
}
