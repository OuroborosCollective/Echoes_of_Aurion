import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { computeReceiptHash, type AurionCausalTickReceipt } from "../shared/aurionCausalTickContract";
import { activeProvenance } from "./aurionProvenance";
import { globalCausalPersistence } from "./causality/persistence";
import { globalCausalRecoveryService } from "./causality/causalRecoveryService";
import { globalReadbackService } from "./causality/readbackService";
import { replayZoneTick } from "./causality/replayZoneTick";
import { globalTickRecorder } from "./causality/tickRecorder";

export type EvidenceTruthStatus = "VERIFIED" | "CONTRADICTED" | "UNPROVABLE" | "UNOBSERVABLE" | "UNVERIFIED";

function truthStatusForReplay(status: "MATCH" | "FIRST_DIVERGENCE" | "UNPROVABLE"): EvidenceTruthStatus {
  return status === "MATCH" ? "VERIFIED" : status === "FIRST_DIVERGENCE" ? "CONTRADICTED" : "UNPROVABLE";
}

async function recordedEntry(zoneId: string, tick: number) {
  return globalTickRecorder.getEntry(zoneId, tick) ?? await globalCausalPersistence.getRecordedTick(zoneId, tick);
}

function receiptTruthStatus(receipt: AurionCausalTickReceipt): EvidenceTruthStatus {
  try {
    return computeReceiptHash(receipt) === receipt.receiptHash ? "VERIFIED" : "CONTRADICTED";
  } catch {
    return "UNVERIFIED";
  }
}

export async function chatGptCausalityStatus(zoneId?: string) {
  const chain = globalTickRecorder.verifyReceiptChain(zoneId);
  const readback = globalReadbackService.getStatus();
  const persistence = globalTickRecorder.getPersistenceStatus();
  const inMemoryReceiptCount = globalTickRecorder.getReceipts(zoneId).length;
  let truthStatus: EvidenceTruthStatus;
  if (!chain.valid || readback.divergences > 0) truthStatus = "CONTRADICTED";
  else if (inMemoryReceiptCount === 0) truthStatus = "UNPROVABLE";
  else if (persistence.failures > 0 || readback.verifiedTicks === 0 || readback.unprovable > 0) truthStatus = "UNVERIFIED";
  else truthStatus = "VERIFIED";

  return Object.freeze({
    protocol: "aurion.chatgpt.causality.v1",
    mutationAuthority: "none" as const,
    truthStatus,
    zoneId: zoneId ?? null,
    inMemoryReceiptCount,
    chainIntegrity: chain,
    persistence,
    readback: {
      observedTicks: readback.observedTicks,
      verifiedTicks: readback.verifiedTicks,
      divergences: readback.divergences,
      unprovable: readback.unprovable,
    },
    globalReconciliation: "UNOBSERVABLE_FROM_THIS_INTERFACE" as const,
  });
}

export async function chatGptTickReceipt(zoneId: string, tick: number) {
  const entry = await recordedEntry(zoneId, tick);
  if (!entry) return Object.freeze({ protocol: "aurion.chatgpt.tick-receipt.v1", mutationAuthority: "none" as const, truthStatus: "UNPROVABLE" as const, zoneId, tick, reason: "RECORDED_TICK_MISSING", receipt: null });
  return Object.freeze({ protocol: "aurion.chatgpt.tick-receipt.v1", mutationAuthority: "none" as const, truthStatus: receiptTruthStatus(entry.receipt), zoneId, tick, receipt: entry.receipt });
}

