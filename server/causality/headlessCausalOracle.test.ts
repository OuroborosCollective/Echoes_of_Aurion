import { describe, expect, it } from "vitest";
import type WebSocket from "ws";
import {
  AURION_CAUSAL_TICK_SCHEMA_V2,
  computeReceiptHash,
  type AurionCausalTickReceiptV2,
} from "../../shared/aurionCausalTickContract";
import { computeHeadlessCausalOracleResultHash } from "../../shared/aurionHeadlessCausalOracleContract";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { AurionHeadlessCausalOracle } from "./headlessCausalOracle";
import { hashCanonicalZoneState, type CanonicalZoneState } from "./zoneCanonicalState";
import type { PersistedCheckpoint, RecordedTickEntry } from "./tickRecorder";

const socket = { readyState: 1, OPEN: 1, send: () => {}, close: () => {} } as unknown as WebSocket;
const REVISION = "a".repeat(40);

function fixture(tickCount = 4) {
  const zone = new AuthoritativeMovementZone("observatory_threshold:oracle-v2" as any);
  zone.sourceRevisionOverride = REVISION;
  zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V2;
  const { connectionId } = zone.join({
    userId: 25_001,
    socket,
    combatProfile: { combatLevel: 7, maxHealth: 600, weaponBonus: 15, weaponTrack: "blade" },
  });
  const checkpointState = zone.getCanonicalZoneState();
  const checkpoint: PersistedCheckpoint = {
    id: "physical-id-is-not-oracle-truth",
    worldId: checkpointState.worldId,
    zoneId: checkpointState.zoneId,
    tick: 0,
    snapshotHash: hashCanonicalZoneState(checkpointState),
    state: checkpointState,
    reconciled: 0,
  };
  const entries: RecordedTickEntry[] = [];
  for (let tick = 1; tick <= tickCount; tick += 1) {
    zone.submitMovement(connectionId, {
      type: "move",
      clientSeq: tick,
      input: tick % 2 === 0 ? { x: 0, z: -1 } : { x: 1, z: 0 },
    });
    const intents = [...zone.getPendingIntents()];
    zone.tick();
    const receipt = zone.getLatestReceipt();
    if (!receipt) throw new Error("ORACLE_FIXTURE_RECEIPT_MISSING");
    entries.push({ receipt, intents });
  }
  return { checkpoint, entries };
}

function persistence(
  checkpoint: PersistedCheckpoint | null,
  entries: RecordedTickEntry[],
) {
  return {
    async getCheckpointAtOrBefore(_zoneId: string, tick: number) {
      return checkpoint && checkpoint.tick <= tick ? checkpoint : null;
    },
    async getTicksInRange(_zoneId: string, fromTick: number, toTick: number) {
      return entries.filter(entry => entry.receipt.tick >= fromTick && entry.receipt.tick <= toTick);
    },
  };
}

