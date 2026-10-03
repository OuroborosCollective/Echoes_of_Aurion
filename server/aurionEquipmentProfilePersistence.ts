import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { aurionEquipmentProfileReceipts, aurionEquipmentSlots, playerProfiles, weaponLoadouts } from "../drizzle/schema";
import { aurionAx1StarterEquipmentReceipts, aurionAx1StarterEquipmentStates } from "../drizzle/ax1StarterEquipmentSchema";
import { equipmentRevisionSchema, sealEquipmentMutation, verifyEquipmentMutation, type EquipmentMutation, type EquipmentMutationReceipt } from "../shared/aurionEquipmentProfileContract";
import { getDb } from "./db";
import { assertCurrentAx1StarterReceipt } from "./ax1StarterEquipmentPersistence";
import { ax1PlayerBaseMaxHealth, ax1StarterWeaponBonus } from "./ax1CombatProjection";
import type { UiTransaction } from "./playerUiPersistence";
import type { CanonicalZoneState } from "./causality/zoneCanonicalState";
import type { AurionZoneIntent } from "../shared/aurionZoneIntentContract";
import type { AurionCausalTickReceipt } from "../shared/aurionCausalTickContract";
import { hashCanonicalZoneState } from "./causality/zoneCanonicalState";

export async function readEquipmentCombatProfile(tx: UiTransaction, userId: number) {
  const player = (await tx.select().from(playerProfiles).where(eq(playerProfiles.userId, userId)).for("update"))[0];
  if (!player) throw new Error("PLAYER_PROFILE_REQUIRED");
  const loadout = (await tx.select().from(weaponLoadouts).where(eq(weaponLoadouts.userId, userId)))[0];
  const starter = (await tx.select().from(aurionAx1StarterEquipmentStates).where(eq(aurionAx1StarterEquipmentStates.userId, userId)))[0];
  if (starter) {
    const provenance = (await tx.select().from(aurionAx1StarterEquipmentReceipts).where(eq(aurionAx1StarterEquipmentReceipts.id, starter.receiptId)))[0];
    if (!provenance || provenance.userId !== userId) throw new Error("AX1_STARTER_RECEIPT_MISSING");
    assertCurrentAx1StarterReceipt(provenance);
  }
  const mainHand = (await tx.select().from(aurionEquipmentSlots).where(and(eq(aurionEquipmentSlots.userId, userId), eq(aurionEquipmentSlots.slot, "main_hand"))))[0];
  const starterEquipped = starter?.status === "equipped";
  if (starterEquipped && mainHand) throw new Error("AX1_STARTER_EQUIPMENT_CONFLICT");
  const revision = equipmentRevisionSchema.parse(player.equipmentRevisionExact);
  const row = revision === "0" ? undefined : (await tx.select().from(aurionEquipmentProfileReceipts).where(and(eq(aurionEquipmentProfileReceipts.userId, userId), eq(aurionEquipmentProfileReceipts.revisionExact, revision))))[0];
  if (revision !== "0" && !row) throw new Error("EQUIPMENT_REVISION_RECEIPT_MISSING");
  if (row) readReceiptRow(row);
  return {
    combatLevel: player.level, weaponTrack: loadout?.weaponTrack ?? "blade" as const,
    maxHealth: ax1PlayerBaseMaxHealth(player.selectedClass, Boolean(starterEquipped)),
    weaponBonus: starterEquipped ? ax1StarterWeaponBonus(loadout?.weaponTrack ?? "blade") : 0,
    weaponEquipped: Boolean(starterEquipped || mainHand),
    equipmentRevisionExact: revision, equipmentReceiptHash: row?.receiptHash ?? null,
  };
}
function readReceiptRow(row: typeof aurionEquipmentProfileReceipts.$inferSelect): EquipmentMutationReceipt {
  const receipt = verifyEquipmentMutation({ id: row.id, hash: row.receiptHash, mutation: JSON.parse(row.mutationJson) });
  if (receipt.mutation.userId !== row.userId || receipt.mutation.revisionExact !== row.revisionExact) throw new Error("EQUIPMENT_RECEIPT_IDENTITY_MISMATCH");
  return receipt;
}
export async function persistEquipmentMutation(tx: UiTransaction, mutation: EquipmentMutation): Promise<string> {
  const receipt = sealEquipmentMutation(mutation);
  await tx.insert(aurionEquipmentProfileReceipts).values({ id: receipt.id, userId: mutation.userId, revisionExact: mutation.revisionExact, receiptHash: receipt.hash, mutationJson: JSON.stringify(receipt.mutation) });
  const updated = await tx.update(playerProfiles).set({ equipmentRevisionExact: mutation.revisionExact }).where(and(eq(playerProfiles.userId, mutation.userId), eq(playerProfiles.equipmentRevisionExact, mutation.previousRevisionExact)));
  if (updated[0].affectedRows !== 1) throw new Error("EQUIPMENT_REVISION_STALE");
  return receipt.id;
}

