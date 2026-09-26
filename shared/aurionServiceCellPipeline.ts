import { z, type ZodType } from "zod";
import { canonicalSha256 } from "./aurionCanonicalHash";
import type { AurionServiceCellManifest, AurionServiceCellScope } from "./aurionServiceCellContract";

/**
 * Aurion Service Cell Pipeline (Issue #140).
 *
 * Enforces the mandatory pipeline:
 *   UNTRUSTED INPUT
 *     -> STRICT SCHEMA
 *     -> VERIFIED ACTOR
 *     -> AURION-SCOPE AUTHORIZATION
 *     -> DOMAIN INVARIANTS
 *     -> IDEMPOTENCY
 *     -> BOUNDED EFFECT
 *     -> TARGET READBACK
 *     -> RECEIPT
 *     -> OBSERVABILITY SIDE-CHANNEL
 *
 * The pipeline is deterministic: the clock is injected, not Date.now.
 * The observability side-channel is non-mutating by contract.
 */

export const AURION_SERVICE_CELL_RECEIPT_SCHEMA = "aurion.service-cell-receipt.v1" as const;

export type ServiceCellReceiptState = "SUCCESS" | "IDEMPOTENT_REPLAY" | "UNAUTHORIZED" | "SCHEMA_REJECTED" | "INVARIANT_VIOLATION" | "STALE_REVISION" | "EFFECT_FAILED" | "READBACK_FAILED" | "DEPENDENCY_TIMEOUT";

export interface ServiceCellActor {
  readonly id: string;
  readonly scope: AurionServiceCellScope;
  readonly authenticated: boolean;
  readonly authorizedScopes: readonly AurionServiceCellScope[];
}

export interface ServiceCellRequest {
  readonly cellId: string;
  readonly operation: string;
  readonly input: unknown;
  readonly actor: ServiceCellActor;
  readonly idempotencyKey: string;
  readonly baseRevision: string;
}

export interface ServiceCellReceipt {
  readonly schema: typeof AURION_SERVICE_CELL_RECEIPT_SCHEMA;
  readonly cellId: string;
  readonly operation: string;
  readonly actorId: string;
  readonly idempotencyKey: string;
  readonly baseRevision: string;
  readonly resultRevision: string;
  readonly state: ServiceCellReceiptState;
  readonly effectApplied: boolean;
  readonly readbackHash: string | null;
  readonly errorCode: string | null;
  readonly observedAtMs: number;
  readonly receiptHash: string;
}

/** Idempotency store — real interface, not a stub. */
export interface IdempotencyStore {
  /** Returns the stored receipt if the key was already used, or null if the key is new (and now reserved). */
  checkAndReserve(key: string): Promise<ServiceCellReceipt | null>;
  /** Clears a reservation when the pipeline fails before the effect (allows retry). */
  release(key: string): Promise<void>;
  /** Commits a successful receipt to the store, finalizing the idempotency key. */
  commit(key: string, receipt: ServiceCellReceipt): void;
}

/** In-memory idempotency store for deterministic testing and single-process cells. */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly entries = new Map<string, ServiceCellReceipt>();
  private readonly reservations = new Set<string>();

  async checkAndReserve(key: string): Promise<ServiceCellReceipt | null> {
    const existing = this.entries.get(key);
    if (existing) return existing;
    if (this.reservations.has(key)) {
      // Concurrent duplicate — treat as replay of in-flight request.
      throw new Error("IDEMPOTENCY_KEY_IN_FLIGHT");
    }
    this.reservations.add(key);
    return null;
  }

  async release(key: string): Promise<void> {
    this.reservations.delete(key);
  }

  commit(key: string, receipt: ServiceCellReceipt): void {
    this.reservations.delete(key);
    this.entries.set(key, receipt);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  clear(): void {
    this.entries.clear();
    this.reservations.clear();
  }
}

