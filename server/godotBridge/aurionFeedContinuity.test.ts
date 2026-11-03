import { mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

vi.hoisted(() => { process.env.AURION_RELEASE_SHA = "1".repeat(40); });

import { AurionTickRecorder, type CausalPersistenceAdapter, type PersistedCheckpoint, type RecordedTickEntry } from "../causality/tickRecorder";
import type { AurionCausalTickReceipt } from "../../shared/aurionCausalTickContract";
import { AuthoritativeMovementZone } from "../zoneRuntime";
import { startAurionGodotFeed } from "./aurionAdapter";

// Failure-injection double for one lost durable write; not production DB evidence.
function lossyDurableRecorder(lostTick: number) {
  const receipts = new Map<number, AurionCausalTickReceipt>();
  const checkpoints = new Map<number, PersistedCheckpoint>();
  const adapter = {
    saveReceipt: async (receipt: AurionCausalTickReceipt) => {
      if (receipt.tick === lostTick) throw new Error("INJECTED_LOCK_WAIT_TIMEOUT");
      receipts.set(receipt.tick, structuredClone(receipt));
    },
    saveCheckpoint: async (zoneId: string, tick: number, snapshotHash: string, state: PersistedCheckpoint["state"]) => {
      checkpoints.set(tick, { id: `cp-${tick}`, worldId: state.worldId, zoneId, tick, snapshotHash, state: structuredClone(state), reconciled: 0 });
    },
    getRecordedTick: async (_zoneId: string, tick: number): Promise<RecordedTickEntry | null> => {
      const receipt = receipts.get(tick);
      return receipt ? { receipt: structuredClone(receipt) } : null;
    },
    getCheckpoint: async (_zoneId: string, tick: number) => checkpoints.get(tick) ?? null,
  } satisfies Partial<CausalPersistenceAdapter>;
  return new AurionTickRecorder(200, adapter as CausalPersistenceAdapter);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!();
});

describe("production Godot feed continuity", () => {
  it("keeps streaming committed ticks after one durable write was lost", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    cleanups.push(() => log.mockRestore());
    const recorder = lossyDurableRecorder(3);
    const zone = new AuthoritativeMovementZone("observatory_threshold", recorder);
    const token = "t".repeat(48);
    const tokenFile = join(mkdtempSync(join(tmpdir(), "aurion-feed-")), "feed.token");
    writeFileSync(tokenFile, token);
    const feed = await startAurionGodotFeed({
      AURION_GODOT_FEED_TOKEN_FILE: tokenFile,
      AURION_GODOT_FEED_PORT: String(await freePort()),
      AURION_GODOT_FEED_BIND: "127.0.0.1",
    }, recorder);
    expect(feed).toBeDefined();
    cleanups.push(() => feed!.close());

    const ws = new WebSocket(`ws://127.0.0.1:${feed!.port}/feed`);
    cleanups.push(() => ws.terminate());
    const ticks: number[] = [];
    let closeCode: number | undefined;
    ws.on("message", data => {
      const msg = JSON.parse(String(data)) as { t: string; identity?: { tick: number } };
      if ((msg.t === "feed.snapshot" || msg.t === "feed.delta") && msg.identity) ticks.push(msg.identity.tick);
    });
    ws.on("close", code => { closeCode = code; });
    await new Promise<void>((resolve, reject) => { ws.once("open", () => resolve()); ws.once("error", reject); });
    ws.send(JSON.stringify({ t: "feed.auth", token }));
    await new Promise(resolve => setTimeout(resolve, 50));

    for (let tick = 1; tick <= 12; tick++) {
      zone.tick();
      await recorder.flushPersistence();
      await new Promise(resolve => setTimeout(resolve, 5));
    }
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(recorder.getPersistenceStatus().failures).toBe(2);
    expect(closeCode).toBeUndefined();
    expect(ticks).toContain(2);
    expect(ticks).not.toContain(3);
    expect(ticks).not.toContain(4);
    expect(ticks.slice(-1)[0]).toBe(12);
    expect(ticks.filter(tick => tick > 4)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
  });
});
