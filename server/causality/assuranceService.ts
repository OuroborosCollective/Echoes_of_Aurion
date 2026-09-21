import { canonicalSha256 } from "../../shared/aurionCanonicalHash";
import { assuranceKeys, sealAssuranceSnapshot, type AssuranceKey, type AssuranceObservation, type AssuranceObservationStatus, type AssuranceSnapshot } from "../../shared/aurionAssuranceContract";
import { operationalNow } from "../../shared/operationalClock";
import { GLOBAL_WORLD_ID } from "../../shared/worldIdentity";
import { desc } from "drizzle-orm";
import { aurionCrossZoneTransfers, aurionEffectIntents } from "../../drizzle/aurionCausalitySchema";
import { activeProvenance } from "../aurionProvenance";
import { getDb, getGlobalWorldPlan } from "../db";
import { globalAurionEffectJournal } from "../effects/aurionEffectJournal";
import { globalCrossZoneSyncService } from "./crossZoneSynchronizationService";
import { readConfirmedChunkAssetProjection } from "./worldChunkProjectionService";
import { worldCausalRootService } from "./worldCausalRootService";
import { globalCausalPersistence } from "./persistence";
import { AurionTickRecorder } from "./tickRecorder";
import { globalHeadlessCausalOracle } from "./headlessCausalOracle";

export type AssuranceProbe = Readonly<{ key: AssuranceKey; read: () => Promise<Omit<AssuranceObservation, "key">> }>;
const ZONE_ID = "observatory_threshold";
const SHA = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;

function observation(status: AssuranceObservationStatus, summary: string, evidence: unknown = null, sampleCount = 0) {
  return Object.freeze({ status, summary, evidenceHash: evidence === null ? null : canonicalSha256(evidence), sampleCount });
}

function unavailable(summary: string) { return observation("UNVERIFIED", summary); }

