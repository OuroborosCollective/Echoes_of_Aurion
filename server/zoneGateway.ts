import { sendZoneMessage } from "./zoneOutboundPressure";
import { defensiveGatewayObserver, type DefensiveGatewayObserver } from "./defensiveGatewayObserver";
import { clientVerificationRegistry } from "./causality/clientVerificationRegistry";
import type { IncomingMessage } from "node:http";
import type { Server as HttpServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { isAllowedZoneOrigin, parseZoneAttack, parseZoneHello, parseZoneMove, parseZoneSkill, ZONE_TICK_MS, type ZoneReject, type ZoneId } from "./zoneProtocol";
import { WORLD_PRESENCE_LEASE_MS, WORLD_PRESENCE_REFRESH_MS } from "./worldPresenceProtocol";
import { globalZoneRegistry, ZoneRegistry, type AuthoritativeMovementZone, type ZoneCombatProfile } from "./zoneRuntime";
import { ZonePresenceLifecycle } from "./zonePresenceLifecycle";
import { ZONE_PROTOCOL_VERSION } from "@shared/zonePresenceContract";
import { globalCausalPersistence } from "./causality/persistence";
import { globalTickRecorder } from "./causality/tickRecorder";
import { restorePersistedZoneHead } from "./causality/persistedZoneRecovery";
import { globalZoneJoinHealth, zoneFailureCode, type ZoneJoinHealthMonitor } from "./zoneJoinHealth";
import { operationalDate } from "../shared/operationalClock";

const HELLO_TIMEOUT_MS=5_000;const MAX_MESSAGE_BYTES=2_048;
// Give the Godot WebSocketPeer event loop time to surface the typed version
// rejection BEFORE sending the policy-close frame. No ticket is consumed here.
const PROTOCOL_REJECT_GRACE_MS=250;
export type ZoneTicketReceipt={userId:number;zoneId:"observatory_threshold";clientBuild:string;expiresAt:Date;combatProfile?:ZoneCombatProfile};
export type ZoneTicketConsumer=(values:{ticket:string;zoneId:"observatory_threshold"})=>Promise<ZoneTicketReceipt|undefined>;
export type WorldPresenceSink={upsert(values:{userId:number;connectionId:string;zoneId:"observatory_threshold";position:{x:number;z:number}}):Promise<unknown>;release(values:{connectionId:string}):Promise<unknown>;releaseOrphaned?(values:{lastSeenBefore:Date}):Promise<number>;};
export type ZoneFixedTickSink={intervalTicks:number;observe(values:{tick:number}):Promise<unknown>;};
export type ZoneRecoveryResolver=(zoneId:ZoneId)=>Promise<AuthoritativeMovementZone>;
const SHUTDOWN_CLIENT_CLOSE_MS=2000;
// A stalled world-presence write must not hold back the final tick and the causal flush.
// Leases are not causal evidence and expire on their own.
const SHUTDOWN_LEASE_RELEASE_MS=2000;
// Boot work must fit the promoter's health budget (~30 s): only the lease release runs
// before listen. Zone settlement runs in the background; admissions wait for it, bounded.
const BOOT_LEASE_RELEASE_TIMEOUT_MS=5_000;const BOOT_SETTLEMENT_REPORT_MS=30_000;const ADMISSION_SETTLEMENT_WAIT_MS=10_000;
// Shutdown waits for an in-flight boot settlement (it flushes its own recovery tick) before
// the final tick and the causal flush, bounded inside the 25 s drain deadline.
const SHUTDOWN_SETTLEMENT_WAIT_MS=5_000;
function closePolicyViolation(socket:WebSocket):void{socket.close(1008,"zone authorization rejected");}
// Server-side admission failure: retryable for clients, never reported as an authorization rejection.
function closeZoneUnavailable(socket:WebSocket):void{if(socket.readyState===WebSocket.OPEN||socket.readyState===WebSocket.CONNECTING)socket.close(1011,"zone temporarily unavailable");}
function parseMessage(data:WebSocket.RawData):unknown{if(typeof data==="string")return JSON.parse(data);if(Array.isArray(data))return JSON.parse(Buffer.concat(data).toString("utf8"));if(data instanceof ArrayBuffer)return JSON.parse(Buffer.from(new Uint8Array(data)).toString("utf8"));return JSON.parse(data.toString("utf8"));}
function rejectZoneInput(socket:WebSocket,code:ZoneReject["code"]):void{sendZoneMessage(socket,JSON.stringify({type:"reject",code} satisfies ZoneReject));}
function rejectUnsupportedZoneVersion(socket:WebSocket):void{
  rejectZoneInput(socket,"PROTOCOL_VERSION_UNSUPPORTED");
  const grace=setTimeout(()=>{if(socket.readyState===WebSocket.OPEN)closePolicyViolation(socket);},PROTOCOL_REJECT_GRACE_MS);
  grace.unref();
}

/** `/v1/ws` is Aurion's live gameplay transport. AX1/WASD are historical provenance only; legacy tRPC/MCP encounter routes are not consulted. */
export function registerZoneGateway(server:HttpServer,registry:ZoneRegistry=globalZoneRegistry,consumeTicket:ZoneTicketConsumer,worldPresence?:WorldPresenceSink,fixedTick?:ZoneFixedTickSink,recoverZone:ZoneRecoveryResolver=(zoneId)=>restorePersistedZoneHead(zoneId,globalCausalPersistence,globalTickRecorder),observer:DefensiveGatewayObserver=defensiveGatewayObserver,joinHealth:ZoneJoinHealthMonitor=globalZoneJoinHealth,options:{admissionSettlementWaitMs?:number;shutdownSettlementWaitMs?:number}={}){
  const admissionSettlementWaitMs=options.admissionSettlementWaitMs??ADMISSION_SETTLEMENT_WAIT_MS;const shutdownSettlementWaitMs=options.shutdownSettlementWaitMs??SHUTDOWN_SETTLEMENT_WAIT_MS;let bootSettlement:Promise<unknown>|undefined;
  if(fixedTick&&(!Number.isSafeInteger(fixedTick.intervalTicks)||fixedTick.intervalTicks<1))throw new Error("ZONE_FIXED_TICK_INTERVAL_INVALID");
  const wss=new WebSocketServer({noServer:true,maxPayload:MAX_MESSAGE_BYTES});const observationConnections=new Set<string>();const presenceObservers=new Set<()=>void>();let closing=false;const presenceReleases=new Set<Promise<unknown>>();let gatewayTick=0;let fixedTickChain:Promise<void>=Promise.resolve();let isTicking=false;
  const tickTimer=setInterval(async()=>{
    if(isTicking)return;
    isTicking=true;
    try{registry.tick();}catch(error){console.error("[Aurion Zone] Registry tick failed",error);}
    isTicking=false;
    gatewayTick+=1;
    presenceObservers.forEach(observe=>observe());
    if(fixedTick&&gatewayTick%fixedTick.intervalTicks===0){const tick=gatewayTick;const run=fixedTickChain.then(()=>fixedTick.observe({tick})).then(()=>undefined);fixedTickChain=run.catch(error=>console.error("[Aurion Zone] Fixed-tick sink failed",error));}},ZONE_TICK_MS);
  server.on("upgrade",(request,socket,head)=>{const pathname=new URL(request.url??"/","http://localhost").pathname;if(pathname!=="/v1/ws"){socket.destroy();return;}if(!isAllowedZoneOrigin(request.headers.origin)){observer.originDenied("websocket");socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");socket.destroy();return;}wss.handleUpgrade(request,socket,head,webSocket=>wss.emit("connection",webSocket,request));});
  wss.on("connection",(socket:WebSocket,_request:IncomingMessage)=>{
    // ws emits an error on this socket for oversized frames (1009). Without
    // a listener Node treats that per-peer protocol fault as a fatal process error.
    socket.on("error",(error:Error)=>{
      console.warn("[Aurion Zone] WebSocket peer error:",error.message);
      socket.terminate();
    });
    // Shutdown stops admission: no new handshake may join after the final tick.
    if(closing){socket.close(1001,"server shutting down");return;}
    const finishObservation=observer.beginHandshake();
    socket.once("close",()=>finishObservation("closed"));
    const helloTimeout=setTimeout(()=>closePolicyViolation(socket),HELLO_TIMEOUT_MS);socket.once("close",()=>clearTimeout(helloTimeout));socket.once("message",async(data,isBinary)=>{
    clearTimeout(helloTimeout);if(isBinary)return closePolicyViolation(socket);let raw:unknown;try{raw=parseMessage(data);}catch{return closePolicyViolation(socket);}const hello=parseZoneHello(raw);if(!hello){
      if(raw&&typeof raw==="object"&&(raw as {type?:unknown}).type==="hello"&&(raw as {protocolVersion?:unknown}).protocolVersion!==ZONE_PROTOCOL_VERSION){rejectUnsupportedZoneVersion(socket);return;}
      return closePolicyViolation(socket);
    }
    try{const ticket=await consumeTicket({ticket:hello.ticket,zoneId:hello.zoneId});if(socket.readyState!==WebSocket.OPEN)return;if(!ticket)return closePolicyViolation(socket);if(closing){socket.close(1001,"server shutting down");return;}if(!(await registry.waitForSettlement(ticket.zoneId,admissionSettlementWaitMs)))throw new Error("ZONE_BOOT_SETTLEMENT_PENDING");if(socket.readyState!==WebSocket.OPEN)return;const zone=await registry.getOrRecover(ticket.zoneId,recoverZone);if(socket.readyState!==WebSocket.OPEN)return;if(closing){socket.close(1001,"server shutting down");return;}const welcome=zone.join({userId:ticket.userId,socket,combatProfile:ticket.combatProfile});clientVerificationRegistry.open(ticket.userId,welcome.connectionId);observationConnections.add(welcome.connectionId);const presence=worldPresence?new ZonePresenceLifecycle(worldPresence,{userId:ticket.userId,connectionId:welcome.connectionId,zoneId:ticket.zoneId}):undefined;let refreshTimer:ReturnType<typeof setInterval>|undefined;
      const onPresenceFailure=(error:unknown)=>{console.error("[Aurion Zone] Presence lease refresh failed",error);closePolicyViolation(socket);};const observePresence=()=>{const position=zone.positionForConnection(welcome.connectionId);if(position)void presence?.observe(position)?.catch(onPresenceFailure);};
      socket.once("close",()=>{clientVerificationRegistry.close(welcome.connectionId);observationConnections.delete(welcome.connectionId);if(refreshTimer)clearInterval(refreshTimer);presenceObservers.delete(observePresence);zone.leave(welcome.connectionId);const released=presence?.close().catch(error=>console.error("[Aurion Zone] Presence lease release failed",error));if(released){presenceReleases.add(released);void released.finally(()=>presenceReleases.delete(released));}});
      const initialPosition=zone.positionForConnection(welcome.connectionId);if(!initialPosition){zone.leave(welcome.connectionId);return closePolicyViolation(socket);}try{await presence?.refresh(initialPosition);}catch(error){zone.leave(welcome.connectionId);console.error("[Aurion Zone] Presence lease registration failed",error);joinHealth.failed(error);return closeZoneUnavailable(socket);}if(socket.readyState!==WebSocket.OPEN)return;if(presence)presenceObservers.add(observePresence);if(!sendZoneMessage(socket,JSON.stringify(welcome)))return;joinHealth.joined();finishObservation("completed");
      socket.on("message",(nextData,nextBinary)=>{if(nextBinary)return rejectZoneInput(socket,"INVALID_MESSAGE");let nextRaw:unknown;try{nextRaw=parseMessage(nextData);}catch{return rejectZoneInput(socket,"INVALID_MESSAGE");}
        const move=parseZoneMove(nextRaw);if(move){const result=zone.submitMovement(welcome.connectionId,move);if(result==="stale")return rejectZoneInput(socket,"STALE_CLIENT_SEQUENCE");if(result==="missing")closePolicyViolation(socket);return;}
        const attack=parseZoneAttack(nextRaw);if(attack){const result=zone.submitAttack(welcome.connectionId,attack);if(result==="stale")return rejectZoneInput(socket,"STALE_CLIENT_SEQUENCE");if(result==="missing")return closePolicyViolation(socket);if(result==="invalid_target")return rejectZoneInput(socket,"INVALID_COMBAT_TARGET");if(result==="out_of_range")return rejectZoneInput(socket,"COMBAT_TARGET_OUT_OF_RANGE");if(result==="no_stamina")return rejectZoneInput(socket,"COMBAT_NO_STAMINA");if(result==="dead")return rejectZoneInput(socket,"COMBATANT_DEAD");if(result==="cooldown")return rejectZoneInput(socket,"COMBAT_SKILL_COOLDOWN");return;}
        const skill=parseZoneSkill(nextRaw);if(skill){const result=zone.submitSkill(welcome.connectionId,skill);if(result==="stale")return rejectZoneInput(socket,"STALE_CLIENT_SEQUENCE");if(result==="missing")return closePolicyViolation(socket);if(result==="invalid_skill")return rejectZoneInput(socket,"INVALID_COMBAT_SKILL");if(result==="cooldown")return rejectZoneInput(socket,"COMBAT_SKILL_COOLDOWN");if(result==="invalid_target")return rejectZoneInput(socket,"INVALID_COMBAT_TARGET");if(result==="out_of_range")return rejectZoneInput(socket,"COMBAT_TARGET_OUT_OF_RANGE");if(result==="no_stamina")return rejectZoneInput(socket,"COMBAT_NO_STAMINA");if(result==="dead")return rejectZoneInput(socket,"COMBATANT_DEAD");return;}
        rejectZoneInput(socket,typeof nextRaw==="object"&&nextRaw!==null&&["move","attack","skill"].includes(String((nextRaw as {type?:unknown}).type))?"INVALID_MESSAGE":"UNSUPPORTED_ZONE_COMMAND");
      });
      refreshTimer=presence?setInterval(()=>{const position=zone.positionForConnection(welcome.connectionId);if(!position)return;void presence.refresh(position).catch(error=>{console.error("[Aurion Zone] Presence lease refresh failed",error);closePolicyViolation(socket);});},WORLD_PRESENCE_REFRESH_MS):undefined;
    }catch(error){console.error("[Aurion Zone] Ticket handshake failed",error);joinHealth.failed(error);closeZoneUnavailable(socket);}
  });});
  /**
   * Boot, before listen: release world-presence leases of the previous process. No client
   * has been admitted yet, so every active lease is orphaned (inclusive boundary). Bounded;
   * a lease wrongly released later is restored by its owner's next refresh (upsert).
   */
  const releaseOrphanedLeasesAtBoot=async(requestedTimeoutMs=BOOT_LEASE_RELEASE_TIMEOUT_MS)=>{
    if(!worldPresence?.releaseOrphaned)return joinHealth.readback();
    // The boundary is a fixed parameter captured before the UPDATE, and admission starts only
    // after the UPDATE or this bound. A bound of at least 1 s keeps every lease admitted later
    // strictly after the boundary even at second precision, so a late UPDATE never matches it.
    const timeoutMs=Math.max(1_000,requestedTimeoutMs);
    const lastSeenBefore=operationalDate();let deadline:ReturnType<typeof setTimeout>|undefined;
    try{
      const outcome=await Promise.race([worldPresence.releaseOrphaned({lastSeenBefore}),new Promise<"timeout">(resolve=>{deadline=setTimeout(()=>resolve("timeout"),timeoutMs);})]);
      if(outcome==="timeout"){joinHealth.orphanedLeaseReleaseFinished(null,"WORLD_PRESENCE_ORPHAN_RELEASE_TIMEOUT");console.error(`[Aurion Zone] orphaned world-presence release exceeded ${timeoutMs} ms`);}
      else{joinHealth.orphanedLeaseReleaseFinished(outcome);console.info(`[Aurion Zone] ORPHANED_LEASES_RELEASED ${JSON.stringify({released:outcome})}`);}
    }catch(error){joinHealth.orphanedLeaseReleaseFinished(null,"WORLD_PRESENCE_ORPHAN_RELEASE_FAILED");console.error("[Aurion Zone] orphaned world-presence release failed",error);}
    finally{clearTimeout(deadline);}
    return joinHealth.readback();
  };
  /**
   * Boot, in the background: settle persisted zone heads (canonical leave tick for presences
   * without a transport) without activating them. Never blocks listen; admissions wait for it
   * up to the admission bound. A settlement still running at `reportAfterMs` is reported.
   */
  const settleZonesAtBoot=(zoneIds:readonly ZoneId[],reportAfterMs=BOOT_SETTLEMENT_REPORT_MS)=>{
    joinHealth.bootSettlementStarted();let finished=false;
    const report=setTimeout(()=>{if(finished)return;joinHealth.bootSettlementFinished({status:"timed_out",code:"ZONE_BOOT_SETTLEMENT_TIMEOUT"});console.error(`[Aurion Zone] BOOT_SETTLEMENT ${JSON.stringify({status:"timed_out",afterMs:reportAfterMs})}`);},reportAfterMs);
    report.unref?.();
    const settlement=(async()=>{
      let code:string|null=null;
      for(const zoneId of zoneIds){try{await registry.settlePersistedHead(zoneId,recoverZone);}catch(error){code??=zoneFailureCode(error);console.error(`[Aurion Zone] boot settlement failed for ${zoneId}`,error);}}
      finished=true;clearTimeout(report);
      joinHealth.bootSettlementFinished({status:code?"failed":"settled",code});
      console.info(`[Aurion Zone] BOOT_SETTLEMENT ${JSON.stringify({status:code?"failed":"settled",code})}`);
      return joinHealth.readback();
    })();
    bootSettlement=settlement;
    return settlement;
  };
  return{registry,releaseOrphanedLeasesAtBoot,settleZonesAtBoot,close:async()=>{closing=true;clearInterval(tickTimer);
    // A boot settlement still committing its recovery tick must finish (it flushes that tick
    // itself) before the final tick and the drain's flush; bounded.
    if(bootSettlement){let wait:ReturnType<typeof setTimeout>|undefined;const settled=await Promise.race([bootSettlement.then(()=>true,()=>true),new Promise<boolean>(resolve=>{wait=setTimeout(()=>resolve(false),shutdownSettlementWaitMs);})]);clearTimeout(wait);if(!settled)console.warn(`[Aurion Zone] shutdown continued after ${shutdownSettlementWaitMs} ms while the boot settlement is still running`);}
    // Close every client first: their close handlers queue presence_leave and release
    // world-presence leases. Bounded: an unresponsive peer is terminated.
    await Promise.all([...wss.clients].map(client=>new Promise<void>(resolve=>{if(client.readyState===WebSocket.CLOSED)return resolve();const timer=setTimeout(()=>{client.terminate();resolve();},SHUTDOWN_CLIENT_CLOSE_MS);client.once("close",()=>{clearTimeout(timer);resolve();});client.close(1001,"server shutdown");})));
    // Bounded independently of socket closure; the referenced timer keeps the process alive while waiting.
    const pendingReleases=[...presenceReleases];
    if(pendingReleases.length){let deadline:ReturnType<typeof setTimeout>|undefined;const timedOut=await Promise.race([Promise.allSettled(pendingReleases).then(()=>false),new Promise<boolean>(resolve=>{deadline=setTimeout(()=>resolve(true),SHUTDOWN_LEASE_RELEASE_MS);})]);clearTimeout(deadline);if(timedOut)console.warn(`[Aurion Zone] shutdown continued with ${presenceReleases.size} world-presence lease release(s) still pending after ${SHUTDOWN_LEASE_RELEASE_MS} ms; they expire within ${WORLD_PRESENCE_LEASE_MS} ms`);}
    for(const id of observationConnections)clientVerificationRegistry.close(id);observationConnections.clear();let leaveError:unknown;try{const left=registry.commitShutdownLeaves();if(left)console.info(`[Aurion Zone] shutdown enqueued ${left} presence leave(s) in the final tick`);}catch(error){console.error("[Aurion Zone] shutdown presence leave failed",error);leaveError=error;}presenceObservers.clear();wss.close();if(leaveError)throw leaveError;}};
}
