import { describe, expect, it, vi } from "vitest";
import { drainAurionRuntimeForShutdown } from "./gracefulCausalShutdown";

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
});
