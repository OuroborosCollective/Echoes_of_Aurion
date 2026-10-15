import { eq } from "drizzle-orm";
import { weaponLoadouts } from "../drizzle/schema";
import { ax1PlayerBaseMaxHealth, ax1StarterWeaponBonus } from "./ax1CombatProjection";
import { ensureAx1StarterEquipment } from "./ax1StarterEquipmentPersistence";
import { acegItemIdentity, scaleAcegEquipmentStat } from "./aurionAcegEquipmentAuthority";
import { readPlayerAcegEquipment } from "./playerUiPersistence";
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
  await ensureAx1StarterEquipment(ticket.userId);
  const aceg=await readPlayerAcegEquipment(ticket.userId);
  const mainHand=aceg.items.find(item=>item.slot==="main_hand");
  const decision=mainHand?aceg.resolution.equipDecisions.find(entry=>entry.itemId===acegItemIdentity(mainHand)):undefined;
  if(mainHand&&!decision)throw new Error("ZONE_ACEG_EQUIPMENT_DECISION_MISSING");
  const baseWeaponBonus=mainHand?(mainHand.stats.power??mainHand.stats.attack??0):0;
  const weaponBonus=mainHand&&decision?scaleAcegEquipmentStat(baseWeaponBonus,decision.effectivenessBps):0;
  // Previously only local visual code applied these two attribute effects.
  // Server-authoritative ACEG capabilities now supply only confirmed allocations.
  const bonusStrength=BigInt(aceg.resolution.capabilities.strength??0);
  const bonusDefense=BigInt(aceg.resolution.capabilities.defense??0);
  const strengthDamage=bonusStrength*7n/2n;
  const defenseHealth=bonusDefense*22n;
  const safeAdd=(base:number,bonus:bigint)=>{
    const result=BigInt(base)+bonus;
    if(result>BigInt(Number.MAX_SAFE_INTEGER)||result<0n)throw new Error("AURION_STAT_COMBAT_OVERFLOW");
    return Number(result);
  };
  const starterEquipped=mainHand?.version==="ax1_starter";
  const selectedClass=profile.selectedClass;
  return Object.freeze({...ticket,combatProfile:Object.freeze({
    combatLevel:profile.level,
    maxHealth:safeAdd(ax1PlayerBaseMaxHealth(selectedClass,starterEquipped),defenseHealth),
    weaponBonus:safeAdd(starterEquipped?ax1StarterWeaponBonus(loadout.weaponTrack):weaponBonus,strengthDamage),
    weaponTrack:loadout.weaponTrack,
    weaponEquipped:Boolean(mainHand),
  })});
}
