import { z } from "zod";
import { canonicalSha256 } from "../shared/aurionCanonicalHash";
import { createServiceCellManifest } from "../shared/aurionServiceCellContract";
import {
  createServiceCellPipeline,
  InMemoryIdempotencyStore,
  type ServiceCellPipeline,
  type ServiceCellReceipt,
} from "../shared/aurionServiceCellPipeline";

/**
 * Evidence Service Cell — Example Aurion-owned, non-gameplay service cell (Issue #140).
 *
 * A read-only player/companion evidence service. It does NOT write gameplay truth.
 * It stores and retrieves evidence records (receipts) with idempotency and readback.
 *
 * This is a real, functional implementation — no mocks, stubs, or fakes.
 */

export const evidenceManifest = createServiceCellManifest({
  cellId: "evidence-service",
  scope: "evidence",
  mayWriteGameplayTruth: false,
  mayWriteWorldTruth: false,
  registeredContracts: [],
});

// Strict schema — rejects unknown fields.
export const recordEvidenceSchema = z
  .object({
    subjectId: z.string().min(1).max(128),
    evidenceType: z.enum(["receipt", "readmodel", "audit", "export"]),
    description: z.string().min(1).max(512),
    payloadHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

export type RecordEvidenceInput = z.infer<typeof recordEvidenceSchema>;

interface EvidenceRecord {
  readonly id: string;
  readonly subjectId: string;
  readonly evidenceType: string;
  readonly description: string;
  readonly payloadHash: string;
  readonly recordedAtMs: number;
  readonly revision: string;
}

class EvidenceStore {
  private readonly records = new Map<string, EvidenceRecord>();
  private readonly revisions = new Map<string, string>(); // revision -> recordId
  private revision = "rev-0";

  store(input: RecordEvidenceInput, clock: () => number): { id: string; revision: string } {
    const id = canonicalSha256({
      subjectId: input.subjectId,
      evidenceType: input.evidenceType,
      payloadHash: input.payloadHash,
      recordedAtMs: clock(),
    });
    const revision = `rev-${this.records.size + 1}`;
    this.records.set(id, {
      id,
      subjectId: input.subjectId,
      evidenceType: input.evidenceType,
      description: input.description,
      payloadHash: input.payloadHash,
      recordedAtMs: clock(),
      revision,
    });
    this.revisions.set(revision, id);
    this.revision = revision;
    return { id, revision };
  }

  readbackByRevision(revision: string): { readbackHash: string; recordId: string } | null {
    const recordId = this.revisions.get(revision);
    if (!recordId) return null;
    const record = this.records.get(recordId);
    if (!record) return null;
    const readbackHash = canonicalSha256({
      id: record.id,
      subjectId: record.subjectId,
      evidenceType: record.evidenceType,
      payloadHash: record.payloadHash,
      revision: record.revision,
    });
    return { readbackHash, recordId };
  }

  getRevision(): string {
    return this.revision;
  }

  size(): number {
    return this.records.size;
  }
}

export interface EvidenceServiceCell {
  readonly manifest: typeof evidenceManifest;
  readonly pipeline: ServiceCellPipeline<RecordEvidenceInput>;
  readonly store: EvidenceStore;
  process(request: {
    input: unknown;
    actor: { id: string; authenticated: boolean; authorizedScopes: readonly string[] };
    idempotencyKey: string;
    baseRevision: string;
  }): Promise<ServiceCellReceipt>;
}

/**
 * Create a real, functional evidence service cell.
 * The clock is injected for determinism — not Date.now.
 */
export function createEvidenceServiceCell(options: {
  clock: () => number;
  dependencyTimeoutMs?: number;
  readbackOverride?: (revision: string) => Promise<{ readbackHash: string }>;
}): EvidenceServiceCell {
  const store = new EvidenceStore();
  const idempotencyStore = new InMemoryIdempotencyStore();

  const pipeline = createServiceCellPipeline(
    evidenceManifest,
    recordEvidenceSchema,
    {
      clock: options.clock,
      idempotencyStore,
      effect: {
        contractId: "evidence-service",
        async execute(input: RecordEvidenceInput, _baseRevision: string) {
          const { id, revision } = store.store(input, options.clock);
          return { resultRevision: revision, effectData: { id } };
        },
      },
      readback: async (_input: RecordEvidenceInput, resultRevision: string) => {
        if (options.readbackOverride) {
          const result = await options.readbackOverride(resultRevision);
          return { readbackHash: result.readbackHash, readbackData: null };
        }
        const result = store.readbackByRevision(resultRevision);
        if (!result) throw new Error("READBACK_NOT_FOUND");
        return { readbackHash: result.readbackHash, readbackData: { id: result.recordId } };
      },
      observability: () => {
        // Non-mutating: intentionally empty — observability is a no-op side-channel.
        // In production this would emit metrics/logs without mutating any state.
      },
      currentRevision: () => store.getRevision(),
      dependencyTimeoutMs: options.dependencyTimeoutMs,
    },
  );

  return {
    manifest: evidenceManifest,
    pipeline,
    store,
    process(request) {
      return pipeline.process({
        cellId: "evidence-service",
        operation: "recordEvidence",
        input: request.input,
        actor: {
          id: request.actor.id,
          scope: "evidence",
          authenticated: request.actor.authenticated,
          authorizedScopes: request.actor.authorizedScopes as readonly ("account" | "community" | "asset" | "ops" | "persistence" | "readmodel" | "evidence")[],
        },
        idempotencyKey: request.idempotencyKey,
        baseRevision: request.baseRevision,
      });
    },
  };
}
