import { createServiceCellManifest, type AurionServiceCellScope } from "../shared/aurionServiceCellContract";

/**
 * Aurion Service Cell Generator (Issue #140).
 *
 * Generates a hardened internal template for new Aurion Backend-/Worker-/Apply-Komponenten
 * that enforces the ownership boundary by default. The generator produces:
 * - A manifest declaration (mayWriteGameplayTruth=false, ownsEffects=false)
 * - A pipeline skeleton using the canonical pipeline
 * - A zod schema skeleton with .strict() for unknown-field rejection
 *
 * No automatic route/DB-migration/authority/deployment is granted.
 */

export interface GeneratedServiceCell {
  readonly cellId: string;
  readonly scope: AurionServiceCellScope;
  readonly manifestSource: string;
  readonly pipelineSource: string;
  readonly schemaSource: string;
  readonly manifest: ReturnType<typeof createServiceCellManifest>;
}

/**
 * Generate a new Aurion Service Cell from the hardened template.
 * The generated cell has mayWriteGameplayTruth=false and ownsEffects=false
 * by default — these are technically immutable.
 */
export function generateServiceCell(input: {
  cellId: string;
  scope: AurionServiceCellScope;
  operationName?: string;
}): GeneratedServiceCell {
  const manifest = createServiceCellManifest({
    cellId: input.cellId,
    scope: input.scope,
    // Default: no gameplay/world write authority
    mayWriteGameplayTruth: false,
    mayWriteWorldTruth: false,
    registeredContracts: [],
  });

  const operationName = input.operationName ?? "processRequest";

  const manifestSource = `import { createServiceCellManifest } from "@shared/aurionServiceCellContract";

// ${input.cellId} — Aurion Service Cell Manifest
// ownsEffects is technically immutable: false.
// mayWriteGameplayTruth is false — no gameplay write authority.
export const manifest = createServiceCellManifest({
  cellId: ${JSON.stringify(input.cellId)},
  scope: ${JSON.stringify(input.scope)},
  mayWriteGameplayTruth: false,
  mayWriteWorldTruth: false,
  registeredContracts: [],
});
`;

  const schemaSource = `import { z } from "zod";

// ${input.cellId} — Strict schema (rejects unknown fields)
export const ${operationName}Schema = z.object({
  // Define your fields here — .strict() rejects unknown fields.
}).strict();
`;

  const pipelineSource = `import { z } from "zod";
import { createServiceCellPipeline, InMemoryIdempotencyStore } from "@shared/aurionServiceCellPipeline";
import { manifest } from "./${input.cellId}Manifest";
import { ${operationName}Schema } from "./${input.cellId}Schema";

// ${input.cellId} — Aurion Service Cell Pipeline
// Enforces: strict schema -> verified actor -> scope authorization ->
// domain invariants -> idempotency -> bounded effect -> readback -> receipt ->
// observability side-channel (non-mutating).

const idempotencyStore = new InMemoryIdempotencyStore();

const effect = {
  contractId: "${input.cellId}",
  async execute(input, baseRevision) {
    // Implement the bounded effect here.
    // Must be deterministic. Must return { resultRevision, effectData }.
    throw new Error("EFFECT_NOT_IMPLEMENTED");
  },
};

const readback = async (input, resultRevision) => {
  // Implement independent readback here.
  // Must return { readbackHash, readbackData }.
  throw new Error("READBACK_NOT_IMPLEMENTED");
};

// Observability side-channel — MUST be non-mutating.
const observability = (event) => {
  // Log/emit metrics only. Do NOT mutate any state.
};

export const pipeline = createServiceCellPipeline(manifest, ${operationName}Schema, {
  clock: () => Date.now(), // Replace with injected deterministic clock in production
  idempotencyStore,
  effect,
  readback,
  observability,
  currentRevision: () => "rev-0",
});
`;

  return Object.freeze({
    cellId: input.cellId,
    scope: input.scope,
    manifestSource,
    pipelineSource,
    schemaSource,
    manifest,
  });
}
