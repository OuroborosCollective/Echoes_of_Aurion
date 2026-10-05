import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { globalHeadlessCausalOracle } from "../server/causality/headlessCausalOracle";
import { globalCausalPersistence } from "../server/causality/persistence";

const zoneId = "observatory_threshold";
const revision = process.env.AURION_RELEASE_SHA ?? "";
const evidenceDir = process.env.AURION_EVIDENCE_DIR ?? ".aurion-evidence/starter-village-pilot";
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error("STARTER_REPLAY_DIAGNOSTIC_REVISION_REQUIRED");

const latest = await globalCausalPersistence.getLatestReceipt(zoneId);
if (!latest) throw new Error("STARTER_REPLAY_DIAGNOSTIC_RECEIPT_MISSING");
const checkpoint = await globalCausalPersistence.getCheckpointAtOrBefore(zoneId, latest.tick - 1);
const loadFrom = checkpoint ? (checkpoint.tick > 0 ? checkpoint.tick : 1) : latest.tick;
const entries = await globalCausalPersistence.getTicksInRange(zoneId, loadFrom, latest.tick);
const result = await globalHeadlessCausalOracle.replayRange({
  zoneId,
  fromTick: latest.tick,
  toTick: latest.tick,
});

const evidence = {
  schema: "aurion.starter-village-replay-diagnostic.v1",
  revision,
  zoneId,
  latestReceipt: {
    tick: latest.tick,
    sourceRevision: latest.sourceRevision,
    rulesetVersion: latest.rulesetVersion,
    preStateHash: latest.preStateHash,
    orderedIntentHash: latest.orderedIntentHash,
    transitionHash: latest.transitionHash,
    rngRootHash: latest.rngRootHash,
    postStateHash: latest.postStateHash,
    previousReceiptHash: latest.previousReceiptHash,
    receiptHash: latest.receiptHash,
  },
  checkpoint: checkpoint ? {
    tick: checkpoint.tick,
    worldId: checkpoint.worldId,
    zoneId: checkpoint.zoneId,
    snapshotHash: checkpoint.snapshotHash,
    stateRuleset: checkpoint.state.ruleset,
    stateTick: checkpoint.state.tick,
  } : null,
  persistedSlice: entries.map(entry => ({
    tick: entry.receipt.tick,
    sourceRevision: entry.receipt.sourceRevision,
    rulesetVersion: entry.receipt.rulesetVersion,
    preStateHash: entry.receipt.preStateHash,
    orderedIntentHash: entry.receipt.orderedIntentHash,
    postStateHash: entry.receipt.postStateHash,
    receiptHash: entry.receipt.receiptHash,
    intentCount: entry.intents?.length ?? null,
  })),
  oracle: result,
  mutationAuthority: "none",
};

await mkdir(evidenceDir, { recursive: true });
const file = path.join(evidenceDir, `replay-diagnostic-${revision}.json`);
await writeFile(file, JSON.stringify(evidence, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(evidence));
process.exit(0);
