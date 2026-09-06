import { eq } from "drizzle-orm";
import { playerProfiles, weaponLoadouts } from "../drizzle/schema";
import { ax1PlayerBaseMaxHealth, ax1StarterWeaponBonus } from "./ax1CombatProjection";
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
  // AX1 defines the new-character starter weapon. This insert is idempotent and
  // never overwrites an explicit later loadout choice.
  await db.insert(weaponLoadouts).values({userId:ticket.userId,weaponTrack:"blade"}).onDuplicateKeyUpdate({set:{userId:ticket.userId}});
  const loadout=(await db.select().from(weaponLoadouts).where(eq(weaponLoadouts.userId,ticket.userId)).limit(1))[0];
  const selectedClass=profile.selectedClass;
  const blade=loadout?.weaponTrack==="blade";
  return Object.freeze({...ticket,combatProfile:Object.freeze({combatLevel:profile.level,maxHealth:ax1PlayerBaseMaxHealth(selectedClass,blade),weaponBonus:ax1StarterWeaponBonus(loadout?.weaponTrack)})});
}
