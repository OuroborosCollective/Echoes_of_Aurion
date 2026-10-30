import { describe, expect, it, vi } from "vitest";
import { AurionTickRecorder, type CausalPersistenceAdapter, type PersistedCheckpoint, type RecordedTickEntry } from "../causality/tickRecorder";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { hashCanonicalZoneState } from "../causality/zoneCanonicalState";
import { projectCommittedTick } from "./aurionAdapter";
import { isProjectionIdentity, projectionHash } from "./shared/projectionIdentity";
import { AURION_CAUSAL_TICK_SCHEMA_V2, computeReceiptHash } from "../../shared/aurionCausalTickContract";
import { WorldState } from "./bridge/worldState";
import { UpstreamClient } from "./bridge/upstream";

// Isolated real Aurion authority, not a running production zone or DB proof.
const revision = "1".repeat(40);
const observation = { sourceRevision: revision, runtimeImageDigest: "UNVERIFIED", streamInstance: "11111111-1111-4111-8111-111111111111" };
function fixture() {
  const recorder = new AurionTickRecorder(200);
  const zone = new AuthoritativeMovementZone("observatory_threshold", recorder);
  zone.sourceRevisionOverride = revision;
  return { zone, recorder };
}

describe("Aurion committed Godot projection", () => {
  it("matches independently calculated binary64 projection vectors", () => {
    expect(projectionHash(1, [], [])).toBe("sha256:9ccc31807d178cd5875db52ff520f29e4898c9f844754d16f4b73c9be2ae9756");
    expect(projectionHash(2, [{ id: "mob_1", kind: "monster", pos: { x: 1.25, y: 0, z: -2 } }], []))
      .toBe("sha256:21ea444e698e9ee2f6c334c8214ea7bf45c91d26f2b9303a06cdf120b6f5ae99");
  });

  it("rejects self-hashed receipts with a broken predecessor or skipped tick", () => {
    const { zone, recorder } = fixture();
    zone.tick();
    const previousReceipt = structuredClone(zone.getLatestReceipt()!);
    zone.tick();
    const entry = structuredClone(recorder.getEntry(zone.zoneId, 2)!);
    entry.receipt.previousReceiptHash = "sha256:" + "0".repeat(64);
    entry.receipt.receiptHash = computeReceiptHash(entry.receipt);
    const nextObservation = { ...observation, previousReceipt };
    expect(() => projectCommittedTick(entry, nextObservation)).toThrow(/PREDECESSOR|CONTINUITY/);
    zone.tick();
    expect(() => projectCommittedTick(recorder.getEntry(zone.zoneId, 3)!, nextObservation)).toThrow(/PREDECESSOR|CONTINUITY/);
    expect(() => projectCommittedTick(recorder.getEntry(zone.zoneId, 3)!, observation)).toThrow(/PREDECESSOR/);
  });

  it("retains the rollback fence after disconnect and rejects equal-tick equivocation", () => {
    const world = new WorldState();
    const upstream = new UpstreamClient(world, { url: "ws://127.0.0.1:1", token: "isolated-test-only", protocol: "feed", coords: "xz", reconnectMinMs: 10, reconnectMaxMs: 20, requireCanonical: true }, () => {});
    const receive = (msg: unknown) => (upstream as unknown as { onFeed(msg: unknown): void }).onFeed(msg);
    const { zone, recorder } = fixture();
    zone.tick();
    const projected = projectCommittedTick(recorder.getEntry(zone.zoneId, 1)!, observation);
    const frame = { t: "feed.snapshot", tick: 10, entities: [], regions: [], identity: { ...projected.identity, tick: 10, projectionHash: projectionHash(10, [], []) } };
    receive({ t: "feed.hello", proto: 1, worldId: projected.identity.worldId, edit: false });
    receive(frame);
    expect(world.loaded).toBe(true);
    world.invalidate();
    receive({ ...frame, tick: 9, identity: { ...frame.identity, tick: 9, streamInstance: "22222222-2222-4222-8222-222222222222", projectionHash: projectionHash(9, [], []) } });
    expect(world.loaded).toBe(false);
    receive(frame);
    expect(world.loaded).toBe(true);
    world.invalidate();
    receive({ ...frame, identity: { ...frame.identity, receiptHash: "sha256:" + "0".repeat(64) } });
    expect(world.loaded).toBe(false);
  });
  it("projects only a hash-checked canonical tick and converts fixed X/Z exactly once", () => {
    const { zone, recorder } = fixture();
    zone.tick();
    const entry = recorder.getEntry(zone.zoneId, zone.getTickNumber())!;
    const before = JSON.stringify(entry);
    const projected = projectCommittedTick(entry, observation);
    expect(isProjectionIdentity(projected.identity)).toBe(true);
    expect(projected.identity.receiptHash).toBe(zone.getLatestReceipt()!.receiptHash);
    expect(projected.identity.stateHash).toBe(hashCanonicalZoneState(entry.postState!));
    expect(projected.identity.projectionHash).toBe(projectionHash(projected.identity.tick, projected.entities, projected.regions));
    for (const mob of entry.postState!.mobs) {
      const entity = projected.entities.find(e => e.id === mob.entityId)!;
      expect(entity.pos).toEqual({ x: mob.x / 1000, y: 0, z: mob.z / 1000 });
    }
    expect(JSON.stringify(entry)).toBe(before);
  });

  it("rejects changed state, receipt, revision and missing post-state", () => {
    const { zone, recorder } = fixture();
    zone.tick();
    const entry = recorder.getEntry(zone.zoneId, zone.getTickNumber())!;
    expect(() => projectCommittedTick({ ...entry, postState: undefined }, observation)).toThrow();
    expect(() => projectCommittedTick(entry, { ...observation, sourceRevision: "2".repeat(40) })).toThrow();
    expect(() => projectCommittedTick({ ...entry, receipt: { ...entry.receipt, receiptHash: "sha256:" + "0".repeat(64) } }, observation)).toThrow();
    expect(() => projectCommittedTick({ ...entry, postState: { ...entry.postState!, tick: 999 } }, observation)).toThrow();
  });

  it("keeps receipt chains identical with a detached, even hostile, observer", async () => {
    const baseline = fixture();
    const observed = fixture();
    baseline.zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V2;
    observed.zone.receiptSchemaOverride = AURION_CAUSAL_TICK_SCHEMA_V2;
    const captured: RecordedTickEntry[] = [];
    let completed = 0;
    const stop = observed.recorder.observeCommittedTicks(entry => {
      captured.push(structuredClone(entry));
      entry.receipt.receiptHash = "observer-local mutation";
      if ("stages" in entry.receipt && entry.receipt.stages.length) Object.assign(entry.receipt.stages[0], { observerMutation: true });
      if (entry.postState?.mobs[0]) entry.postState.mobs[0].x = 999999;
      completed++;
    });
    for (let tick = 1; tick <= 100; tick++) {
      baseline.zone.tick();
      observed.zone.tick();
      await Promise.resolve();
      expect(observed.zone.getLatestReceipt()).toEqual(baseline.zone.getLatestReceipt());
      expect(observed.zone.getCanonicalZoneState()).toEqual(baseline.zone.getCanonicalZoneState());
    }
    expect(captured).toHaveLength(100);
    expect(completed).toBe(100);
    expect(observed.recorder.verifyReceiptChain().valid).toBe(true);
    stop();
    observed.zone.tick();
    await Promise.resolve();
    expect(captured).toHaveLength(100);
  });
});

