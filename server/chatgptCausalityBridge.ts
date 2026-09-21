import fs from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { getDb, canConnectToDatabase } from "./db";
import { globalCausalPersistence } from "./causality/persistence";
import { replayZoneTick } from "./causality/replayZoneTick";
import { isReplayMatch } from "../shared/aurionReplayContract";
import { activeProvenance } from "./aurionProvenance";
import { hashCanonicalZoneState } from "./causality/zoneCanonicalState";
import { aurionCausalCheckpoints } from "../drizzle/aurionCausalitySchema";

/**
 * ChatGPT causality status read model.
 * Strictly read-only, never mutates gameplay.
 */
export async function chatGptCausalityStatus(zoneId?: string) {
  const effectiveZone = zoneId || "solaria-prime";
  const dbConnected = await canConnectToDatabase(1000);
  const latestReceipt = await globalCausalPersistence.getLatestReceipt(effectiveZone);

  return {
    protocol: "aurion.causality-status.v1",
    zoneId: effectiveZone,
    persistence: {
      connected: dbConnected,
      mode: dbConnected ? "mariadb_active" : "memory_preview",
    },
    latestReceipt: latestReceipt ?? null,
    ruleset: "aurion-zone-v3",
    tickHz: 10,
    mutationAuthority: "none",
  };
}

/**
 * Reads an in-memory or persisted receipt. Missing data is marked UNPROVABLE.
 */
export async function chatGptTickReceipt(zoneId: string, tick: number) {
  const entry = await globalCausalPersistence.getRecordedTick(zoneId, tick);
  if (!entry || !entry.receipt) {
    return {
      status: "UNPROVABLE" as const,
      zoneId,
      tick,
      reason: "RECEIPT_NOT_FOUND",
    };
  }

  return {
    status: "VERIFIED" as const,
    zoneId,
    tick,
    receipt: entry.receipt,
  };
}

/**
 * Explains only observed receipt/input/state availability; intermediate receipt-v1 stages remain UNOBSERVABLE.
 */
export async function chatGptTickExplain(zoneId: string, tick: number) {
  const entry = await globalCausalPersistence.getRecordedTick(zoneId, tick);
  if (!entry) {
    return {
      status: "UNPROVABLE" as const,
      zoneId,
      tick,
      reason: "EVIDENCE_NOT_FOUND",
      preState: "UNOBSERVABLE" as const,
      intents: "UNOBSERVABLE" as const,
      receipt: "UNOBSERVABLE" as const,
      intermediateStages: "UNOBSERVABLE" as const,
    };
  }

  return {
    status: "OBSERVED" as const,
    zoneId,
    tick,
    hasReceipt: Boolean(entry.receipt),
    hasPreState: Boolean(entry.preState),
    hasIntents: Boolean(entry.intents),
    receiptHash: entry.receipt?.receiptHash ?? null,
    preStateHash: entry.preState ? hashCanonicalZoneState(entry.preState) : "UNOBSERVABLE",
    intentCount: entry.intents?.length ?? 0,
    intermediateStages: "UNOBSERVABLE" as const,
    note: "Explains only observed receipt/input/state availability; intermediate receipt-v1 stages remain UNOBSERVABLE.",
  };
}

/**
 * Side-effect-free replay returning VERIFIED, CONTRADICTED or UNPROVABLE.
 */
export async function chatGptTickReplay(zoneId: string, tick: number) {
  const entry = await globalCausalPersistence.getRecordedTick(zoneId, tick);
  if (!entry || !entry.receipt || !entry.preState || !entry.intents) {
    return {
      status: "UNPROVABLE" as const,
      verdict: "UNPROVABLE" as const,
      zoneId,
      tick,
      reason: "MISSING_EVIDENCE_FOR_REPLAY",
    };
  }

  const verdict = replayZoneTick({
    preState: entry.preState,
    intents: entry.intents,
    expectedReceipt: entry.receipt,
  });

  const verified = isReplayMatch(verdict);
  return {
    status: verified ? ("VERIFIED" as const) : ("CONTRADICTED" as const),
    verdict,
    zoneId,
    tick,
  };
}

/**
 * Bounded side-effect-free replay; stops at first non-VERIFIED result.
 * Bounded to at most 250 ticks.
 */
export async function chatGptReplayRange(zoneId: string, fromTick: number, toTick: number) {
  const boundedToTick = Math.min(toTick, fromTick + 249);
  const results: Array<{ tick: number; result: Awaited<ReturnType<typeof chatGptTickReplay>> }> = [];
  let stoppedEarly = false;

  for (let t = fromTick; t <= boundedToTick; t++) {
    const res = await chatGptTickReplay(zoneId, t);
    results.push({ tick: t, result: res });
    if (res.status !== "VERIFIED") {
      stoppedEarly = true;
      break;
    }
  }

  return {
    zoneId,
    fromTick,
    toTick: boundedToTick,
    requestedToTick: toTick,
    stoppedEarly,
    results,
  };
}

