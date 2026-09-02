import { createHash } from "node:crypto";

export const AURION_WORLD_CHECKPOINT_VERSION = "aurion-world-checkpoint.v1" as const;
export const AURION_WORLD_CHECKPOINT_WORLD_ID = "echoes-of-aurion-global" as const;

export type AurionWorldCheckpointInput = {
  worldSeed: string;
  epoch: number;
  worldRevision: string;
  chunkRevision: string;
  snapshot: unknown;
};

export type AurionWorldCheckpoint = {
  version: typeof AURION_WORLD_CHECKPOINT_VERSION;
  worldId: typeof AURION_WORLD_CHECKPOINT_WORLD_ID;
  id: string;
  worldSeed: string;
  epoch: number;
  worldRevision: string;
  chunkRevision: string;
  snapshotHash: string;
  snapshotJson: string;
  idempotencyKey: string;
};

export type AurionWorldCheckpointReadModel = Readonly<
  Omit<AurionWorldCheckpoint, "snapshotJson" | "idempotencyKey">
>;

type PersistedAurionWorldCheckpointIdentity = Readonly<{
  worldId: string;
  worldSeed: string;
  epoch: number;
  worldRevision: string;
  chunkRevision: string;
  snapshotHash: string;
  idempotencyKey: string;
}>;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) throw new Error("checkpoint snapshot contains an unsupported value");
    return encoded;
  }
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function requireBoundedIdentifier(value: string, label: string, maximum: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maximum) throw new Error(`${label} is invalid`);
  return normalized;
}

export function buildAurionWorldCheckpoint(input: AurionWorldCheckpointInput): AurionWorldCheckpoint {
  if (!Number.isSafeInteger(input.epoch) || input.epoch < 0) throw new Error("epoch must be a non-negative safe integer");
  const worldSeed = requireBoundedIdentifier(input.worldSeed, "worldSeed", 128);
  const worldRevision = requireBoundedIdentifier(input.worldRevision, "worldRevision", 64);
  const chunkRevision = requireBoundedIdentifier(input.chunkRevision, "chunkRevision", 64);
  const snapshotJson = stableStringify(input.snapshot);
  const snapshotHash = sha256Hex(
    stableStringify({
      version: AURION_WORLD_CHECKPOINT_VERSION,
      worldId: AURION_WORLD_CHECKPOINT_WORLD_ID,
      worldSeed,
      epoch: input.epoch,
      worldRevision,
      chunkRevision,
      snapshot: JSON.parse(snapshotJson) as unknown,
    }),
  );
  const id = `checkpoint:${snapshotHash.slice(0, 64)}`;
  const idempotencyKey = `world-checkpoint:${input.epoch}:${snapshotHash}`;
  return Object.freeze({
    version: AURION_WORLD_CHECKPOINT_VERSION,
    worldId: AURION_WORLD_CHECKPOINT_WORLD_ID,
    id,
    worldSeed,
    epoch: input.epoch,
    worldRevision,
    chunkRevision,
    snapshotHash,
    snapshotJson,
    idempotencyKey,
  });
}

export function sameAurionWorldCheckpoint(
  left: PersistedAurionWorldCheckpointIdentity,
  right: PersistedAurionWorldCheckpointIdentity,
): boolean {
  return (
    left.worldId === AURION_WORLD_CHECKPOINT_WORLD_ID &&
    right.worldId === AURION_WORLD_CHECKPOINT_WORLD_ID &&
    left.worldId === right.worldId &&
    left.worldSeed === right.worldSeed &&
    left.epoch === right.epoch &&
    left.worldRevision === right.worldRevision &&
    left.chunkRevision === right.chunkRevision &&
    left.snapshotHash === right.snapshotHash &&
    left.idempotencyKey === right.idempotencyKey
  );
}

export function toAurionWorldCheckpointReadModel(checkpoint: AurionWorldCheckpoint): AurionWorldCheckpointReadModel {
  return Object.freeze({
    version: checkpoint.version,
    worldId: checkpoint.worldId,
    id: checkpoint.id,
    worldSeed: checkpoint.worldSeed,
    epoch: checkpoint.epoch,
    worldRevision: checkpoint.worldRevision,
    chunkRevision: checkpoint.chunkRevision,
    snapshotHash: checkpoint.snapshotHash,
  });
}
