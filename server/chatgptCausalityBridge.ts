import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { activeProvenance } from "./aurionProvenance";
import { globalCausalPersistence } from "./causality/persistence";
import { globalCausalRecoveryService } from "./causality/causalRecoveryService";
import { globalReadbackService } from "./causality/readbackService";
import { replayZoneTick } from "./causality/replayZoneTick";
import { globalStateReconciliationService } from "./causality/globalStateReconciliationService";
import { globalTickRecorder } from "./causality/tickRecorder";

export type EvidenceTruthStatus = "VERIFIED" | "CONTRADICTED" | "UNPROVABLE" | "UNOBSERVABLE" | "UNVERIFIED";

function truthStatusForReplay(status: "MATCH" | "FIRST_DIVERGENCE" | "UNPROVABLE"): EvidenceTruthStatus {
  return status === "MATCH" ? "VERIFIED" : status === "FIRST_DIVERGENCE" ? "CONTRADICTED" : "UNPROVABLE";
}

async function recordedEntry(zoneId: string, tick: number) {
  return globalTickRecorder.getEntry(zoneId, tick) ?? await globalCausalPersistence.getRecordedTick(zoneId, tick);
}

export async function chatGptCausalityStatus(zoneId?: string) {
  const chain = globalTickRecorder.verifyReceiptChain(zoneId);
  const readback = globalReadbackService.getStatus();
  const persistence = globalTickRecorder.getPersistenceStatus();
  return Object.freeze({
    protocol: "aurion.chatgpt.causality.v1",
    mutationAuthority: "none",
    truthStatus: chain.valid && readback.divergences === 0 && persistence.failures === 0 ? "VERIFIED" as const : "UNVERIFIED" as const,
    zoneId: zoneId ?? null,
    inMemoryReceiptCount: globalTickRecorder.getReceipts(zoneId).length,
    chainIntegrity: chain,
    persistence,
    readback: {
      observedTicks: readback.observedTicks,
      verifiedTicks: readback.verifiedTicks,
      divergences: readback.divergences,
      unprovable: readback.unprovable,
    },
    globalReconciliation: globalStateReconciliationService.getStatus(),
  });
}

export async function chatGptTickReceipt(zoneId: string, tick: number) {
  const entry = await recordedEntry(zoneId, tick);
  if (!entry) return Object.freeze({ protocol: "aurion.chatgpt.tick-receipt.v1", mutationAuthority: "none", truthStatus: "UNPROVABLE" as const, zoneId, tick, reason: "RECORDED_TICK_MISSING", receipt: null });
  return Object.freeze({ protocol: "aurion.chatgpt.tick-receipt.v1", mutationAuthority: "none", truthStatus: "VERIFIED" as const, zoneId, tick, receipt: entry.receipt });
}

export async function chatGptTickExplain(zoneId: string, tick: number) {
  const entry = await recordedEntry(zoneId, tick);
  if (!entry) return Object.freeze({ protocol: "aurion.chatgpt.tick-explain.v1", mutationAuthority: "none", truthStatus: "UNPROVABLE" as const, zoneId, tick, reason: "RECORDED_TICK_MISSING" });
  return Object.freeze({
    protocol: "aurion.chatgpt.tick-explain.v1",
    mutationAuthority: "none",
    truthStatus: "VERIFIED" as const,
    zoneId,
    tick,
    receipt: entry.receipt,
    intents: entry.intents ?? null,
    preStateAvailability: entry.preState ? "OBSERVED" : "UNOBSERVABLE",
    postStateAvailability: entry.postState ? "OBSERVED" : "UNOBSERVABLE",
    intermediateStages: "UNOBSERVABLE_IN_RECEIPT_V1",
  });
}

export async function chatGptTickReplay(zoneId: string, tick: number) {
  const entry = await recordedEntry(zoneId, tick);
  if (!entry) return Object.freeze({ protocol: "aurion.chatgpt.replay.v1", mutationAuthority: "none", truthStatus: "UNPROVABLE" as const, zoneId, tick, reason: "RECORDED_TICK_MISSING" });
  if (!entry.preState) return Object.freeze({ protocol: "aurion.chatgpt.replay.v1", mutationAuthority: "none", truthStatus: "UNPROVABLE" as const, zoneId, tick, reason: "REPLAY_PRE_STATE_UNAVAILABLE", receipt: entry.receipt });
  if (!entry.intents) return Object.freeze({ protocol: "aurion.chatgpt.replay.v1", mutationAuthority: "none", truthStatus: "UNPROVABLE" as const, zoneId, tick, reason: "RECORDED_INTENTS_MISSING", receipt: entry.receipt });
  const verdict = replayZoneTick({ preState: entry.preState, intents: entry.intents, expectedReceipt: entry.receipt });
  return Object.freeze({ protocol: "aurion.chatgpt.replay.v1", mutationAuthority: "none", truthStatus: truthStatusForReplay(verdict.status), zoneId, tick, verdict });
}

export async function chatGptReplayRange(zoneId: string, fromTick: number, toTick: number) {
  if (!Number.isSafeInteger(fromTick) || !Number.isSafeInteger(toTick) || fromTick < 0 || toTick < fromTick || toTick - fromTick > 250) throw new Error("CHATGPT_REPLAY_RANGE_INVALID");
  const results = [];
  for (let tick = fromTick; tick <= toTick; tick += 1) {
    const result = await chatGptTickReplay(zoneId, tick);
    results.push(result);
    if (result.truthStatus !== "VERIFIED") break;
  }
  return Object.freeze({ protocol: "aurion.chatgpt.replay-range.v1", mutationAuthority: "none", zoneId, fromTick, toTick, results });
}

export function chatGptRuntimeIdentity() {
  return Object.freeze({
    protocol: "aurion.chatgpt.runtime-identity.v1",
    mutationAuthority: "none",
    ...activeProvenance,
  });
}

export async function chatGptRecoveryPlan(zoneId: string) {
  return globalCausalRecoveryService.planRecovery(zoneId);
}

export async function chatGptDonorLedger() {
  const ledger = JSON.parse(await readFile(resolve(process.cwd(), "architecture/donor-ledger.json"), "utf8"));
  return Object.freeze({ protocol: "aurion.chatgpt.donor-ledger.v1", mutationAuthority: "none", ledger });
}

export async function chatGptDonorCapability(capabilityId: string) {
  const result = await chatGptDonorLedger();
  const capabilities = Array.isArray((result.ledger as any)?.capabilities) ? (result.ledger as any).capabilities : [];
  const capability = capabilities.find((candidate: any) => candidate?.id === capabilityId);
  return capability
    ? Object.freeze({ protocol: "aurion.chatgpt.donor-capability.v1", mutationAuthority: "none", truthStatus: "UNVERIFIED" as const, capability })
    : Object.freeze({ protocol: "aurion.chatgpt.donor-capability.v1", mutationAuthority: "none", truthStatus: "UNPROVABLE" as const, capabilityId, reason: "CAPABILITY_NOT_FOUND" });
}