/**
 * Reads runtime identity together with observation status for every provenance field.
 */
export function chatGptRuntimeIdentity() {
  const prov = activeProvenance;
  return {
    runtimeIdentity: {
      commit: { value: prov.commit, status: prov.commit ? "OBSERVED" : "UNVERIFIED" },
      sourceRevision: { value: prov.sourceRevision, status: prov.sourceRevision ? "OBSERVED" : "UNVERIFIED" },
      dirty: { value: prov.dirty, status: "OBSERVED" },
      buildTimestamp: { value: prov.buildTimestamp, status: prov.buildTimestamp ? "OBSERVED" : "UNVERIFIED" },
      buildInputDigest: { value: prov.buildInputDigest, status: prov.buildInputDigest ? "OBSERVED" : "UNVERIFIED" },
      artifactDigest: { value: prov.artifactDigest, status: prov.artifactDigest ? "OBSERVED" : "UNVERIFIED" },
      runtimeImageDigest: { value: prov.runtimeImageDigest, status: prov.runtimeImageDigest ? "OBSERVED" : "UNVERIFIED" },
      runtimeHash: { value: prov.runtimeHash, status: prov.runtimeHash ? "OBSERVED" : "UNVERIFIED" },
      authority: { value: prov.authority, status: "OBSERVED" },
      rulesets: Object.fromEntries(
        Object.entries(prov.rulesets ?? {}).map(([k, v]) => [k, { value: v, status: v ? "OBSERVED" : "UNVERIFIED" }])
      ),
    },
    mutationAuthority: "none" as const,
  };
}

/**
 * Returns a reconciled checkpoint candidate only. mutationAuthority is always none.
 */
export async function chatGptRecoveryPlan(zoneId: string) {
  const db = await getDb();
  let candidate = null;

  if (db) {
    const results = await db
      .select()
      .from(aurionCausalCheckpoints)
      .where(and(eq(aurionCausalCheckpoints.zoneId, zoneId), eq(aurionCausalCheckpoints.reconciled, 1)))
      .orderBy(desc(aurionCausalCheckpoints.tick))
      .limit(1);

    if (results.length > 0) {
      candidate = {
        id: results[0].id,
        tick: results[0].tick,
        snapshotHash: results[0].snapshotHash,
        reconciledAt: results[0].reconciledAt,
      };
    }
  }

  return {
    zoneId,
    mutationAuthority: "none" as const,
    checkpointCandidate: candidate,
    status: candidate ? "RECONCILED_CANDIDATE_OBSERVED" : "NO_RECONCILED_CHECKPOINT_AVAILABLE",
  };
}

/**
 * Reads WASD/AX1 donor retirement evidence without granting donor authority.
 */
export async function chatGptDonorLedger() {
  const ledgerPath = path.resolve(process.cwd(), "architecture/donor-ledger.json");
  if (!fs.existsSync(ledgerPath)) {
    return { error: "DONOR_LEDGER_NOT_FOUND", donorAuthority: "none" as const };
  }

  const raw = fs.readFileSync(ledgerPath, "utf8");
  const parsed = JSON.parse(raw);

  return {
    donorAuthority: "none" as const,
    schemaVersion: parsed.schemaVersion,
    donors: parsed.donors,
    capabilityCount: Array.isArray(parsed.capabilities) ? parsed.capabilities.length : 0,
    surfaceCount: Array.isArray(parsed.surfaceInventory) ? parsed.surfaceInventory.length : 0,
    capabilities: parsed.capabilities,
  };
}

/**
 * Reads one donor capability record; ledger metadata is not automatically upgraded to VERIFIED.
 */
export async function chatGptDonorCapability(capabilityId: string) {
  const ledgerPath = path.resolve(process.cwd(), "architecture/donor-ledger.json");
  if (!fs.existsSync(ledgerPath)) {
    return { found: false, error: "DONOR_LEDGER_NOT_FOUND", capabilityId, donorAuthority: "none" as const };
  }

  const raw = fs.readFileSync(ledgerPath, "utf8");
  const parsed = JSON.parse(raw);
  const cap = parsed.capabilities?.find((c: any) => c.capabilityId === capabilityId);

  if (!cap) {
    return {
      found: false,
      capabilityId,
      error: "CAPABILITY_NOT_FOUND",
      donorAuthority: "none" as const,
    };
  }

  return {
    found: true,
    capabilityId,
    donorAuthority: "none" as const,
    evidenceStatus: cap.status ?? "OBSERVED",
    capability: cap,
  };
}
