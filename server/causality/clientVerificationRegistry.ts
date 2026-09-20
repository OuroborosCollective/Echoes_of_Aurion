import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { decodeClientVerificationReceipt } from "../../shared/aurionClientVerificationContract";
import { createWorldChunkProjectionWorkerJobV2, type WorldChunkProjectionManifestV2 } from "../../shared/worldChunkProjectionV2";
import { AurionClientVerificationService } from "./clientVerificationService";

const RETENTION_MS = 300_000;
type Session = {
  userId: number; connectionId: string; clientSessionId: string; retiredGeneration: number; latestGeneration: number;
  records: Map<number, { service: AurionClientVerificationService; timer: ReturnType<typeof setTimeout> }>;
};

/** Ephemeral diagnostics. Only the authenticated socket lifecycle can open a binding. */
export class ClientVerificationRegistry {
  private readonly sessions = new Map<string, Session>();

  open(userId: number, connectionId: string): void {
    if (this.sessions.has(connectionId) || this.sessions.size >= 128) return;
    this.sessions.set(connectionId, { userId, connectionId, clientSessionId: randomUUID(), retiredGeneration: -1, latestGeneration: -1, records: new Map() });
  }

  private owned(userId: number, connectionId: string, clientSessionId?: string): Session {
    const session = this.sessions.get(connectionId);
    if (!session || session.userId !== userId || (clientSessionId !== undefined && session.clientSessionId !== clientSessionId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: "CLIENT_OBSERVATION_BINDING_UNAVAILABLE" });
    }
    return session;
  }

  requireOwner(userId: number, connectionId: string): void { this.owned(userId, connectionId); }

  private retire(session: Session, generation: number): void {
    const record = session.records.get(generation);
    if (!record) return;
    clearTimeout(record.timer); record.service.close(); session.records.delete(generation);
    session.retiredGeneration = Math.max(session.retiredGeneration, generation);
  }

  async expect(userId: number, connectionId: string, manifest: WorldChunkProjectionManifestV2, generation: number) {
    const session = this.owned(userId, connectionId);
    const job = await createWorldChunkProjectionWorkerJobV2({ manifest, generation });
    if (this.owned(userId, connectionId) !== session) throw new Error("CLIENT_OBSERVATION_RETIRED");
    if (generation <= session.retiredGeneration) throw new Error("CLIENT_EXPECTATION_GENERATION_RETIRED");
    let record = session.records.get(generation);
    if (!record) {
      if (session.records.size >= 16) this.retire(session, Math.min(...session.records.keys()));
      if (generation <= session.retiredGeneration) throw new Error("CLIENT_EXPECTATION_GENERATION_RETIRED");
      const service = new AurionClientVerificationService(session);
      const timer = setTimeout(() => this.retire(session, generation), RETENTION_MS);
      timer.unref(); record = { service, timer }; session.records.set(generation, record);
    }
    await record.service.expectApply(job, 15_000);
    if (this.owned(userId, connectionId) !== session) throw new Error("CLIENT_OBSERVATION_RETIRED");
    session.latestGeneration = Math.max(session.latestGeneration, generation);
    return { connectionId, clientSessionId: session.clientSessionId };
  }

  async observe(userId: number, input: unknown) {
    const receipt = await decodeClientVerificationReceipt(input);
    const session = this.owned(userId, receipt.connectionId, receipt.clientSessionId);
    const record = session.records.get(receipt.appliedGeneration);
    if (record) await record.service.observe(receipt);
    return this.read(userId, receipt.connectionId, receipt.clientSessionId, receipt.appliedGeneration);
  }

  read(userId: number, connectionId: string, clientSessionId: string, generation?: number) {
    const session = this.owned(userId, connectionId, clientSessionId);
    const selected = generation ?? session.latestGeneration;
    const record = selected === undefined ? undefined : session.records.get(selected);
    const state = record?.service.read() ?? {
      status: "CLIENT_UNOBSERVABLE" as const, generation: null, reason: "NO_EXPECTATION" as const,
      clientVerificationHash: null, trust: "untrusted-client-observation" as const, mutationAuthority: "none" as const,
    };
    return Object.freeze({ connectionId, clientSessionId, ...state });
  }

  close(connectionId: string): void {
    const session = this.sessions.get(connectionId);
    if (!session) return;
    for (const generation of session.records.keys()) this.retire(session, generation);
    this.sessions.delete(connectionId);
  }
}

export const clientVerificationRegistry = new ClientVerificationRegistry();