// Failure injection doubles only; the same persistence/delivery boundary is
// exercised with the real adapter in causalReceiptV2Persistence.test.ts.
describe("detached observers wait for durable evidence", () => {
  function durableFixture(failure?: "receipt" | "checkpoint" | "readback") {
    let saved: RecordedTickEntry | null = null;
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const checkpoints = new Map<number, PersistedCheckpoint>();
    const adapter = {
      saveReceipt: async () => {
        await gate;
        if (failure === "receipt") throw new Error("INJECTED_RECEIPT_FAILURE");
        saved = structuredClone(recorder.getEntry(zone.zoneId, zone.getTickNumber())!);
      },
      saveCheckpoint: async (zoneId, tick, snapshotHash, state) => {
        if (failure === "checkpoint") throw new Error("INJECTED_CHECKPOINT_FAILURE");
        checkpoints.set(tick, { id: "test-checkpoint", worldId: state.worldId, zoneId, tick, snapshotHash, state: structuredClone(state), reconciled: 0 });
      },
      getRecordedTick: async () => failure === "readback" ? null : saved,
      getCheckpoint: async (_zoneId, tick) => checkpoints.get(tick) ?? null,
    } satisfies Partial<CausalPersistenceAdapter>;
    const recorder = new AurionTickRecorder(200, adapter as CausalPersistenceAdapter);
    const zone = new AuthoritativeMovementZone("observatory_threshold", recorder);
    zone.sourceRevisionOverride = revision;
    return { recorder, zone, release };
  }

  it("does not publish while the receipt write is still pending", async () => {
    const { recorder, zone, release } = durableFixture();
    const observed: RecordedTickEntry[] = [];
    recorder.observeCommittedTicks(entry => observed.push(entry));
    zone.tick();
    await Promise.resolve();
    expect(observed).toHaveLength(0);
    release();
    await recorder.flushPersistence();
    expect(observed).toHaveLength(1);
    expect(recorder.getPersistenceStatus()).toMatchObject({ pending: 0, failures: 0 });
  });

  it.each(["receipt", "checkpoint", "readback"] as const)("does not publish after %s failure", async failure => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { recorder, zone, release } = durableFixture(failure);
      const observed: RecordedTickEntry[] = [];
      recorder.observeCommittedTicks(entry => observed.push(entry));
      zone.tick();
      release();
      await recorder.flushPersistence();
      expect(observed).toHaveLength(0);
      expect(recorder.getPersistenceStatus().failures).toBe(1);
    } finally { log.mockRestore(); }
  });
});

