import { describe, expect, it } from "vitest";
import { getWorldChunkDeltaPage, WORLD_CHUNK_DELTA_PAGE_MAXIMUM } from "./db";

describe("world chunk delta readmodel", () => {
  it("publishes only a bounded delta overlay alongside a reproducible base hash", async () => {
    const page = await getWorldChunkDeltaPage({ coordinate: { x: -3, z: 7 }, afterSequence: 0, limit: 16 });
    expect(page.generation).toEqual({
      worldId: "echoes-of-aurion-global",
      coordinate: { x: -3, z: 7 },
      baseRevision: 1,
      baseHash: expect.stringMatching(/^fnv1a-[0-9a-f]{8}$/),
    });
    expect(page.deltas).toHaveLength(0);
    expect(page.hasMore).toBe(false);
    expect(page.nextAfterSequence).toBe(0);
    expect(JSON.stringify(page)).not.toContain("tiles");
    expect(JSON.stringify(page)).not.toContain("worldSeed");
  });

  it("rejects unsafe read cursors and unbounded page requests", async () => {
    await expect(getWorldChunkDeltaPage({ coordinate: { x: 0, z: 0 }, afterSequence: -1, limit: 1 })).rejects.toThrow(/Deltacursor/);
    await expect(getWorldChunkDeltaPage({ coordinate: { x: 0, z: 0 }, afterSequence: 0, limit: WORLD_CHUNK_DELTA_PAGE_MAXIMUM + 1 })).rejects.toThrow(/Deltalimit/);
  });
});