export function runtimeAssuranceProbes(): AssuranceProbe[] {
  return [
    { key: "RUNTIME_REVISION", read: async () => REVISION.test(activeProvenance.sourceRevision)
      ? observation("MATCH", "RUNTIME_REVISION_OBSERVED", { sourceRevision: activeProvenance.sourceRevision }, 1)
      : unavailable("RUNTIME_REVISION_UNVERIFIED") },
    { key: "BUILD_INPUT", read: async () => SHA.test(activeProvenance.buildInputDigest)
      ? observation("MATCH", "BUILD_INPUT_OBSERVED", { digest: activeProvenance.buildInputDigest }, 1)
      : unavailable("BUILD_INPUT_UNVERIFIED") },
    { key: "ARTIFACT", read: async () => SHA.test(activeProvenance.artifactDigest)
      ? observation("MATCH", "ARTIFACT_DIGEST_OBSERVED", { digest: activeProvenance.artifactDigest }, 1)
      : unavailable("ARTIFACT_DIGEST_UNVERIFIED") },
    { key: "RUNTIME_IMAGE", read: async () => SHA.test(activeProvenance.runtimeImageDigest)
      ? observation("MATCH", "RUNTIME_IMAGE_DIGEST_OBSERVED", { digest: activeProvenance.runtimeImageDigest }, 1)
      : unavailable("RUNTIME_IMAGE_DIGEST_UNVERIFIED") },
    // These two proofs are verified outside the application by the canonical
    // production workflow. The runtime must not upgrade env metadata to proof.
    { key: "ATTESTATION", read: async () => unavailable("ATTESTATION_EXTERNAL_EVIDENCE_REQUIRED") },
    { key: "SCHEMA", read: async () => unavailable("SCHEMA_EXTERNAL_READBACK_REQUIRED") },
    { key: "RECEIPT_CHAIN", read: async () => {
      const latest = await globalCausalPersistence.getLatestReceipt(ZONE_ID);
      if (!latest) return unavailable("RECEIPT_CHAIN_SAMPLE_MISSING");
      const from = Math.max(1, latest.tick - 49), entries = await globalCausalPersistence.getTicksInRange(ZONE_ID, from, latest.tick);
      if (entries.length !== latest.tick - from + 1) return unavailable("RECEIPT_CHAIN_SAMPLE_INCOMPLETE");
      const result = AurionTickRecorder.verifyReceiptChain(entries.map(value => value.receipt));
      return result.valid
        ? observation("MATCH", "RECEIPT_CHAIN_CONTIGUOUS", { from, to: latest.tick, terminal: latest.receiptHash }, entries.length)
        : observation("CONTRADICTED", "RECEIPT_CHAIN_DIVERGENCE", result, entries.length);
    } },
    { key: "WORLD_ROOT", read: async () => {
      const world = await getGlobalWorldPlan();
      if (world.epoch < 1) return unavailable("WORLD_ROOT_EPOCH_MISSING");
      const result = await worldCausalRootService.replay(GLOBAL_WORLD_ID, world.epoch);
      if (result.status === "MATCH") return observation("MATCH", "WORLD_ROOT_REPLAY_MATCH", result, 1);
      return result.status === "FIRST_DIVERGENCE"
        ? observation("CONTRADICTED", "WORLD_ROOT_DIVERGENCE", result, 1)
        : unavailable("WORLD_ROOT_REPLAY_UNPROVABLE");
    } },
    { key: "REPLAY_SAMPLE", read: async () => {
      const latest = await globalCausalPersistence.getLatestReceipt(ZONE_ID);
      if (!latest) return unavailable("REPLAY_SAMPLE_MISSING");
      const result = await globalHeadlessCausalOracle.replayRange({ zoneId: ZONE_ID, fromTick: latest.tick, toTick: latest.tick });
      if (result.status === "MATCH") return observation("MATCH", "REPLAY_SAMPLE_MATCH", result, 1);
      return result.status === "FIRST_DIVERGENCE"
        ? observation("CONTRADICTED", "REPLAY_SAMPLE_DIVERGENCE", result, 1)
        : unavailable("REPLAY_SAMPLE_UNPROVABLE");
    } },
    { key: "EFFECT_JOURNAL", read: async () => {
      const db = await getDb();
      if (!db) return unavailable("EFFECT_JOURNAL_DATABASE_UNAVAILABLE");
      const rows = await db.select({ effectId: aurionEffectIntents.effectId, deliveryState: aurionEffectIntents.deliveryState })
        .from(aurionEffectIntents).orderBy(desc(aurionEffectIntents.createdAt)).limit(20);
      const evidence = [];
      for (const row of rows) {
        const item = await globalAurionEffectJournal.explain(row.effectId);
        if (!item || !item.receiptChainValid) return observation("CONTRADICTED", "EFFECT_JOURNAL_DIVERGENCE", { effectId: row.effectId }, evidence.length + 1);
        evidence.push({ effectId: row.effectId, deliveryState: row.deliveryState, terminalReceipt: item.receipts.at(-1)?.deliveryReceiptHash ?? null });
      }
      const degraded = rows.some(row => row.deliveryState === "FAILED" || row.deliveryState === "PERMANENT_FAILURE");
      return observation(degraded ? "DEGRADED" : "MATCH", degraded ? "EFFECT_DELIVERY_FAILURE_OBSERVED" : "EFFECT_JOURNAL_MATCH", evidence, rows.length);
    } },
    { key: "CROSS_ZONE", read: async () => {
      const db = await getDb();
      if (!db) return unavailable("CROSS_ZONE_DATABASE_UNAVAILABLE");
      const rows = await db.select({ id: aurionCrossZoneTransfers.id, handoverVersion: aurionCrossZoneTransfers.handoverVersion,
        status: aurionCrossZoneTransfers.status }).from(aurionCrossZoneTransfers)
        .orderBy(desc(aurionCrossZoneTransfers.updatedAt)).limit(20);
      const evidence = [];
      for (const row of rows.filter(value => value.handoverVersion === 2)) {
        const item = await globalCrossZoneSyncService.explainTransfer(row.id);
        if (!item || !item.chainValid || !item.ownerInvariantValid) return observation("CONTRADICTED", "CROSS_ZONE_DIVERGENCE", { transferId: row.id }, evidence.length + 1);
        evidence.push({ transferId: row.id, status: row.status, terminalReceipt: item.receipts.at(-1)?.transferReceiptHash ?? null });
      }
      const degraded = rows.some(row => row.status === "UNPROVABLE" || row.status === "EXPIRED");
      return observation(degraded ? "DEGRADED" : "MATCH", degraded ? "CROSS_ZONE_TERMINATION_OBSERVED" : "CROSS_ZONE_JOURNAL_MATCH", evidence, evidence.length);
    } },
    { key: "PROJECTION", read: async () => {
      const world = await getGlobalWorldPlan();
      if (world.epoch < 1) return unavailable("PROJECTION_EPOCH_MISSING");
      const result = await readConfirmedChunkAssetProjection(GLOBAL_WORLD_ID, world.epoch, { x: 0, z: 0 });
      return result.status === "VERIFIED"
        ? observation("MATCH", "PROJECTION_RECEIPT_VERIFIED", { epoch: result.epoch, manifest: result.manifest }, 1)
        : unavailable("PROJECTION_RECEIPT_UNPROVABLE");
    } },
  ];
}

