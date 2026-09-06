import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { ZONE_PROTOCOL_VERSION } from "@shared/zonePresenceContract";
import type { ConfirmedZoneMob } from "@shared/zoneMobContract";
import type { ConfirmedZoneCombatant, ConfirmedZoneCombatEvent } from "@shared/zoneCombatContract";

export const zoneIdSchema=z.literal("observatory_threshold");
export type ZoneId=z.infer<typeof zoneIdSchema>;
export const ZONE_FIXED_POINT_SCALE=1_000;
export const ZONE_TICK_MS=100;
export const zoneHelloSchema=z.object({type:z.literal("hello"),ticket:z.string().min(24).max(160),zoneId:zoneIdSchema,protocolVersion:z.literal(ZONE_PROTOCOL_VERSION)});
export type ZoneHello=z.infer<typeof zoneHelloSchema>;
export const zoneMoveSchema=z.object({type:z.literal("move"),clientSeq:z.number().int().min(1).max(2_147_483_647),input:z.object({x:z.number().int().min(-1).max(1),z:z.number().int().min(-1).max(1)})});
export type ZoneMove=z.infer<typeof zoneMoveSchema>;
export const zoneAttackSchema=z.object({type:z.literal("attack"),clientSeq:z.number().int().min(1).max(2_147_483_647),targetEntityId:z.string().regex(/^mob_[1-9][0-9]{0,2}$/)});
export type ZoneAttack=z.infer<typeof zoneAttackSchema>;
export type ZonePosition={x:number;z:number};
export type ZonePresence={entityId:string;userId:number;position:ZonePosition;lastAcceptedClientSeq:number};
export type ZoneWelcome={type:"welcome";protocolVersion:typeof ZONE_PROTOCOL_VERSION;connectionId:string;selfEntityId:string;zoneId:ZoneId;snapshotSeq:number;tick:number;presences:ZonePresence[];mobs:readonly ConfirmedZoneMob[];combatants:readonly ConfirmedZoneCombatant[]};
export type ZoneSnapshot={type:"snapshot";zoneId:ZoneId;snapshotSeq:number;tick:number;presences:ZonePresence[];mobs:readonly ConfirmedZoneMob[];combatants:readonly ConfirmedZoneCombatant[]};
export type ZoneReject={type:"reject";code:"INVALID_MESSAGE"|"STALE_CLIENT_SEQUENCE"|"UNSUPPORTED_ZONE_COMMAND"|"PROTOCOL_VERSION_UNSUPPORTED"|"INVALID_COMBAT_TARGET"|"COMBAT_TARGET_OUT_OF_RANGE"|"COMBATANT_DEAD"};
export type ZoneServerMessage=ZoneWelcome|ZoneSnapshot|ZoneReject|ConfirmedZoneCombatEvent;
export function createZoneTicket():string{return `aurion_zone_${randomBytes(32).toString("base64url")}`;}
export function digestZoneTicket(ticket:string):string{return createHash("sha256").update(ticket).digest("hex");}
export function parseZoneHello(value:unknown):ZoneHello|null{const parsed=zoneHelloSchema.safeParse(value);return parsed.success?parsed.data:null;}
export function parseZoneMove(value:unknown):ZoneMove|null{const parsed=zoneMoveSchema.safeParse(value);return parsed.success?parsed.data:null;}
export function parseZoneAttack(value:unknown):ZoneAttack|null{const parsed=zoneAttackSchema.safeParse(value);return parsed.success?parsed.data:null;}
export function isAllowedZoneOrigin(origin:string|undefined,environment=process.env.NODE_ENV):boolean{if(!origin)return false;try{const url=new URL(origin);const localhost=url.hostname==="localhost"||url.hostname==="127.0.0.1";if(localhost)return url.protocol==="http:"||url.protocol==="https:";if(url.protocol!=="https:")return false;if(url.hostname==="arelogic.space")return true;return environment==="development"&&url.hostname.endsWith(".manus.computer");}catch{return false;}}
export function makeZoneConnectionId():string{return `zone_peer_${randomBytes(12).toString("base64url")}`;}
