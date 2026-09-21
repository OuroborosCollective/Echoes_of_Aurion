import {
  type ClientVerificationReceipt,
  type ClientVerificationStatus,
  type ClientVerificationReadback,
} from "../../shared/aurionClientVerificationContract";

export interface ClientVerificationBinding {
  connectionId: string;
  clientSessionId: string;
}

export interface ClientVerificationClock {
  now(): number;
}

export interface ExpectedApplyJob {
  generation: number;
  manifest: {
    authorityReceiptHash: string;
    projectionHash: string;
  };
}

export class AurionClientVerificationService {
  private currentExpectedJob: ExpectedApplyJob | null = null;
  private currentStatus: ClientVerificationStatus = "CLIENT_UNOBSERVABLE";
  private currentGeneration: number | undefined = undefined;

  constructor(
    private readonly binding: ClientVerificationBinding,
    private readonly clock: ClientVerificationClock = { now: () => Date.now() }
  ) {}

  async expectApply(job: ExpectedApplyJob): Promise<void> {
    this.currentExpectedJob = job;
    this.currentGeneration = job.generation;
    this.currentStatus = "CLIENT_UNOBSERVABLE";
  }

  async observe(receipt: ClientVerificationReceipt): Promise<ClientVerificationReadback> {
    if (!this.currentExpectedJob) {
      this.currentStatus = "CLIENT_UNOBSERVABLE";
      return {
        status: "CLIENT_UNOBSERVABLE",
        trust: "untrusted-client-observation",
        mutationAuthority: "none",
        reason: "NO_EXPECTED_JOB",
      };
    }

    if (receipt.connectionId !== this.binding.connectionId || receipt.clientSessionId !== this.binding.clientSessionId) {
      return {
        status: "CLIENT_UNOBSERVABLE",
        trust: "untrusted-client-observation",
        mutationAuthority: "none",
        reason: "BINDING_MISMATCH",
      };
    }

    const matchesHash =
      receipt.projectionHash === this.currentExpectedJob.manifest.projectionHash &&
      receipt.serverReceiptHash === this.currentExpectedJob.manifest.authorityReceiptHash;

    if (matchesHash) {
      this.currentStatus = "CLIENT_VERIFIED";
    } else {
      this.currentStatus = "CLIENT_CONTRADICTED";
    }

    return {
      status: this.currentStatus,
      trust: "untrusted-client-observation",
      mutationAuthority: "none",
      generation: this.currentGeneration,
    };
  }

  getStatus(): ClientVerificationReadback {
    return {
      status: this.currentStatus,
      trust: "untrusted-client-observation",
      mutationAuthority: "none",
      generation: this.currentGeneration,
      connectionId: this.binding.connectionId,
      clientSessionId: this.binding.clientSessionId,
    };
  }

  close(): void {
    this.currentExpectedJob = null;
  }
}
