import { describe, expect, it } from "vitest";
import { getWorldChunkDeltaPage, getWorldChunkWindow, WORLD_CHUNK_DELTA_PAGE_MAXIMUM } from "./db";

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

  it("returns a bounded center-first window with the stream page policy", async () => {
    const window = await getWorldChunkWindow({ center: { x: 4, z: -3 }, tier: "phone" });
    expect(window).toMatchObject({ tier: "phone", center: { x: 4, z: -3 }, visibleRadius: 1 });
    expect(window.chunks).toHaveLength(9);
    expect(window.chunks.map(chunk => `${chunk.generation.coordinate.x}:${chunk.generation.coordinate.z}`)).toEqual(["4:-3", "4:-4", "3:-3", "5:-3", "4:-2", "3:-4", "5:-4", "3:-2", "5:-2"]);
    expect(window.chunks.every(chunk => chunk.deltas.length <= 32)).toBe(true);
  });

  it("rejects cursors outside or duplicated within the requested window", async () => {
    await expect(getWorldChunkWindow({ center: { x: 0, z: 0 }, tier: "phone", afterSequences: [{ coordinate: { x: 9, z: 9 }, afterSequence: 1 }] })).rejects.toThrow(/sichtbaren Fenster/);
    await expect(getWorldChunkWindow({ center: { x: 0, z: 0 }, tier: "phone", afterSequences: [{ coordinate: { x: 0, z: 0 }, afterSequence: 1 }, { coordinate: { x: 0, z: 0 }, afterSequence: 2 }] })).rejects.toThrow(/eindeutig/);
  });

  it("rejects unsafe read cursors and unbounded page requests", async () => {
    await expect(getWorldChunkDeltaPage({ coordinate: { x: 0, z: 0 }, afterSequence: -1, limit: 1 })).rejects.toThrow(/Deltacursor/);
    await expect(getWorldChunkDeltaPage({ coordinate: { x: 0, z: 0 }, afterSequence: 0, limit: WORLD_CHUNK_DELTA_PAGE_MAXIMUM + 1 })).rejects.toThrow(/Deltalimit/);
  });
});
