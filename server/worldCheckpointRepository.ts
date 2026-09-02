import { and, eq } from "drizzle-orm";
import { aurionWorldCheckpoints } from "../drizzle/aurionWorldCheckpointSchema";
import { getDb } from "./db";
import {
  buildAurionWorldCheckpoint,
  sameAurionWorldCheckpoint,
  toAurionWorldCheckpointReadModel,
  type AurionWorldCheckpointInput,
  type AurionWorldCheckpointReadModel,
} from "./worldCheckpointProtocol";

export type RecordAurionWorldCheckpointResult = Readonly<{
  source: "created" | "persisted";
  checkpoint: AurionWorldCheckpointReadModel;
}>;

export async function recordAurionWorldCheckpoint(
  input: AurionWorldCheckpointInput,
): Promise<RecordAurionWorldCheckpointResult> {
  const checkpoint = buildAurionWorldCheckpoint(input);
  const db = await getDb();
  if (!db) throw new Error("Aurion world checkpoint database is not available");

  return db.transaction(async tx => {
    const byIdempotency = (
      await tx
        .select()
        .from(aurionWorldCheckpoints)
        .where(eq(aurionWorldCheckpoints.idempotencyKey, checkpoint.idempotencyKey))
        .limit(1)
    )[0];

    if (byIdempotency) {
      if (
        byIdempotency.snapshotJson !== checkpoint.snapshotJson ||
        !sameAurionWorldCheckpoint(byIdempotency, checkpoint)
      ) {
        throw new Error("Aurion world checkpoint idempotency key is bound to different evidence");
      }
      return {
        source: "persisted" as const,
        checkpoint: toAurionWorldCheckpointReadModel(checkpoint),
      };
    }

    const byEpoch = (
      await tx
        .select()
        .from(aurionWorldCheckpoints)
        .where(
          and(
            eq(aurionWorldCheckpoints.worldId, checkpoint.worldId),
            eq(aurionWorldCheckpoints.worldSeed, checkpoint.worldSeed),
            eq(aurionWorldCheckpoints.epoch, checkpoint.epoch),
          ),
        )
        .limit(1)
    )[0];

    if (byEpoch) {
      if (
        byEpoch.snapshotJson === checkpoint.snapshotJson &&
        sameAurionWorldCheckpoint(byEpoch, checkpoint)
      ) {
        return {
          source: "persisted" as const,
          checkpoint: toAurionWorldCheckpointReadModel(checkpoint),
        };
      }
      throw new Error("Aurion world checkpoint epoch already has different confirmed evidence");
    }

    const byRevision = (
      await tx
        .select()
        .from(aurionWorldCheckpoints)
        .where(
          and(
            eq(aurionWorldCheckpoints.worldId, checkpoint.worldId),
            eq(aurionWorldCheckpoints.worldRevision, checkpoint.worldRevision),
            eq(aurionWorldCheckpoints.chunkRevision, checkpoint.chunkRevision),
          ),
        )
        .limit(1)
    )[0];

    if (byRevision) {
      throw new Error("Aurion world checkpoint revision pair already belongs to another epoch");
    }

    await tx.insert(aurionWorldCheckpoints).values({
      id: checkpoint.id,
      worldId: checkpoint.worldId,
      worldSeed: checkpoint.worldSeed,
      epoch: checkpoint.epoch,
      worldRevision: checkpoint.worldRevision,
      chunkRevision: checkpoint.chunkRevision,
      snapshotHash: checkpoint.snapshotHash,
      snapshotJson: checkpoint.snapshotJson,
      idempotencyKey: checkpoint.idempotencyKey,
    });

    return {
      source: "created" as const,
      checkpoint: toAurionWorldCheckpointReadModel(checkpoint),
    };
  });
}