describe("Wave 2 Step 25 headless causal oracle v2", () => {
  it("warms up from a sparse checkpoint and verifies only the requested range", async () => {
    const { checkpoint, entries } = fixture(4);
    const oracle = new AurionHeadlessCausalOracle(persistence(checkpoint, entries));
    const result = await oracle.replayRange({
      zoneId: checkpoint.zoneId,
      fromTick: 3,
      toTick: 4,
    });
    expect(result.status).toBe("MATCH");
    expect(result.mutationAuthority).toBe("none");
    expect(result.checkpoint).toEqual({
      worldId: checkpoint.worldId,
      zoneId: checkpoint.zoneId,
      tick: 0,
      snapshotHash: checkpoint.snapshotHash,
    });
    expect(result.warmupTicks).toEqual([1, 2]);
    expect(result.verifiedTicks).toEqual([3, 4]);
    expect(result.sourceRevision).toBe(REVISION);
    expect(result.rulesetVersion).toBe(entries[0]!.receipt.rulesetVersion);
    expect(result.terminalReceiptHash).toBe(entries[3]!.receipt.receiptHash);
    expect(result.oracleResultHash).toBe(computeHeadlessCausalOracleResultHash({
      ...result,
      oracleResultHash: undefined,
    } as any));
  });

  it("returns the exact first divergent tick and v2 authority stage", async () => {
    const { checkpoint, entries } = fixture(3);
    const original = entries[1]!.receipt;
    if (original.schema !== AURION_CAUSAL_TICK_SCHEMA_V2) throw new Error("V2_EXPECTED");
    const stages = original.stages.map(stage => ({ ...stage }));
    stages[2] = { ...stages[2]!, canonicalStateHash: "sha256:" + "f".repeat(64) };
    const { receiptHash: _ignored, ...unsigned } = original;
    const changedUnsigned = { ...unsigned, stages } as Omit<AurionCausalTickReceiptV2, "receiptHash">;
    const tampered: AurionCausalTickReceiptV2 = {
      ...changedUnsigned,
      receiptHash: computeReceiptHash(changedUnsigned),
    };
    const rows = [...entries];
    rows[1] = { ...rows[1]!, receipt: tampered };

    const result = await new AurionHeadlessCausalOracle(persistence(checkpoint, rows))
      .replayRange({ zoneId: checkpoint.zoneId, fromTick: 1, toTick: 3 });

    expect(result.status).toBe("FIRST_DIVERGENCE");
    expect(result.firstDivergence?.tick).toBe(2);
    expect(result.firstDivergence?.stage).toBe("PLAYER_ACTION");
    expect(result.verifiedTicks).toEqual([1]);
  });

  it("fails closed on a missing receipt inside the replay interval", async () => {
    const { checkpoint, entries } = fixture(4);
    const rows = entries.filter(entry => entry.receipt.tick !== 2);
    const result = await new AurionHeadlessCausalOracle(persistence(checkpoint, rows))
      .replayRange({ zoneId: checkpoint.zoneId, fromTick: 3, toTick: 4 });
    expect(result.status).toBe("UNPROVABLE");
    expect(result.reason).toBe("ORACLE_RECEIPT_GAP:2");
  });

  it("fails closed when no checkpoint can anchor the requested range", async () => {
    const { checkpoint, entries } = fixture(2);
    const result = await new AurionHeadlessCausalOracle(persistence(null, entries))
      .replayRange({ zoneId: checkpoint.zoneId, fromTick: 1, toTick: 2 });
    expect(result.status).toBe("UNPROVABLE");
    expect(result.reason).toBe("ORACLE_CHECKPOINT_MISSING");
  });

  it("fails closed on source revision drift rather than replaying mixed truth", async () => {
    const { checkpoint, entries } = fixture(3);
    const receipt = entries[1]!.receipt;
    const rows = [...entries];
    rows[1] = {
      ...rows[1]!,
      receipt: { ...receipt, sourceRevision: "b".repeat(40) },
    };
    const result = await new AurionHeadlessCausalOracle(persistence(checkpoint, rows))
      .replayRange({ zoneId: checkpoint.zoneId, fromTick: 1, toTick: 3 });
    expect(result.status).toBe("UNPROVABLE");
    expect(result.reason).toBe("ORACLE_SOURCE_REVISION_DRIFT:2");
  });

  it("fails closed on ruleset drift", async () => {
    const { checkpoint, entries } = fixture(3);
    const rows = [...entries];
    rows[1] = {
      ...rows[1]!,
      receipt: { ...rows[1]!.receipt, rulesetVersion: "aurion.zone.rules.forged" },
    };
    const result = await new AurionHeadlessCausalOracle(persistence(checkpoint, rows))
      .replayRange({ zoneId: checkpoint.zoneId, fromTick: 1, toTick: 3 });
    expect(result.status).toBe("UNPROVABLE");
    expect(result.reason).toBe("ORACLE_RULESET_DRIFT:2");
  });

  it("produces the same oracle result hash for the same semantic evidence", async () => {
    const { checkpoint, entries } = fixture(3);
    const oracle = new AurionHeadlessCausalOracle(persistence(checkpoint, entries));
    const first = await oracle.replayRange({ zoneId: checkpoint.zoneId, fromTick: 2, toTick: 3 });
    const second = await oracle.replayRange({ zoneId: checkpoint.zoneId, fromTick: 2, toTick: 3 });
    expect(first.status).toBe("MATCH");
    expect(second.status).toBe("MATCH");
    expect(first.oracleResultHash).toBe(second.oracleResultHash);
  });

  it("rejects unbounded or zero-based requested ranges before evidence access", async () => {
    const { checkpoint, entries } = fixture(2);
    const oracle = new AurionHeadlessCausalOracle(persistence(checkpoint, entries));
    await expect(oracle.replayRange({ zoneId: checkpoint.zoneId, fromTick: 0, toTick: 1 }))
      .rejects.toThrow("HEADLESS_CAUSAL_ORACLE_RANGE_INVALID");
    await expect(oracle.replayRange({ zoneId: checkpoint.zoneId, fromTick: 1, toTick: 251 }))
      .rejects.toThrow("HEADLESS_CAUSAL_ORACLE_RANGE_INVALID");
  });
});
