import { eq } from "drizzle-orm";
import { weaponLoadouts } from "../drizzle/schema";
import { ax1PlayerBaseMaxHealth, ax1StarterWeaponBonus } from "./ax1CombatProjection";
import { ensureAx1StarterEquipment } from "./ax1StarterEquipmentPersistence";
import { consumeZoneConnectionTicket, getDb, getOrCreatePlayerProfile } from "./db";
import type { ZoneTicketReceipt } from "./zoneGateway";

/**
 * Aurion-only responsibility: authenticate ticket, persist/read account state,
 * then project it into the AX1/WASD runtime. No combat or quest decision lives here.
 */
export async function consumeZoneTicketWithCombatProfile(values:{ticket:string;zoneId:"observatory_threshold"}):Promise<ZoneTicketReceipt|undefined>{
  const ticket=await consumeZoneConnectionTicket(values);if(!ticket)return undefined;
  const db=await getDb();if(!db)throw new Error("ZONE_COMBAT_DATABASE_UNAVAILABLE");
  const profile=await getOrCreatePlayerProfile(ticket.userId);
  // AX1 defines blade as the new-character starter track. This insert initializes the
  // mastery/control track only and never overwrites an explicit later player choice.
  await db.insert(weaponLoadouts).values({userId:ticket.userId,weaponTrack:"blade"}).onDuplicateKeyUpdate({set:{userId:ticket.userId}});
  const loadout=(await db.select({weaponTrack:weaponLoadouts.weaponTrack}).from(weaponLoadouts).where(eq(weaponLoadouts.userId,ticket.userId)).limit(1))[0];
  if(!loadout)throw new Error("ZONE_WEAPON_LOADOUT_UNAVAILABLE");
  const starter=await ensureAx1StarterEquipment(ticket.userId);
  const starterEquipped=starter.status==="equipped";
  const selectedClass=profile.selectedClass;
  return Object.freeze({...ticket,combatProfile:Object.freeze({
    combatLevel:profile.level,
    maxHealth:ax1PlayerBaseMaxHealth(selectedClass,starterEquipped),
    weaponBonus:starterEquipped?ax1StarterWeaponBonus(loadout.weaponTrack):0,
    weaponTrack:loadout.weaponTrack,
  })});
}
