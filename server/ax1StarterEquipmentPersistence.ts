import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { aurionAx1StarterEquipmentReceipts, aurionAx1StarterEquipmentStates } from "../drizzle/ax1StarterEquipmentSchema";
import { aurionEquipmentSlots, playerProfiles } from "../drizzle/schema";
import {
  AX1_GAME_SOURCE_REVISION,
  AX1_STARTER_BLADE_ATTACK_BONUS,
  AX1_STARTER_BLADE_ITEM_ID,
  AX1_STARTER_BLADE_MAX_HP_BONUS,
  AX1_STARTER_BLADE_NAME,
  AX1_STARTER_SOURCE_GIT_BLOB_SHA,
  AX1_STARTER_SOURCE_PATH,
} from "./ax1CombatProjection";
import { getDb } from "./db";

export const AX1_STARTER_ITEM_RECORD_VERSION = "ax1_starter" as const;
export const AX1_STARTER_ITEM_SLOT = "main_hand" as const;
export const AX1_STARTER_ITEM_QUALITY = "normal" as const;
export const AX1_STARTER_ITEM_LEVEL_EXACT = "1" as const;

const projectedDefinition = Object.freeze({
  definitionId: AX1_STARTER_BLADE_ITEM_ID,
  name: AX1_STARTER_BLADE_NAME,
  slot: AX1_STARTER_ITEM_SLOT,
  quality: AX1_STARTER_ITEM_QUALITY,
  levelExact: AX1_STARTER_ITEM_LEVEL_EXACT,
  stats: Object.freeze({ attack: AX1_STARTER_BLADE_ATTACK_BONUS, maxHealth: AX1_STARTER_BLADE_MAX_HP_BONUS }),
  source: Object.freeze({
    revision: AX1_GAME_SOURCE_REVISION,
    blobSha: AX1_STARTER_SOURCE_GIT_BLOB_SHA,
    path: AX1_STARTER_SOURCE_PATH,
  }),
});

export const AX1_STARTER_BLADE_CONTENT_SHA256 = createHash("sha256")
  .update(JSON.stringify(projectedDefinition))
  .digest("hex");

export function ax1StarterItemId(userId: number): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("AX1_STARTER_USER_INVALID");
  return `ax1_starter_blade:${userId}`;
}

export function ax1StarterReceiptId(userId: number): string {
  if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error("AX1_STARTER_USER_INVALID");
  return createHash("sha256")
    .update([
      "ax1-starter-equipment.v1",
      userId,
      AX1_STARTER_BLADE_ITEM_ID,
      AX1_GAME_SOURCE_REVISION,
      AX1_STARTER_SOURCE_GIT_BLOB_SHA,
      AX1_STARTER_BLADE_CONTENT_SHA256,
    ].join("|"))
    .digest("hex");
}

export function assertCurrentAx1StarterReceipt(row: typeof aurionAx1StarterEquipmentReceipts.$inferSelect): void {
  if (
    row.definitionId !== AX1_STARTER_BLADE_ITEM_ID ||
    row.sourceRevision !== AX1_GAME_SOURCE_REVISION ||
    row.sourceBlobSha !== AX1_STARTER_SOURCE_GIT_BLOB_SHA ||
    row.sourcePath !== AX1_STARTER_SOURCE_PATH ||
    row.contentSha256 !== AX1_STARTER_BLADE_CONTENT_SHA256
  ) throw new Error("AX1_STARTER_SOURCE_DRIFT");
}

export type Ax1StarterEquipmentProjection = Readonly<{
  itemId: string;
  receiptId: string;
  status: "owned" | "equipped";
}>;

/**
 * Idempotently materialize the AX1-defined starter blade for one persisted Aurion player.
 * Aurion stores only source provenance and ownership/equipment projection. The item definition
 * and combat numbers stay owned by the pinned AX1 source projection.
 */
export async function ensureAx1StarterEquipment(userId: number): Promise<Ax1StarterEquipmentProjection> {
  const itemId = ax1StarterItemId(userId);
  const receiptId = ax1StarterReceiptId(userId);
  const db = await getDb();
  if (!db) throw new Error("DATABASE_UNAVAILABLE");

  return db.transaction(async tx => {
    const profile = (await tx.select().from(playerProfiles).where(eq(playerProfiles.userId, userId)).for("update"))[0];
    if (!profile) throw new Error("PLAYER_PROFILE_REQUIRED");

    await tx.insert(aurionAx1StarterEquipmentReceipts).values({
      id: receiptId,
      userId,
      definitionId: AX1_STARTER_BLADE_ITEM_ID,
      sourceRevision: AX1_GAME_SOURCE_REVISION,
      sourceBlobSha: AX1_STARTER_SOURCE_GIT_BLOB_SHA,
      sourcePath: AX1_STARTER_SOURCE_PATH,
      contentSha256: AX1_STARTER_BLADE_CONTENT_SHA256,
    }).onDuplicateKeyUpdate({ set: { id: receiptId } });

    const receipt = (await tx.select().from(aurionAx1StarterEquipmentReceipts).where(eq(aurionAx1StarterEquipmentReceipts.id, receiptId)).limit(1))[0];
    if (!receipt || receipt.userId !== userId) throw new Error("AX1_STARTER_RECEIPT_MISSING");
    assertCurrentAx1StarterReceipt(receipt);

    let state = (await tx.select().from(aurionAx1StarterEquipmentStates).where(eq(aurionAx1StarterEquipmentStates.userId, userId)).for("update"))[0];
    if (state) {
      if (state.receiptId !== receiptId) throw new Error("AX1_STARTER_SOURCE_DRIFT");
      return Object.freeze({ itemId, receiptId, status: state.status });
    }

    const occupiedMainHand = (await tx.select().from(aurionEquipmentSlots).where(and(
      eq(aurionEquipmentSlots.userId, userId),
      eq(aurionEquipmentSlots.slot, AX1_STARTER_ITEM_SLOT),
    )).for("update"))[0];
    const status = occupiedMainHand ? "owned" : "equipped";

    await tx.insert(aurionAx1StarterEquipmentStates).values({ userId, receiptId, status })
      .onDuplicateKeyUpdate({ set: { userId } });
    state = (await tx.select().from(aurionAx1StarterEquipmentStates).where(eq(aurionAx1StarterEquipmentStates.userId, userId)).for("update"))[0];
    if (!state || state.receiptId !== receiptId) throw new Error("AX1_STARTER_STATE_CONFLICT");
    return Object.freeze({ itemId, receiptId, status: state.status });
  });
}
