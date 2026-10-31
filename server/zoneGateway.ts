import { clientVerificationRegistry } from "./causality/clientVerificationRegistry";
import type { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { isAllowedZoneOrigin, parseZoneAttack, parseZoneHello, parseZoneMove, parseZoneSkill, ZONE_TICK_MS, type ZoneReject, type ZoneId } from "./zoneProtocol";
import { WORLD_PRESENCE_REFRESH_MS } from "./worldPresenceProtocol";
import { globalZoneRegistry, ZoneRegistry, type AuthoritativeMovementZone, type ZoneCombatProfile } from "./zoneRuntime";
import { ZonePresenceLifecycle } from "./zonePresenceLifecycle";
import { ZONE_PROTOCOL_VERSION } from "@shared/zonePresenceContract";
import { globalCausalPersistence } from "./causality/persistence";
import { globalTickRecorder } from "./causality/tickRecorder";
import { restorePersistedZoneHead } from "./causality/persistedZoneRecovery";

const HELLO_TIMEOUT_MS=5_000;const MAX_MESSAGE_BYTES=2_048;
// Give the Godot WebSocketPeer event loop time to surface the typed version
// rejection BEFORE sending the policy-close frame. No ticket is consumed here.
const PROTOCOL_REJECT_GRACE_MS=250;
export type ZoneTicketReceipt={userId:number;zoneId:"observatory_threshold";clientBuild:string;expiresAt:Date;combatProfile?:ZoneCombatProfile};
export type ZoneTicketConsumer=(values:{ticket:string;zoneId:"observatory_threshold"})=>Promise<ZoneTicketReceipt|undefined>;
export type WorldPresenceSink={upsert(values:{userId:number;connectionId:string;zoneId:"observatory_threshold";position:{x:number;z:number}}):Promise<unknown>;release(values:{connectionId:string}):Promise<unknown>;};
export type ZoneFixedTickSink={intervalTicks:number;observe(values:{tick:number}):Promise<unknown>;};
export type ZoneRecoveryResolver=(zoneId:ZoneId)=>Promise<AuthoritativeMovementZone>;
function closePolicyViolation(socket:WebSocket):void{socket.close(1008,"zone authorization rejected");}
function parseMessage(data:WebSocket.RawData):unknown{if(typeof data==="string")return JSON.parse(data);if(Array.isArray(data))return JSON.parse(Buffer.concat(data).toString("utf8"));if(data instanceof ArrayBuffer)return JSON.parse(Buffer.from(new Uint8Array(data)).toString("utf8"));return JSON.parse(data.toString("utf8"));}
function rejectZoneInput(socket:WebSocket,code:ZoneReject["code"]):void{socket.send(JSON.stringify({type:"reject",code} satisfies ZoneReject));}
function rejectUnsupportedZoneVersion(socket:WebSocket):void{
  rejectZoneInput(socket,"PROTOCOL_VERSION_UNSUPPORTED");
  const grace=setTimeout(()=>{if(socket.readyState===WebSocket.OPEN)closePolicyViolation(socket);},PROTOCOL_REJECT_GRACE_MS);
  grace.unref();
}

/** `/v1/ws` is Aurion's live gameplay transport. AX1/WASD are historical provenance only; legacy tRPC/MCP encounter routes are not consulted. */
export function registerZoneGateway(server:HttpServer,registry:ZoneRegistry=globalZoneRegistry,consumeTicket:ZoneTicketConsumer,worldPresence?:WorldPresenceSink,fixedTick?:ZoneFixedTickSink,recoverZone:ZoneRecoveryResolver=(zoneId)=>restorePersistedZoneHead(zoneId,globalCausalPersistence,globalTickRecorder)){
  if(fixedTick&&(!Number.isSafeInteger(fixedTick.intervalTicks)||fixedTick.intervalTicks<1))throw new Error("ZONE_FIXED_TICK_INTERVAL_INVALID");
  const wss=new WebSocketServer({noServer:true,maxPayload:MAX_MESSAGE_BYTES});const observationConnections=new Set<string>();const presenceObservers=new Set<()=>void>();let gatewayTick=0;let fixedTickChain:Promise<void>=Promise.resolve();let isTicking=false;
  const tickTimer=setInterval(async()=>{
    if(isTicking)return;
    isTicking=true;
    try{registry.tick();}catch(error){console.error("[Aurion Zone] Registry tick failed",error);}
    isTicking=false;
    gatewayTick+=1;
    presenceObservers.forEach(observe=>observe());
    if(fixedTick&&gatewayTick%fixedTick.intervalTicks===0){const tick=gatewayTick;const run=fixedTickChain.then(()=>fixedTick.observe({tick})).then(()=>undefined);fixedTickChain=run.catch(error=>console.error("[Aurion Zone] Fixed-tick sink failed",error));}},ZONE_TICK_MS);
  server.on("upgrade",(request,socket,head)=>{const pathname=new URL(request.url??"/","http://localhost").pathname;if(pathname!=="/v1/ws"){socket.destroy();return;}if(!isAllowedZoneOrigin(request.headers.origin)){socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");socket.destroy();return;}wss.handleUpgrade(request,socket,head,webSocket=>wss.emit("connection",webSocket,request));});
  wss.on("connection",(socket:WebSocket,_request:IncomingMessage)=>{
    // ws emits an error on this socket for oversized frames (1009). Without
    // a listener Node treats that per-peer protocol fault as a fatal process error.
    socket.on("error",(error:Error)=>{
      console.warn("[Aurion Zone] WebSocket peer error:",error.message);
      socket.terminate();
    });
    const helloTimeout=setTimeout(()=>closePolicyViolation(socket),HELLO_TIMEOUT_MS);socket.once("close",()=>clearTimeout(helloTimeout));socket.once("message",async(data,isBinary)=>{
    clearTimeout(helloTimeout);if(isBinary)return closePolicyViolation(socket);let raw:unknown;try{raw=parseMessage(data);}catch{return closePolicyViolation(socket);}const hello=parseZoneHello(raw);if(!hello){
      if(raw&&typeof raw==="object"&&(raw as {type?:unknown}).type==="hello"&&(raw as {protocolVersion?:unknown}).protocolVersion!==ZONE_PROTOCOL_VERSION){rejectUnsupportedZoneVersion(socket);return;}
      return closePolicyViolation(socket);
    }
    try{const ticket=await consumeTicket({ticket:hello.ticket,zoneId:hello.zoneId});if(socket.readyState!==WebSocket.OPEN)return;if(!ticket)return closePolicyViolation(socket);const zone=await registry.getOrRecover(ticket.zoneId,recoverZone);const welcome=zone.join({userId:ticket.userId,socket,combatProfile:ticket.combatProfile});clientVerificationRegistry.open(ticket.userId,welcome.connectionId);observationConnections.add(welcome.connectionId);const presence=worldPresence?new ZonePresenceLifecycle(worldPresence,{userId:ticket.userId,connectionId:welcome.connectionId,zoneId:ticket.zoneId}):undefined;let refreshTimer:ReturnType<typeof setInterval>|undefined;
      const onPresenceFailure=(error:unknown)=>{console.error("[Aurion Zone] Presence lease refresh failed",error);closePolicyViolation(socket);};const observePresence=()=>{const position=zone.positionForConnection(welcome.connectionId);if(position)void presence?.observe(position)?.catch(onPresenceFailure);};
      socket.once("close",()=>{clientVerificationRegistry.close(welcome.connectionId);observationConnections.delete(welcome.connectionId);if(refreshTimer)clearInterval(refreshTimer);presenceObservers.delete(observePresence);zone.leave(welcome.connectionId);void presence?.close().catch(error=>console.error("[Aurion Zone] Presence lease release failed",error));});
      const initialPosition=zone.positionForConnection(welcome.connectionId);if(!initialPosition){zone.leave(welcome.connectionId);return closePolicyViolation(socket);}try{await presence?.refresh(initialPosition);}catch(error){zone.leave(welcome.connectionId);console.error("[Aurion Zone] Presence lease registration failed",error);return closePolicyViolation(socket);}if(socket.readyState!==WebSocket.OPEN)return;if(presence)presenceObservers.add(observePresence);socket.send(JSON.stringify(welcome));
      socket.on("message",(nextData,nextBinary)=>{if(nextBinary)return rejectZoneInput(socket,"INVALID_MESSAGE");let nextRaw:unknown;try{nextRaw=parseMessage(nextData);}catch{return rejectZoneInput(socket,"INVALID_MESSAGE");}
        const move=parseZoneMove(nextRaw);if(move){const result=zone.submitMovement(welcome.connectionId,move);if(result==="stale")return rejectZoneInput(socket,"STALE_CLIENT_SEQUENCE");if(result==="missing")closePolicyViolation(socket);return;}
        const attack=parseZoneAttack(nextRaw);if(attack){const result=zone.submitAttack(welcome.connectionId,attack);if(result==="stale")return rejectZoneInput(socket,"STALE_CLIENT_SEQUENCE");if(result==="missing")return closePolicyViolation(socket);if(result==="invalid_target")return rejectZoneInput(socket,"INVALID_COMBAT_TARGET");if(result==="out_of_range")return rejectZoneInput(socket,"COMBAT_TARGET_OUT_OF_RANGE");if(result==="dead")return rejectZoneInput(socket,"COMBATANT_DEAD");if(result==="cooldown")return rejectZoneInput(socket,"COMBAT_SKILL_COOLDOWN");return;}
        const skill=parseZoneSkill(nextRaw);if(skill){const result=zone.submitSkill(welcome.connectionId,skill);if(result==="stale")return rejectZoneInput(socket,"STALE_CLIENT_SEQUENCE");if(result==="missing")return closePolicyViolation(socket);if(result==="invalid_skill")return rejectZoneInput(socket,"INVALID_COMBAT_SKILL");if(result==="cooldown")return rejectZoneInput(socket,"COMBAT_SKILL_COOLDOWN");if(result==="invalid_target")return rejectZoneInput(socket,"INVALID_COMBAT_TARGET");if(result==="out_of_range")return rejectZoneInput(socket,"COMBAT_TARGET_OUT_OF_RANGE");if(result==="dead")return rejectZoneInput(socket,"COMBATANT_DEAD");return;}
        rejectZoneInput(socket,typeof nextRaw==="object"&&nextRaw!==null&&["move","attack","skill"].includes(String((nextRaw as {type?:unknown}).type))?"INVALID_MESSAGE":"UNSUPPORTED_ZONE_COMMAND");
      });
      refreshTimer=presence?setInterval(()=>{const position=zone.positionForConnection(welcome.connectionId);if(!position)return;void presence.refresh(position).catch(error=>{console.error("[Aurion Zone] Presence lease refresh failed",error);closePolicyViolation(socket);});},WORLD_PRESENCE_REFRESH_MS):undefined;
    }catch(error){console.error("[Aurion Zone] Ticket handshake failed",error);closePolicyViolation(socket);}
  });});
  return{registry,close:()=>{for(const id of observationConnections)clientVerificationRegistry.close(id);observationConnections.clear();clearInterval(tickTimer);presenceObservers.clear();wss.close();}};
}
