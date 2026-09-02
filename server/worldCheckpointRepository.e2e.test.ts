import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { aurionWorldCheckpoints } from "../drizzle/aurionWorldCheckpointSchema";
import { getDb } from "./db";
import { recordAurionWorldCheckpoint } from "./worldCheckpointRepository";

const describeWithWorldCheckpointDatabase =
  process.env.DATABASE_URL && process.env.AURION_WORLD_CHECKPOINT_E2E === "1"
    ? describe
    : describe.skip;

const TEST_EPOCH = 2_000_000_028;

const baseInput = {
  worldSeed: "echoes-of-aurion-world-checkpoint-e2e",
  epoch: TEST_EPOCH,
  worldRevision: "fnv1a-e2e00028",
  chunkRevision: "chunk-ledger-e2e00028",
  snapshot: {
    world: { activePlayers: 3, highWaterPlayers: 5 },
    chunks: [
      { x: 0, z: 0, sequence: 2 },
      { x: 1, z: 0, sequence: 4 },
    ],
  },
};

async function cleanupCheckpoint() {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(aurionWorldCheckpoints)
    .where(eq(aurionWorldCheckpoints.worldSeed, baseInput.worldSeed));
}

describeWithWorldCheckpointDatabase("Aurion world checkpoint migration E2E", () => {
  beforeEach(cleanupCheckpoint);
  afterEach(cleanupCheckpoint);

  it("writes one checkpoint and replays the exact evidence as a no-op", async () => {
    const first = await recordAurionWorldCheckpoint(baseInput);
    const replay = await recordAurionWorldCheckpoint(baseInput);

    expect(first.source).toBe("created");
    expect(replay).toEqual({ source: "persisted", checkpoint: first.checkpoint });

    const db = await getDb();
    expect(db).not.toBeNull();
    if (db) {
      const rows = await db
        .select()
        .from(aurionWorldCheckpoints)
        .where(eq(aurionWorldCheckpoints.worldSeed, baseInput.worldSeed));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.snapshotHash).toBe(first.checkpoint.snapshotHash);
    }
  });

  it("rejects different evidence for an already confirmed epoch", async () => {
    await recordAurionWorldCheckpoint(baseInput);

    await expect(
      recordAurionWorldCheckpoint({
        ...baseInput,
        chunkRevision: "chunk-ledger-e2e-substitution",
        snapshot: {
          ...baseInput.snapshot,
          world: { activePlayers: 4, highWaterPlayers: 5 },
        },
      }),
    ).rejects.toThrow("epoch already has different confirmed evidence");
  });

  it("does not expose writable snapshot payloads through the confirmed read model", async () => {
    const result = await recordAurionWorldCheckpoint(baseInput);

    expect(result.checkpoint).not.toHaveProperty("snapshotJson");
    expect(result.checkpoint).not.toHaveProperty("idempotencyKey");
    expect(result.checkpoint).toMatchObject({
      worldId: "echoes-of-aurion-global",
      epoch: TEST_EPOCH,
      worldRevision: baseInput.worldRevision,
      chunkRevision: baseInput.chunkRevision,
    });
  });
});
