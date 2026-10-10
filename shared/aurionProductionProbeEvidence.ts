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

export type ProbePersistenceReadback = Readonly<{
  joinTick: number;
  leaveTick: number;
  receipts: readonly AurionCausalTickReceipt[];
  membership: readonly { tick: number; type: "presence_join" | "presence_leave"; userId: number; intentHash: string }[];
}>;

/** Only called after full private DB evidence validation; never exports other actors' inputs. */
export function projectProbePersistenceReadback(evidence: ProbePersistenceEvidence): ProbePersistenceReadback {
  return { joinTick: evidence.joinTick, leaveTick: evidence.leaveTick,
    receipts: evidence.ticks.map(entry => entry.receipt),
    membership: evidence.ticks.flatMap(entry => entry.intents
      .filter(intent => intent.entityId === `player:${AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID}`)
      .map(intent => ({ tick: entry.receipt.tick, type: intent.type as "presence_join" | "presence_leave",
        userId: AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID, intentHash: canonicalSha256(intent) }))),
  };
}

/** Runner verifies the redacted server DB readback; private input validation stays server-side. */
export function requireProbePersistenceReadback(
  evidence: ProbePersistenceReadback, revision: string, zoneId: string, welcomeTick: number, snapshotTick: number,
): void {
  if (!evidence || !Number.isSafeInteger(welcomeTick) || !Number.isSafeInteger(snapshotTick)
    || evidence.joinTick !== welcomeTick + 1 || !Number.isSafeInteger(evidence.leaveTick)
    || evidence.leaveTick <= snapshotTick || snapshotTick < evidence.joinTick
    || !Array.isArray(evidence.receipts) || evidence.receipts.length > 256
    || evidence.receipts.length !== evidence.leaveTick - evidence.joinTick + 1
    || !Array.isArray(evidence.membership) || evidence.membership.length !== 2) throw new Error("PROBE_PERSISTED_MEMBERSHIP_INVALID");
  evidence.receipts.forEach((receipt, index) => {
    const previous = evidence.receipts[index - 1];
    if (!receipt || receipt.worldId !== GLOBAL_WORLD_ID || receipt.zoneId !== zoneId || receipt.sourceRevision !== revision
      || receipt.tick !== evidence.joinTick + index || computeReceiptHash(receipt) !== receipt.receiptHash
      || (previous && (receipt.previousReceiptHash !== previous.receiptHash || receipt.preStateHash !== previous.postStateHash))) {
      throw new Error("PROBE_PERSISTED_MEMBERSHIP_INVALID");
    }
  });
  evidence.membership.forEach((item, index) => {
    if (item.userId !== AURION_PRODUCTION_GAMEPLAY_PROBE_USER_ID || !/^sha256:[a-f0-9]{64}$/.test(item.intentHash)
      || item.type !== (index === 0 ? "presence_join" : "presence_leave")
      || item.tick !== (index === 0 ? evidence.joinTick : evidence.leaveTick)) throw new Error("PROBE_PERSISTED_MEMBERSHIP_INVALID");
  });
}

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
