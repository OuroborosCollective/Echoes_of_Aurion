import {
  clientObservationIdentifier, decodeClientVerificationReceipt,
  type ClientVerificationStatus,
} from "../../shared/aurionClientVerificationContract";
import {
  createWorldChunkProjectionWorkerJobV2, type WorldChunkProjectionWorkerJobV2,
} from "../../shared/worldChunkProjectionV2";
import { deadlineAfter, operationalNow, type OperationalClock, hostOperationalClock } from "../../shared/operationalClock";

export type ClientVerificationReadback = Readonly<{
  status: ClientVerificationStatus;
  generation: number | null;
  reason: "NO_EXPECTATION" | "AWAITING_CLIENT_APPLY" | "CLIENT_REPORTED_MATCH" | "CLIENT_REPORTED_MISMATCH" | "DEADLINE_ELAPSED";
  clientVerificationHash: string | null;
  trust: "untrusted-client-observation";
  mutationAuthority: "none";
}>;

type Pending = {
  job: WorldChunkProjectionWorkerJobV2;
  deadline: number;
  forgetAt: number;
  status: ClientVerificationStatus;
  reason: ClientVerificationReadback["reason"];
  clientVerificationHash: string | null;
};

/**
 * One expected generation per authenticated connection/session binding; never
 * construct its binding from the report body. The live registry bounds records,
 * schedules five-minute disposal and clears them on authenticated socket close.
 * This service's own TTL is additionally checked lazily; no DB/logging/secrets.
 * Receipt matching proves only what this untrusted client reported.
 */
export class AurionClientVerificationService {
  private pending: Pending | null = null;
  private latestGeneration = -1;
  private lastTime = 0;
  private closed = false;
  private readonly connectionId: string;
  private readonly clientSessionId: string;

  constructor(binding: { connectionId: string; clientSessionId: string }, private readonly clock: OperationalClock = hostOperationalClock) {
    this.connectionId = clientObservationIdentifier.parse(binding.connectionId);
    this.clientSessionId = clientObservationIdentifier.parse(binding.clientSessionId);
  }

  private now(): number {
    this.lastTime = Math.max(this.lastTime, operationalNow(this.clock));
    return this.lastTime; // host clock rollback cannot resurrect an expired record
  }

  private expire(): void {
    const now = this.now();
    if (this.pending && now >= this.pending.forgetAt) this.pending = null;
    if (this.pending?.status === "CLIENT_UNOBSERVABLE" && now >= this.pending.deadline) {
      this.pending.status = "CLIENT_TIMEOUT";
      this.pending.reason = "DEADLINE_ELAPSED";
    }
  }

  /** A sent/delivered projection starts UNOBSERVABLE, never VERIFIED. */
  async expectApply(job: WorldChunkProjectionWorkerJobV2, timeoutMs = 5_000): Promise<ClientVerificationReadback> {
    if (this.closed) throw new Error("CLIENT_OBSERVER_CLOSED");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new Error("CLIENT_TIMEOUT_BOUND_INVALID");
    const suppliedJobId = job.jobId;
    const expected = await createWorldChunkProjectionWorkerJobV2(job);
    if (expected.jobId !== suppliedJobId) throw new Error("CLIENT_EXPECTATION_JOB_INVALID");
    if (this.closed) throw new Error("CLIENT_OBSERVER_CLOSED");
    this.expire();
    if (expected.generation <= this.latestGeneration) {
      if (this.pending?.job.jobId === expected.jobId) return this.read(); // retry cannot extend deadlines
      throw new Error("CLIENT_EXPECTATION_GENERATION_NOT_ADVANCING");
    }
    const now = this.now();
    this.latestGeneration = expected.generation;
    this.pending = {
      job: expected, deadline: deadlineAfter(now, timeoutMs), forgetAt: deadlineAfter(now, 300_000),
      status: "CLIENT_UNOBSERVABLE", reason: "AWAITING_CLIENT_APPLY", clientVerificationHash: null,
    };
    return this.read();
  }

  async observe(input: unknown): Promise<ClientVerificationReadback> {
    if (this.closed) throw new Error("CLIENT_OBSERVER_CLOSED");
    this.expire();
    const pending = this.pending;
    const receipt = await decodeClientVerificationReceipt(input);
    if (receipt.connectionId !== this.connectionId || receipt.clientSessionId !== this.clientSessionId) {
      throw new Error("CLIENT_OBSERVATION_BINDING_MISMATCH");
    }
    if (this.closed) throw new Error("CLIENT_OBSERVER_CLOSED");
    this.expire();
    // A superseded async completion, wrong generation, duplicate or late report
    // cannot overwrite a newer/terminal observation. No gameplay callback exists.
    if (!pending || this.pending !== pending || receipt.appliedGeneration !== pending.job.generation || pending.status !== "CLIENT_UNOBSERVABLE") return this.read();
    const matches = receipt.serverReceiptHash === pending.job.manifest.authorityReceiptHash &&
      receipt.projectionHash === pending.job.manifest.projectionHash;
    pending.status = matches ? "CLIENT_VERIFIED" : "CLIENT_CONTRADICTED";
    pending.reason = matches ? "CLIENT_REPORTED_MATCH" : "CLIENT_REPORTED_MISMATCH";
    pending.clientVerificationHash = receipt.clientVerificationHash;
    return this.read();
  }

  read(): ClientVerificationReadback {
    this.expire();
    return Object.freeze({
      status: this.pending?.status ?? "CLIENT_UNOBSERVABLE",
      generation: this.pending?.job.generation ?? null,
      reason: this.pending?.reason ?? "NO_EXPECTATION",
      clientVerificationHash: this.pending?.clientVerificationHash ?? null,
      trust: "untrusted-client-observation", mutationAuthority: "none",
    });
  }

  /** Transport integration must call on close; there is no reconnect continuity. */
  close(): void { this.pending = null; this.closed = true; }
}
