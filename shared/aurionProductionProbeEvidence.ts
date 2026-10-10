import { canonicalSha256 } from "./aurionCanonicalHash";
import { computeReceiptHash, type AurionCausalTickReceipt } from "./aurionCausalTickContract";
import { GLOBAL_WORLD_ID } from "./worldIdentity";

/** Reserved server-owned observer; never a playable account. */
export const AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID = 2_147_483_647;
export type ProbeTickEvidence = Readonly<{
  receipt: AurionCausalTickReceipt;
  intents: readonly Record<string, unknown>[];
}>;
export type ProbePersistenceEvidence = Readonly<{
  joinTick: number;
  leaveTick: number;
  ticks: readonly ProbeTickEvidence[];
}>;

/** Independently usable by the runner; no connection identifiers are exported. */
export function requireProbePersistenceEvidence(
  evidence: ProbePersistenceEvidence, revision: string, zoneId: string, welcomeTick: number, snapshotTick: number,
): void {
  const fail = () => { throw new Error("PROBE_PERSISTED_MEMBERSHIP_INVALID"); };
  if (!evidence || !Number.isSafeInteger(evidence.joinTick) || evidence.joinTick !== welcomeTick + 1
    || !Number.isSafeInteger(evidence.leaveTick) || evidence.leaveTick <= snapshotTick
    || snapshotTick < evidence.joinTick || !Array.isArray(evidence.ticks)
    || evidence.ticks.length !== evidence.leaveTick - evidence.joinTick + 1
    || evidence.ticks.length > 256) return fail();
  for (let index = 0; index < evidence.ticks.length; index++) {
    const entry = evidence.ticks[index], receipt = entry?.receipt;
    if (!receipt || receipt.worldId !== GLOBAL_WORLD_ID || receipt.zoneId !== zoneId || receipt.sourceRevision !== revision
      || receipt.tick !== evidence.joinTick + index || computeReceiptHash(receipt) !== receipt.receiptHash
      || !Array.isArray(entry.intents) || canonicalSha256(entry.intents) !== receipt.orderedIntentHash) return fail();
    const previous = evidence.ticks[index - 1]?.receipt;
    if (previous && (receipt.previousReceiptHash !== previous.receiptHash || receipt.preStateHash !== previous.postStateHash)) return fail();
  }
  const actor = `player:${AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID}`;
  const membership = evidence.ticks.flatMap(entry => entry.intents
    .filter((intent: Record<string, unknown>) => intent.entityId === actor)
    .map((intent: Record<string, unknown>) => ({ tick: entry.receipt.tick, intent })));
  if (membership.length !== 2
    || membership[0].tick !== evidence.joinTick || membership[0].intent.type !== "presence_join"
    || membership[1].tick !== evidence.leaveTick || membership[1].intent.type !== "presence_leave"
    || membership.some(({ intent }) => intent.userId !== AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID)) return fail();
}