export async function chatGptTickExplain(zoneId: string, tick: number) {
  const entry = await recordedEntry(zoneId, tick);
  if (!entry) return Object.freeze({ protocol: "aurion.chatgpt.tick-explain.v1", mutationAuthority: "none" as const, truthStatus: "UNPROVABLE" as const, zoneId, tick, reason: "RECORDED_TICK_MISSING" });
  return Object.freeze({
    protocol: "aurion.chatgpt.tick-explain.v1",
    mutationAuthority: "none" as const,
    truthStatus: receiptTruthStatus(entry.receipt),
    zoneId,
    tick,
    receipt: entry.receipt,
    intents: entry.intents ?? null,
    preStateAvailability: entry.preState ? "OBSERVED" : "UNOBSERVABLE",
    postStateAvailability: entry.postState ? "OBSERVED" : "UNOBSERVABLE",
    intermediateStages: "UNOBSERVABLE_IN_RECEIPT_V1" as const,
  });
}

export async function chatGptTickReplay(zoneId: string, tick: number) {
  const entry = await recordedEntry(zoneId, tick);
  if (!entry) return Object.freeze({ protocol: "aurion.chatgpt.replay.v1", mutationAuthority: "none" as const, truthStatus: "UNPROVABLE" as const, zoneId, tick, reason: "RECORDED_TICK_MISSING" });
  if (!entry.preState) return Object.freeze({ protocol: "aurion.chatgpt.replay.v1", mutationAuthority: "none" as const, truthStatus: "UNPROVABLE" as const, zoneId, tick, reason: "REPLAY_PRE_STATE_UNAVAILABLE", receipt: entry.receipt });
  if (!entry.intents) return Object.freeze({ protocol: "aurion.chatgpt.replay.v1", mutationAuthority: "none" as const, truthStatus: "UNPROVABLE" as const, zoneId, tick, reason: "RECORDED_INTENTS_MISSING", receipt: entry.receipt });
  const verdict = replayZoneTick({ preState: entry.preState, intents: entry.intents, expectedReceipt: entry.receipt });
  return Object.freeze({ protocol: "aurion.chatgpt.replay.v1", mutationAuthority: "none" as const, truthStatus: truthStatusForReplay(verdict.status), zoneId, tick, verdict });
}

export async function chatGptReplayRange(zoneId: string, fromTick: number, toTick: number) {
  if (!Number.isSafeInteger(fromTick) || !Number.isSafeInteger(toTick) || fromTick < 0 || toTick < fromTick || toTick - fromTick > 250) throw new Error("CHATGPT_REPLAY_RANGE_INVALID");
  const results = [];
  for (let tick = fromTick; tick <= toTick; tick += 1) {
    const result = await chatGptTickReplay(zoneId, tick);
    results.push(result);
    if (result.truthStatus !== "VERIFIED") break;
  }
  return Object.freeze({ protocol: "aurion.chatgpt.replay-range.v1", mutationAuthority: "none" as const, zoneId, fromTick, toTick, results });
}

export function chatGptRuntimeIdentity() {
  return Object.freeze({ protocol: "aurion.chatgpt.runtime-identity.v1", mutationAuthority: "none" as const, ...activeProvenance });
}

export async function chatGptRecoveryPlan(zoneId: string) {
  return globalCausalRecoveryService.planRecovery(zoneId);
}

export async function chatGptDonorLedger() {
  const ledger = JSON.parse(await readFile(resolve(process.cwd(), "architecture/donor-ledger.json"), "utf8"));
  return Object.freeze({ protocol: "aurion.chatgpt.donor-ledger.v1", mutationAuthority: "none" as const, truthStatus: "UNVERIFIED" as const, ledger });
}

export async function chatGptDonorCapability(capabilityId: string) {
  const result = await chatGptDonorLedger();
  const capabilities = Array.isArray((result.ledger as any)?.capabilities) ? (result.ledger as any).capabilities : [];
  const capability = capabilities.find((candidate: any) => candidate?.id === capabilityId);
  return capability
    ? Object.freeze({ protocol: "aurion.chatgpt.donor-capability.v1", mutationAuthority: "none" as const, truthStatus: "UNVERIFIED" as const, capability })
    : Object.freeze({ protocol: "aurion.chatgpt.donor-capability.v1", mutationAuthority: "none" as const, truthStatus: "UNPROVABLE" as const, capabilityId, reason: "CAPABILITY_NOT_FOUND" });
}