/** Effect executor — runs the bounded effect and returns the result revision. */
export interface EffectExecutor<TOutput> {
  readonly contractId: string;
  execute(input: TOutput, baseRevision: string): Promise<{ resultRevision: string; effectData: unknown }>;
}

/** Readback function — independently reads back the target state after the effect. */
export type ReadbackFn<TOutput> = (input: TOutput, resultRevision: string) => Promise<{ readbackHash: string; readbackData: unknown }>;

/** Observability sink — non-mutating side-channel. Must not return anything that mutates state. */
export type ObservabilitySink = (event: ServiceCellObservabilityEvent) => void;

export interface ServiceCellObservabilityEvent {
  readonly cellId: string;
  readonly operation: string;
  readonly state: ServiceCellReceiptState;
  readonly actorId: string;
  readonly observedAtMs: number;
  readonly durationMs: number;
}

/** Domain invariant checker — returns error string or null if invariants hold. */
export type DomainInvariantChecker<TOutput> = (input: TOutput, actor: ServiceCellActor) => string | null;

export interface ServiceCellDeps<TOutput> {
  readonly clock: () => number;
  readonly idempotencyStore: IdempotencyStore;
  readonly effect: EffectExecutor<TOutput>;
  readonly readback: ReadbackFn<TOutput>;
  readonly observability: ObservabilitySink;
  readonly invariantChecker?: DomainInvariantChecker<TOutput>;
  readonly currentRevision: () => string;
  readonly dependencyTimeoutMs?: number;
}

export interface ServiceCellPipeline<TOutput> {
  readonly manifest: AurionServiceCellManifest;
  process(request: ServiceCellRequest): Promise<ServiceCellReceipt>;
}

function computeReceiptHash(receipt: Omit<ServiceCellReceipt, "receiptHash">): string {
  return canonicalSha256({
    schema: receipt.schema,
    cellId: receipt.cellId,
    operation: receipt.operation,
    actorId: receipt.actorId,
    idempotencyKey: receipt.idempotencyKey,
    baseRevision: receipt.baseRevision,
    resultRevision: receipt.resultRevision,
    state: receipt.state,
    effectApplied: receipt.effectApplied,
    readbackHash: receipt.readbackHash,
    errorCode: receipt.errorCode,
    observedAtMs: receipt.observedAtMs,
  });
}

function makeReceipt(input: Omit<ServiceCellReceipt, "schema" | "receiptHash">): ServiceCellReceipt {
  const unsigned = { schema: AURION_SERVICE_CELL_RECEIPT_SCHEMA, ...input };
  return Object.freeze({ ...unsigned, receiptHash: computeReceiptHash(unsigned) });
}

/**
 * Create a hardened service cell pipeline that enforces the full Aurion pipeline.
 * The schema must use `.strict()` to reject unknown fields.
 */