export class AurionAssuranceService {
  private sequence = 0;
  private readonly history: AssuranceSnapshot[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<AssuranceSnapshot> | null = null;
  private active = false;
  constructor(private readonly probes: readonly AssuranceProbe[], private readonly worldId = GLOBAL_WORLD_ID,
    private readonly now = operationalNow, private readonly maxHistory = 288) {
    const keys = new Set(probes.map(probe => probe.key));
    if (keys.size !== assuranceKeys.length || assuranceKeys.some(key => !keys.has(key)) || maxHistory < 1) throw Error("ASSURANCE_PROBE_SET_INVALID");
  }

  sample(): Promise<AssuranceSnapshot> {
    if (this.running) return this.running;
    this.running = this.collect().finally(() => { this.running = null; });
    return this.running;
  }

  private async collect() {
    const settled = await Promise.all(this.probes.map(async probe => {
      try { return Object.freeze({ key: probe.key, ...await probe.read() }); }
      catch { return Object.freeze({ key: probe.key, ...unavailable(`${probe.key}_PROBE_FAILED`) }); }
    }));
    const snapshot = sealAssuranceSnapshot({ worldId: this.worldId, sequence: ++this.sequence,
      observedAtMs: Math.floor(this.now()), observations: settled });
    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) this.history.shift();
    console.info("[C-Aurion] ASSURANCE", JSON.stringify(snapshot));
    return snapshot;
  }

  start(intervalMs = 300_000) {
    if (this.active || !Number.isSafeInteger(intervalMs) || intervalMs < 10_000) return;
    this.active = true;
    const loop = async () => {
      try { await this.sample(); } catch { console.warn("[C-Aurion] ASSURANCE_SAMPLE_FAILED"); }
      if (!this.active) return;
      this.timer = setTimeout(loop, intervalMs); this.timer.unref();
    };
    this.timer = setTimeout(loop, 0); this.timer.unref();
  }
  stop() { this.active = false; if (this.timer) clearTimeout(this.timer); this.timer = null; }
  latest() { return this.history.at(-1) ?? null; }
  measuredBaseline() {
    const samples = this.history.length, counts = { HEALTHY: 0, DEGRADED: 0, UNVERIFIED: 0, CONTRADICTED: 0 };
    for (const item of this.history) counts[item.status]++;
    return Object.freeze({ protocol: "aurion.assurance-slo-baseline.v1", samples, counts,
      healthyRate: samples ? counts.HEALTHY / samples : null, unexplainedDivergences: counts.CONTRADICTED,
      target: "UNSET_UNTIL_PRODUCTION_BASELINE", mutationAuthority: "none" as const });
  }
}

export const globalAssuranceService = new AurionAssuranceService(runtimeAssuranceProbes());
