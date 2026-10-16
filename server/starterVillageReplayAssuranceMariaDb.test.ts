import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  aurionCausalCheckpoints,
  aurionCausalTickReceipts,
  aurionReplayRuns,
} from "../drizzle/aurionCausalitySchema";
import type { AurionZoneIntent } from "../shared/aurionZoneIntentContract";
import { getDb } from "./db";
import { AurionHeadlessCausalOracle } from "./causality/headlessCausalOracle";
import { MariaDBCausalPersistenceAdapter } from "./causality/persistence";
import type { RecordedTickEntry } from "./causality/tickRecorder";

const enabled =
  process.env.AURION_STARTER_REPLAY_ASSURANCE_E2E === "1" &&
  Boolean(process.env.DATABASE_URL);
const suite = enabled ? describe : describe.skip;
const ZONE = "observatory_threshold";
const revision = process.env.AURION_RELEASE_SHA ?? "";
const evidenceDir = process.env.AURION_EVIDENCE_DIR ?? ".aurion-evidence/starter-village-pilot";

async function counts() {
  const db = await getDb();
  if (!db) throw new Error("STARTER_REPLAY_DATABASE_REQUIRED");
  const [receipts] = await db.select({ value: sql<number>`count(*)` }).from(aurionCausalTickReceipts)
    .where(eq(aurionCausalTickReceipts.zoneId, ZONE));
  const [checkpoints] = await db.select({ value: sql<number>`count(*)` }).from(aurionCausalCheckpoints)
    .where(eq(aurionCausalCheckpoints.zoneId, ZONE));
  const [replays] = await db.select({ value: sql<number>`count(*)` }).from(aurionReplayRuns)
    .where(eq(aurionReplayRuns.zoneId, ZONE));
  return {
    receipts: Number(receipts?.value ?? 0),
    checkpoints: Number(checkpoints?.value ?? 0),
    replays: Number(replays?.value ?? 0),
  };
}

suite("starter village replay assurance after application restart", () => {
  it("matches real persisted truth and localizes controlled divergence without writes", async () => {
    expect(revision).toMatch(/^[a-f0-9]{40}$/);
    const adapter = new MariaDBCausalPersistenceAdapter();
    const latest = await adapter.getLatestReceipt(ZONE);
    expect(latest, "starter journey must persist at least one receipt").not.toBeNull();
    if (!latest) return;

    const checkpoint = await adapter.getCheckpointAtOrBefore(ZONE, latest.tick - 1);
    expect(checkpoint, "latest replay sample requires a persisted checkpoint").not.toBeNull();
    if (!checkpoint) return;

    const loadFrom = checkpoint.tick > 0 ? checkpoint.tick : 1;
    const entries = await adapter.getTicksInRange(ZONE, loadFrom, latest.tick);
    expect(entries.some(entry => entry.receipt.tick === latest.tick)).toBe(true);

    const before = await counts();
    const live = await new AurionHeadlessCausalOracle().replayRange({
      zoneId: ZONE,
      fromTick: latest.tick,
      toTick: latest.tick,
    });
    expect(live.status).toBe("MATCH");
    expect(live.sourceRevision).toBe(latest.sourceRevision);
    expect(live.rulesetVersion).toBe(latest.rulesetVersion);
    expect(live.verifiedTicks).toEqual([latest.tick]);
    expect(live.firstDivergence).toBeNull();

    const syntheticIntent: AurionZoneIntent = {
      type: "move",
      connectionId: "controlled-replay-diagnostic",
      entityId: "player:2147483000",
      clientSeq: 1,
      arrivalSeq: 1,
      input: { x: 1, z: 0 },
    };
    const divergentRows: RecordedTickEntry[] = entries.map(entry =>
      entry.receipt.tick === latest.tick
        ? { ...entry, intents: [syntheticIntent] }
        : entry
    );
    const divergent = await new AurionHeadlessCausalOracle({
      async getCheckpointAtOrBefore() { return structuredClone(checkpoint); },
      async getTicksInRange(_zoneId, fromTick, toTick) {
        return structuredClone(divergentRows.filter(entry =>
          entry.receipt.tick >= fromTick && entry.receipt.tick <= toTick
        ));
      },
    }).replayRange({ zoneId: ZONE, fromTick: latest.tick, toTick: latest.tick });
    expect(divergent.status).toBe("FIRST_DIVERGENCE");
    expect(divergent.firstDivergence).toMatchObject({
      tick: latest.tick,
      stage: "INPUT_ORDER",
      expectedHash: latest.orderedIntentHash,
    });
    expect(divergent.firstDivergence?.observedHash).not.toBe(latest.orderedIntentHash);

    const missingRows: RecordedTickEntry[] = entries.map(entry =>
      entry.receipt.tick === latest.tick ? { ...entry, intents: undefined } : entry
    );
    const missing = await new AurionHeadlessCausalOracle({
      async getCheckpointAtOrBefore() { return structuredClone(checkpoint); },
      async getTicksInRange(_zoneId, fromTick, toTick) {
        return structuredClone(missingRows.filter(entry =>
          entry.receipt.tick >= fromTick && entry.receipt.tick <= toTick
        ));
      },
    }).replayRange({ zoneId: ZONE, fromTick: latest.tick, toTick: latest.tick });
    expect(missing.status).toBe("UNPROVABLE");
    expect(missing.reason).toBe(`ORACLE_INTENTS_MISSING:${latest.tick}`);

    const after = await counts();
    expect(after).toEqual(before);

    await mkdir(evidenceDir, { recursive: true });
    await writeFile(
      path.join(evidenceDir, `replay-assurance-${revision}.json`),
      JSON.stringify({
        schema: "aurion.starter-village-replay-assurance.v1",
        revision,
        zoneId: ZONE,
        latestTick: latest.tick,
        sourceRevision: latest.sourceRevision,
        rulesetVersion: latest.rulesetVersion,
        checkpoint: live.checkpoint,
        liveMatch: {
          status: live.status,
          verifiedTicks: live.verifiedTicks,
          terminalReceiptHash: live.terminalReceiptHash,
          finalStateHash: live.finalStateHash,
          oracleResultHash: live.oracleResultHash,
        },
        controlledDivergence: {
          status: divergent.status,
          firstDivergence: divergent.firstDivergence,
          oracleResultHash: divergent.oracleResultHash,
        },
        missingEvidence: {
          status: missing.status,
          reason: missing.reason,
          oracleResultHash: missing.oracleResultHash,
        },
        readonlyCounts: { before, after },
        mutationAuthority: "none",
      }, null, 2) + "\n",
      { flag: "wx" },
    );
  }, 30_000);
});