export function createServiceCellPipeline<TOutput>(
  manifest: AurionServiceCellManifest,
  schema: ZodType<TOutput>,
  deps: ServiceCellDeps<TOutput>,
): ServiceCellPipeline<TOutput> {
  return {
    manifest,
    async process(request: ServiceCellRequest): Promise<ServiceCellReceipt> {
      const startMs = deps.clock();
      const emitObservability = (state: ServiceCellReceiptState, receipt: ServiceCellReceipt) => {
        deps.observability({
          cellId: manifest.cellId,
          operation: request.operation,
          state,
          actorId: request.actor.id,
          observedAtMs: deps.clock(),
          durationMs: deps.clock() - startMs,
        });
      };

      // The pipeline must process requests for its own cell.
      if (request.cellId !== manifest.cellId) {
        const receipt = makeReceipt({
          cellId: manifest.cellId,
          operation: request.operation,
          actorId: request.actor.id,
          idempotencyKey: request.idempotencyKey,
          baseRevision: request.baseRevision,
          resultRevision: request.baseRevision,
          state: "SCHEMA_REJECTED",
          effectApplied: false,
          readbackHash: null,
          errorCode: "CELL_ID_MISMATCH",
          observedAtMs: startMs,
        });
        emitObservability("SCHEMA_REJECTED", receipt);
        return receipt;
      }

      // 1. STRICT SCHEMA — reject unknown fields (schema must be .strict()).
      const parseResult = schema.safeParse(request.input);
      if (!parseResult.success) {
        const receipt = makeReceipt({
          cellId: manifest.cellId,
          operation: request.operation,
          actorId: request.actor.id,
          idempotencyKey: request.idempotencyKey,
          baseRevision: request.baseRevision,
          resultRevision: request.baseRevision,
          state: "SCHEMA_REJECTED",
          effectApplied: false,
          readbackHash: null,
          errorCode: parseResult.error.issues[0]?.code ?? "SCHEMA_INVALID",
          observedAtMs: startMs,
        });
        emitObservability("SCHEMA_REJECTED", receipt);
        return receipt;
      }

      const parsed = parseResult.data;

      // 2. VERIFIED ACTOR — must be authenticated.
      if (!request.actor.authenticated) {
        const receipt = makeReceipt({
          cellId: manifest.cellId,
          operation: request.operation,
          actorId: request.actor.id,
          idempotencyKey: request.idempotencyKey,
          baseRevision: request.baseRevision,
          resultRevision: request.baseRevision,
          state: "UNAUTHORIZED",
          effectApplied: false,
          readbackHash: null,
          errorCode: "ACTOR_NOT_AUTHENTICATED",
          observedAtMs: startMs,
        });
        emitObservability("UNAUTHORIZED", receipt);
        return receipt;
      }

      // 3. AURION-SCOPE AUTHORIZATION — actor must be authorized for this cell's scope.
      if (!request.actor.authorizedScopes.includes(manifest.scope)) {
        const receipt = makeReceipt({
          cellId: manifest.cellId,
          operation: request.operation,
          actorId: request.actor.id,
          idempotencyKey: request.idempotencyKey,
          baseRevision: request.baseRevision,
          resultRevision: request.baseRevision,
          state: "UNAUTHORIZED",
          effectApplied: false,
          readbackHash: null,
          errorCode: "ACTOR_SCOPE_NOT_AUTHORIZED",
          observedAtMs: startMs,
        });
        emitObservability("UNAUTHORIZED", receipt);
        return receipt;
      }

      // 4. DOMAIN INVARIANTS — run invariant checker if provided.
      if (deps.invariantChecker) {
        const invariantError = deps.invariantChecker(parsed, request.actor);
        if (invariantError) {
          const receipt = makeReceipt({
            cellId: manifest.cellId,
            operation: request.operation,
            actorId: request.actor.id,
            idempotencyKey: request.idempotencyKey,
            baseRevision: request.baseRevision,
            resultRevision: request.baseRevision,
            state: "INVARIANT_VIOLATION",
            effectApplied: false,
            readbackHash: null,
            errorCode: invariantError,
            observedAtMs: startMs,
          });
          emitObservability("INVARIANT_VIOLATION", receipt);
          return receipt;
        }
      }

      // 5. IDEMPOTENCY — check for duplicate key.
      const existing = await deps.idempotencyStore.checkAndReserve(request.idempotencyKey);
      if (existing) {
        // Duplicate idempotency key — replay the original receipt.
        const receipt = makeReceipt({
          cellId: manifest.cellId,
          operation: request.operation,
          actorId: request.actor.id,
          idempotencyKey: request.idempotencyKey,
          baseRevision: request.baseRevision,
          resultRevision: existing.resultRevision,
          state: "IDEMPOTENT_REPLAY",
          effectApplied: false,
          readbackHash: existing.readbackHash,
          errorCode: null,
          observedAtMs: startMs,
        });
        emitObservability("IDEMPOTENT_REPLAY", receipt);
        deps.idempotencyStore.commit(request.idempotencyKey, receipt);
        return receipt;
      }

      // Check for stale base revision (optimistic concurrency).
      const currentRev = deps.currentRevision();
      if (request.baseRevision !== currentRev) {
        await deps.idempotencyStore.release(request.idempotencyKey);
        const receipt = makeReceipt({
          cellId: manifest.cellId,
          operation: request.operation,
          actorId: request.actor.id,
          idempotencyKey: request.idempotencyKey,
          baseRevision: request.baseRevision,
          resultRevision: currentRev,
          state: "STALE_REVISION",
          effectApplied: false,
          readbackHash: null,
          errorCode: "BASE_REVISION_STALE",
          observedAtMs: startMs,
        });
        emitObservability("STALE_REVISION", receipt);
        return receipt;
      }

      // 6. BOUNDED EFFECT — execute the effect with timeout.
      try {
        const effectPromise = deps.effect.execute(parsed, request.baseRevision);
        const timeoutMs = deps.dependencyTimeoutMs ?? 30000;
        const result = await Promise.race([
          effectPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("DEPENDENCY_TIMEOUT")), timeoutMs),
          ),
        ]);

        // 7. TARGET READBACK — independently read back the target state.
        let readbackResult: { readbackHash: string; readbackData: unknown };
        try {
          readbackResult = await deps.readback(parsed, result.resultRevision);
        } catch {
          // Effect succeeded but readback failed — mark as READBACK_FAILED.
          await deps.idempotencyStore.release(request.idempotencyKey);
          const receipt = makeReceipt({
            cellId: manifest.cellId,
            operation: request.operation,
            actorId: request.actor.id,
            idempotencyKey: request.idempotencyKey,
            baseRevision: request.baseRevision,
            resultRevision: result.resultRevision,
            state: "READBACK_FAILED",
            effectApplied: true,
            readbackHash: null,
            errorCode: "READBACK_ERROR",
            observedAtMs: startMs,
          });
          emitObservability("READBACK_FAILED", receipt);
          return receipt;
        }

        // 8. RECEIPT — create the canonical receipt.
        const receipt = makeReceipt({
          cellId: manifest.cellId,
          operation: request.operation,
          actorId: request.actor.id,
          idempotencyKey: request.idempotencyKey,
          baseRevision: request.baseRevision,
          resultRevision: result.resultRevision,
          state: "SUCCESS",
          effectApplied: true,
          readbackHash: readbackResult.readbackHash,
          errorCode: null,
          observedAtMs: startMs,
        });

        deps.idempotencyStore.commit(request.idempotencyKey, receipt);

        // 9. OBSERVABILITY SIDE-CHANNEL — non-mutating.
        emitObservability("SUCCESS", receipt);

        return receipt;
      } catch (error) {
        await deps.idempotencyStore.release(request.idempotencyKey);
        const isTimeout = error instanceof Error && error.message === "DEPENDENCY_TIMEOUT";
        const receipt = makeReceipt({
          cellId: manifest.cellId,
          operation: request.operation,
          actorId: request.actor.id,
          idempotencyKey: request.idempotencyKey,
          baseRevision: request.baseRevision,
          resultRevision: currentRev,
          state: isTimeout ? "DEPENDENCY_TIMEOUT" : "EFFECT_FAILED",
          effectApplied: false,
          readbackHash: null,
          errorCode: isTimeout ? "DEPENDENCY_TIMEOUT" : (error instanceof Error ? error.message : "EFFECT_ERROR"),
          observedAtMs: startMs,
        });
        emitObservability(isTimeout ? "DEPENDENCY_TIMEOUT" : "EFFECT_FAILED", receipt);
        return receipt;
      }
    },
  };
}

/** Verify a service cell receipt's hash matches its content. */
export function verifyServiceCellReceipt(receipt: ServiceCellReceipt): boolean {
  if (receipt.schema !== AURION_SERVICE_CELL_RECEIPT_SCHEMA) return false;
  try {
    return receipt.receiptHash === computeReceiptHash(receipt);
  } catch {
    return false;
  }
}
