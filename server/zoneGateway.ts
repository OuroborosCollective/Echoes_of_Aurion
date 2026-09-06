import type { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { isAllowedZoneOrigin, parseZoneAttack, parseZoneHello, parseZoneMove, ZONE_TICK_MS, type ZoneReject } from "./zoneProtocol";
import { WORLD_PRESENCE_REFRESH_MS } from "./worldPresenceProtocol";
import { ZoneRegistry, type ZoneCombatProfile } from "./zoneRuntime";
import { ZonePresenceLifecycle } from "./zonePresenceLifecycle";
import { ZONE_PROTOCOL_VERSION } from "@shared/zonePresenceContract";

const HELLO_TIMEOUT_MS=5_000;const MAX_MESSAGE_BYTES=2_048;
export type ZoneTicketReceipt={userId:number;zoneId:"observatory_threshold";clientBuild:string;expiresAt:Date;combatProfile?:ZoneCombatProfile};
export type ZoneTicketConsumer=(values:{ticket:string;zoneId:"observatory_threshold"})=>Promise<ZoneTicketReceipt|undefined>;
export type WorldPresenceSink={upsert(values:{userId:number;connectionId:string;zoneId:"observatory_threshold";position:{x:number;z:number}}):Promise<unknown>;release(values:{connectionId:string}):Promise<unknown>;};
export type ZoneFixedTickSink={intervalTicks:number;observe(values:{tick:number}):Promise<unknown>;};
function closePolicyViolation(socket:WebSocket):void{socket.close(1008,"zone authorization rejected");}
function parseMessage(data:WebSocket.RawData):unknown{if(typeof data==="string")return JSON.parse(data);if(Array.isArray(data))return JSON.parse(Buffer.concat(data).toString("utf8"));if(data instanceof ArrayBuffer)return JSON.parse(Buffer.from(new Uint8Array(data)).toString("utf8"));return JSON.parse(data.toString("utf8"));}
function rejectZoneInput(socket:WebSocket,code:ZoneReject["code"]):void{socket.send(JSON.stringify({type:"reject",code} satisfies ZoneReject));}

/** `/v1/ws` is the live AX1/WASD gameplay transport. tRPC/MCP legacy encounter routes are not consulted. */
export function registerZoneGateway(server:HttpServer,registry:ZoneRegistry=new ZoneRegistry(),consumeTicket:ZoneTicketConsumer,worldPresence?:WorldPresenceSink,fixedTick?:ZoneFixedTickSink){
  if(fixedTick&&(!Number.isSafeInteger(fixedTick.intervalTicks)||fixedTick.intervalTicks<1))throw new Error("ZONE_FIXED_TICK_INTERVAL_INVALID");
  const wss=new WebSocketServer({noServer:true,maxPayload:MAX_MESSAGE_BYTES});const presenceObservers=new Set<()=>void>();let gatewayTick=0;let fixedTickChain:Promise<void>=Promise.resolve();
  const tickTimer=setInterval(()=>{registry.tick();gatewayTick+=1;presenceObservers.forEach(observe=>observe());if(fixedTick&&gatewayTick%fixedTick.intervalTicks===0){const tick=gatewayTick;const run=fixedTickChain.then(()=>fixedTick.observe({tick})).then(()=>undefined);fixedTickChain=run.catch(error=>console.error("[Aurion Zone] Fixed-tick sink failed",error));}},ZONE_TICK_MS);
  server.on("upgrade",(request,socket,head)=>{const pathname=new URL(request.url??"/","http://localhost").pathname;if(pathname!=="/v1/ws")return;if(!isAllowedZoneOrigin(request.headers.origin)){socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");socket.destroy();return;}wss.handleUpgrade(request,socket,head,webSocket=>wss.emit("connection",webSocket,request));});
  wss.on("connection",(socket:WebSocket,_request:IncomingMessage)=>{const helloTimeout=setTimeout(()=>closePolicyViolation(socket),HELLO_TIMEOUT_MS);socket.once("close",()=>clearTimeout(helloTimeout));socket.once("message",async(data,isBinary)=>{
    clearTimeout(helloTimeout);if(isBinary)return closePolicyViolation(socket);let raw:unknown;try{raw=parseMessage(data);}catch{return closePolicyViolation(socket);}const hello=parseZoneHello(raw);if(!hello){if(raw&&typeof raw==="object"&&(raw as {type?:unknown}).type==="hello"&&(raw as {protocolVersion?:unknown}).protocolVersion!==ZONE_PROTOCOL_VERSION)rejectZoneInput(socket,"PROTOCOL_VERSION_UNSUPPORTED");return closePolicyViolation(socket);}
    try{const ticket=await consumeTicket({ticket:hello.ticket,zoneId:hello.zoneId});if(socket.readyState!==WebSocket.OPEN)return;if(!ticket)return closePolicyViolation(socket);const zone=registry.get(ticket.zoneId);const welcome=zone.join({userId:ticket.userId,socket,combatProfile:ticket.combatProfile});const presence=worldPresence?new ZonePresenceLifecycle(worldPresence,{userId:ticket.userId,connectionId:welcome.connectionId,zoneId:ticket.zoneId}):undefined;let refreshTimer:ReturnType<typeof setInterval>|undefined;
      const onPresenceFailure=(error:unknown)=>{console.error("[Aurion Zone] Presence lease refresh failed",error);closePolicyViolation(socket);};const observePresence=()=>{const position=zone.positionForConnection(welcome.connectionId);if(position)void presence?.observe(position)?.catch(onPresenceFailure);};
      socket.once("close",()=>{if(refreshTimer)clearInterval(refreshTimer);presenceObservers.delete(observePresence);zone.leave(welcome.connectionId);void presence?.close().catch(error=>console.error("[Aurion Zone] Presence lease release failed",error));});
      const initialPosition=zone.positionForConnection(welcome.connectionId);if(!initialPosition){zone.leave(welcome.connectionId);return closePolicyViolation(socket);}try{await presence?.refresh(initialPosition);}catch(error){zone.leave(welcome.connectionId);console.error("[Aurion Zone] Presence lease registration failed",error);return closePolicyViolation(socket);}if(socket.readyState!==WebSocket.OPEN)return;if(presence)presenceObservers.add(observePresence);socket.send(JSON.stringify(welcome));
      socket.on("message",(nextData,nextBinary)=>{if(nextBinary)return rejectZoneInput(socket,"INVALID_MESSAGE");let nextRaw:unknown;try{nextRaw=parseMessage(nextData);}catch{return rejectZoneInput(socket,"INVALID_MESSAGE");}
        const move=parseZoneMove(nextRaw);if(move){const result=zone.submitMovement(welcome.connectionId,move);if(result==="stale")return rejectZoneInput(socket,"STALE_CLIENT_SEQUENCE");if(result==="missing")closePolicyViolation(socket);return;}
        const attack=parseZoneAttack(nextRaw);if(attack){const result=zone.submitAttack(welcome.connectionId,attack);if(result==="stale")return rejectZoneInput(socket,"STALE_CLIENT_SEQUENCE");if(result==="missing")return closePolicyViolation(socket);if(result==="invalid_target")return rejectZoneInput(socket,"INVALID_COMBAT_TARGET");if(result==="out_of_range")return rejectZoneInput(socket,"COMBAT_TARGET_OUT_OF_RANGE");if(result==="dead")return rejectZoneInput(socket,"COMBATANT_DEAD");return;}
        rejectZoneInput(socket,typeof nextRaw==="object"&&nextRaw!==null&&["move","attack"].includes(String((nextRaw as {type?:unknown}).type))?"INVALID_MESSAGE":"UNSUPPORTED_ZONE_COMMAND");
      });
      refreshTimer=presence?setInterval(()=>{const position=zone.positionForConnection(welcome.connectionId);if(!position)return;void presence.refresh(position).catch(error=>{console.error("[Aurion Zone] Presence lease refresh failed",error);closePolicyViolation(socket);});},WORLD_PRESENCE_REFRESH_MS):undefined;
    }catch(error){console.error("[Aurion Zone] Ticket handshake failed",error);closePolicyViolation(socket);}
  });});
  return{registry,close:()=>{clearInterval(tickTimer);presenceObservers.clear();wss.close();}};
}
