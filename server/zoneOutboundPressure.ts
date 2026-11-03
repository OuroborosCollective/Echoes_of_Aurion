import { defensiveGatewayObserver } from "./defensiveGatewayObserver";
import type WebSocket from "ws";

/** A transport budget, never a simulation or receipt input. Disabled until measured. */
export function parseZoneOutboundLimit(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  if (!/^[0-9]+$/.test(value)) throw new Error("ZONE_OUTBOUND_LIMIT_INVALID");
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 65_536 || limit > 67_108_864) throw new Error("ZONE_OUTBOUND_LIMIT_INVALID");
  return limit;
}
export const ZONE_OUTBOUND_LIMIT = parseZoneOutboundLimit(process.env.AURION_ZONE_OUTBOUND_MAX_BYTES);

/** Terminate only the congested peer; never drop a combat event and continue
 * a divergent stream. Its normal close handler owns canonical leave/reconnect. */
export function sendZoneMessage(socket: WebSocket, payload: string, limit = ZONE_OUTBOUND_LIMIT): boolean {
  if (socket.readyState !== socket.OPEN) return false;
  const overLimit = limit !== null && socket.bufferedAmount + Buffer.byteLength(payload, "utf8") > limit;
  defensiveGatewayObserver.observeOutbound(socket.bufferedAmount, overLimit);
  if (overLimit) {
    socket.terminate();
    return false;
  }
  socket.send(payload);
  return true;
}
