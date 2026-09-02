import { describe, expect, it } from "vitest";
import {
  buildAurionWorldCheckpoint,
  toAurionWorldCheckpointReadModel,
} from "./worldCheckpointProtocol";

const baseInput = {
  worldSeed: "echoes-of-aurion-v1",
  epoch: 28,
  worldRevision: "fnv1a-8f4b20d1",
  chunkRevision: "chunk-ledger-0000000028",
  snapshot: {
    world: { activePlayers: 4, unlockedSectors: 6 },
    chunks: [
      { x: 0, z: 0, sequence: 3 },
      { x: 1, z: 0, sequence: 1 },
    ],
  },
};

describe("Aurion world checkpoint protocol", () => {
  it("canonicalizes object key order into one deterministic checkpoint", () => {
    const first = buildAurionWorldCheckpoint(baseInput);
    const second = buildAurionWorldCheckpoint({
      ...baseInput,
      snapshot: {
        chunks: [
          { sequence: 3, z: 0, x: 0 },
          { z: 0, sequence: 1, x: 1 },
        ],
        world: { unlockedSectors: 6, activePlayers: 4 },
      },
    });

    expect(second).toEqual(first);
    expect(first.snapshotHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.id).toBe(`checkpoint:${first.snapshotHash}`);
    expect(first.idempotencyKey).toBe(`world-checkpoint:28:${first.snapshotHash}`);
  });

  it("binds epoch, world revision and chunk revision into the snapshot hash", () => {
    const base = buildAurionWorldCheckpoint(baseInput);
    expect(
      buildAurionWorldCheckpoint({ ...baseInput, epoch: 29 }).snapshotHash,
    ).not.toBe(base.snapshotHash);
    expect(
      buildAurionWorldCheckpoint({
        ...baseInput,
        worldRevision: "fnv1a-00000029",
      }).snapshotHash,
    ).not.toBe(base.snapshotHash);
    expect(
      buildAurionWorldCheckpoint({
        ...baseInput,
        chunkRevision: "chunk-ledger-0000000029",
      }).snapshotHash,
    ).not.toBe(base.snapshotHash);
  });

  it("projects only confirmed read-model fields to clients", () => {
    const checkpoint = buildAurionWorldCheckpoint(baseInput);
    const readModel = toAurionWorldCheckpointReadModel(checkpoint);

    expect(readModel).toEqual({
      version: "aurion-world-checkpoint.v1",
      worldId: "echoes-of-aurion-global",
      id: checkpoint.id,
      worldSeed: checkpoint.worldSeed,
      epoch: checkpoint.epoch,
      worldRevision: checkpoint.worldRevision,
      chunkRevision: checkpoint.chunkRevision,
      snapshotHash: checkpoint.snapshotHash,
    });
    expect(readModel).not.toHaveProperty("snapshotJson");
    expect(readModel).not.toHaveProperty("idempotencyKey");
  });

  it("fails closed for invalid checkpoint identities", () => {
    expect(() =>
      buildAurionWorldCheckpoint({ ...baseInput, epoch: -1 }),
    ).toThrow("epoch");
    expect(() =>
      buildAurionWorldCheckpoint({ ...baseInput, worldRevision: " " }),
    ).toThrow("worldRevision");
    expect(() =>
      buildAurionWorldCheckpoint({ ...baseInput, snapshot: { bad: undefined } }),
    ).toThrow("unsupported value");
  });
});