/** Delivery is retriable; acknowledgment belongs to the durable causal tick, never enqueue. */
export async function enqueuePendingEquipmentProfiles(userId: number): Promise<boolean> {
  const zone = (await import("./zoneRuntime")).globalZoneRegistry.get("observatory_threshold");
  if (!zone.connectionIdForUser(userId)) return false;
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  const rows = await db.select().from(aurionEquipmentProfileReceipts).where(and(eq(aurionEquipmentProfileReceipts.userId, userId), isNull(aurionEquipmentProfileReceipts.appliedCausalReceiptHash)))
    .orderBy(sql`length(${aurionEquipmentProfileReceipts.revisionExact})`, asc(aurionEquipmentProfileReceipts.revisionExact)).limit(100);
  for (const row of rows) zone.enqueueEquipmentProfile(readReceiptRow(row));
  return true;
}
export async function drainEquipmentProfileOutbox(): Promise<void> {
  const zone = (await import("./zoneRuntime")).globalZoneRegistry.get("observatory_threshold");
  // Query by active owner: disconnected backlogs cannot starve connected players.
  for (const player of zone.getCanonicalZoneState().players) await enqueuePendingEquipmentProfiles(player.userId);
}
export async function confirmEquipmentProfile(userId: number, receiptId: string | null): Promise<void> {
  if (!receiptId || !await enqueuePendingEquipmentProfiles(userId)) return;
  const db = await getDb(); if (!db) throw new Error("DATABASE_UNAVAILABLE");
  // Operational wait only: the independent zone scheduler remains the sole tick driver.
  for (let attempt = 0; attempt < 100; attempt++) {
    const row = (await db.select().from(aurionEquipmentProfileReceipts).where(and(eq(aurionEquipmentProfileReceipts.id, receiptId), eq(aurionEquipmentProfileReceipts.userId, userId))))[0];
    if (row?.appliedCausalReceiptHash) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error(`EQUIPMENT_COMMITTED_PROJECTION_PENDING:${receiptId}`);
}

export async function acknowledgeEquipmentProfiles(tx: UiTransaction, receipt: AurionCausalTickReceipt, intents: readonly AurionZoneIntent[], postState?: CanonicalZoneState): Promise<void> {
  const equipment = intents.filter(intent => intent.type === "equipment_profile");
  if (!equipment.length) return;
  if (!postState || hashCanonicalZoneState(postState) !== receipt.postStateHash) throw new Error("EQUIPMENT_CAUSAL_POST_STATE_REQUIRED");
  for (const intent of equipment) {
    const source = verifyEquipmentMutation(intent.receipt);
    const row = (await tx.select().from(aurionEquipmentProfileReceipts).where(eq(aurionEquipmentProfileReceipts.id, source.id)).for("update"))[0];
    if (!row || readReceiptRow(row).hash !== source.hash) throw new Error("EQUIPMENT_CAUSAL_SOURCE_MISSING");
    const player = postState.players.find(player => player.userId === source.mutation.userId);
    if (!player || BigInt(player.equipmentRevisionExact ?? "0") < BigInt(source.mutation.revisionExact)) continue;
    if (player.equipmentRevisionExact === source.mutation.revisionExact && player.equipmentReceiptHash !== source.hash) throw new Error("EQUIPMENT_CAUSAL_BINDING_MISMATCH");
    if (!row.appliedCausalReceiptHash) await tx.update(aurionEquipmentProfileReceipts).set({ appliedCausalReceiptHash: receipt.receiptHash }).where(eq(aurionEquipmentProfileReceipts.id, source.id));
  }
}
