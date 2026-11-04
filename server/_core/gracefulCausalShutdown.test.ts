import { describe, expect, it, vi } from "vitest";
import { drainAurionRuntimeForShutdown } from "./gracefulCausalShutdown";
import { AurionTickRecorder, type CausalPersistenceAdapter } from "../causality/tickRecorder";
import type { AurionCausalTickReceipt } from "../../shared/aurionCausalTickContract";

describe("Aurion graceful causal shutdown", () => {
  it("stops tick production and observers before flushing durable causal evidence", async () => {
    const order: string[] = [];
    await drainAurionRuntimeForShutdown({
      closeZoneGateway: vi.fn(() => { order.push("zone"); }),
      stopObservers: [
        vi.fn(() => { order.push("observer-a"); }),
        vi.fn(() => { order.push("observer-b"); }),
      ],
      flushCausalPersistence: vi.fn(async () => { order.push("flush"); }),
      closeHttpServer: vi.fn(async () => { order.push("http"); }),
    });
    expect(order).toEqual(["zone", "observer-a", "observer-b", "flush", "http"]);
  });



  it("waits for already-enqueued causal writes before closing the HTTP server", async () => {
    let releaseWrite!: () => void;
    const writeGate = new Promise<void>(resolve => { releaseWrite = resolve; });
    const events: string[] = [];
    const adapter: CausalPersistenceAdapter = {
      async saveReceipt() { events.push("write-start"); await writeGate; events.push("write-durable"); },
      async saveCheckpoint() {},
      async saveReplayRun() {},
      async getLatestReceipt() { return null; },
      async getRecordedTick() { return null; },
      async getCheckpoint() { return null; },
      async getCheckpointAtOrBefore() { return null; },
      async getUnreconciledCheckpoints() { return []; },
      async getDivergentCheckpoints() { return []; },
      async updateCheckpointReconciliation() {},
      async getTicksInRange() { return []; },
      async archiveOldReceipts() { return null; },
      async getArchiveStats() { return { totalArchives: 0, totalArchivedReceipts: 0 }; },
    };
    const recorder = new AurionTickRecorder(10, adapter);
    recorder.enqueueTick({
      schema: "aurion.causal.tick.v1",
      worldId: "echoes-of-aurion-global",
      zoneId: "observatory_threshold",
      tick: 2,
      sourceRevision: "a".repeat(40),
      rulesetVersion: "aurion.zone.rules.v3",
      previousReceiptHash: null,
      preStateHash: "sha256:" + "1".repeat(64),
      orderedIntentHash: "sha256:" + "2".repeat(64),
      transitionHash: "sha256:" + "3".repeat(64),
      rngRootHash: "sha256:" + "4".repeat(64),
      postStateHash: "sha256:" + "5".repeat(64),
      receiptHash: "sha256:" + "6".repeat(64),
    } as AurionCausalTickReceipt);

    let closed = false;
    const draining = drainAurionRuntimeForShutdown({
      closeZoneGateway: () => { events.push("zone"); },
      stopObservers: [],
      flushCausalPersistence: () => recorder.flushPersistence(),
      closeHttpServer: async () => { closed = true; events.push("http"); },
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(events).toContain("write-start");
    expect(closed).toBe(false);
    releaseWrite();
    await draining;
    expect(events.indexOf("write-durable")).toBeLessThan(events.indexOf("http"));
    expect(recorder.getPersistenceStatus().pending).toBe(0);
  });

  it("does not report shutdown complete when causal persistence flush fails", async () => {
    const closeHttpServer = vi.fn(async () => {});
    await expect(drainAurionRuntimeForShutdown({
      closeZoneGateway: () => {},
      stopObservers: [],
      flushCausalPersistence: async () => { throw new Error("CAUSAL_FLUSH_FAILED"); },
      closeHttpServer,
    })).rejects.toThrow("CAUSAL_FLUSH_FAILED");
    expect(closeHttpServer).not.toHaveBeenCalled();
  });

  it("fails the shutdown when the final presence-leave tick did not persist (recorder counted a failure)", async () => {
    // Review finding on #1311: the recorder swallows write failures, so a clean flush alone
    // must not report a clean shutdown while the persisted head still carries players.
    let failures = 0;
    const closeHttpServer = vi.fn(async () => {});
    await expect(drainAurionRuntimeForShutdown({
      closeZoneGateway: () => { failures += 1; }, // final tick enqueued, its write later fails
      stopObservers: [],
      flushCausalPersistence: async () => {},
      closeHttpServer,
      persistenceStatus: () => ({ pending: 0, failures }),
    })).rejects.toThrow("CAUSAL_SHUTDOWN_PERSISTENCE_INCOMPLETE:failures=1(+1 during shutdown),pending=0");
    expect(closeHttpServer).not.toHaveBeenCalled();

    // An earlier failed receipt leaves a gap in the durable chain even if later writes succeed.
    await expect(drainAurionRuntimeForShutdown({
      closeZoneGateway: () => {},
      stopObservers: [],
      flushCausalPersistence: async () => {},
      closeHttpServer,
      persistenceStatus: () => ({ pending: 0, failures: 7 }),
    })).rejects.toThrow("CAUSAL_SHUTDOWN_PERSISTENCE_INCOMPLETE:failures=7(+0 during shutdown),pending=0");
    expect(closeHttpServer).not.toHaveBeenCalled();

    await expect(drainAurionRuntimeForShutdown({
      closeZoneGateway: async () => {},
      stopObservers: [],
      flushCausalPersistence: async () => {},
      closeHttpServer,
      persistenceStatus: () => ({ pending: 0, failures: 0 }),
    })).resolves.toBeUndefined();
    expect(closeHttpServer).toHaveBeenCalledTimes(1);
  });

  it("still flushes already-enqueued writes when the final presence-leave tick throws, then fails the shutdown", async () => {
    const order: string[] = [];
    const closeHttpServer = vi.fn(async () => { order.push("http"); });
    await expect(drainAurionRuntimeForShutdown({
      closeZoneGateway: () => { order.push("zone"); throw new Error("ZONE_FINAL_TICK_FAILED"); },
      stopObservers: [() => { order.push("observer"); }],
      flushCausalPersistence: async () => { order.push("flush"); },
      closeHttpServer,
    })).rejects.toThrow("CAUSAL_SHUTDOWN_ZONE_CLOSE_FAILED");
    expect(order).toEqual(["zone", "observer", "flush"]);
    expect(closeHttpServer).not.toHaveBeenCalled();
  });
});
