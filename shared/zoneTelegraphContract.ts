import { AX1_ECOLOGY_SOURCE_REVISION } from "./ax1ResourceEcologyProtocol";
import { validWorldPosition, type ConfirmedWorldPosition } from "./zonePresenceContract";

export const ZONE_TELEGRAPH_CONTRACT_VERSION = "aurion-zone-telegraph.v1" as const;
export const ZONE_TELEGRAPH_VISUAL_SOURCE_REVISION = AX1_ECOLOGY_SOURCE_REVISION;
export const ZONE_TELEGRAPH_VISUAL_SOURCE_PATH = "src/engine/combat/TelegraphVisualizer.ts" as const;
export const ZONE_TELEGRAPH_AUTHORITY_RULESET = "aurion-ax1-mob-windup.v1" as const;
export const ZONE_TELEGRAPH_MAX_WINDUP_TICKS = 50 as const;

export type ConfirmedZoneTelegraphEvent = Readonly<{
  type: "telegraph";
  contractVersion: typeof ZONE_TELEGRAPH_CONTRACT_VERSION;
  id: string;
  sequence: number;
  startTick: number;
  impactTick: number;
  attackerEntityId: string;
  targetEntityId: string;
  kind: "line";
  origin: ConfirmedWorldPosition;
  target: ConfirmedWorldPosition;
  widthFixed: number;
  color: "#ef4444";
  visualSourceRevision: typeof ZONE_TELEGRAPH_VISUAL_SOURCE_REVISION;
  authorityRuleset: typeof ZONE_TELEGRAPH_AUTHORITY_RULESET;
}>;

function validMobId(value: unknown): value is string {
  return typeof value === "string" && /^mob_[1-9][0-9]{0,2}$/.test(value);
}

function validPlayerId(value: unknown): value is string {
  return typeof value === "string" && /^player:[1-9][0-9]*$/.test(value);
}

export function validConfirmedZoneTelegraphEvent(value: unknown): value is ConfirmedZoneTelegraphEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as ConfirmedZoneTelegraphEvent;
  if (event.type !== "telegraph" || event.contractVersion !== ZONE_TELEGRAPH_CONTRACT_VERSION) return false;
  if (typeof event.id !== "string" || !/^telegraph:mob_[1-9][0-9]{0,2}:[1-9][0-9]*$/.test(event.id)) return false;
  if (!Number.isSafeInteger(event.sequence) || event.sequence < 1) return false;
  if (!Number.isSafeInteger(event.startTick) || event.startTick < 0) return false;
  if (!Number.isSafeInteger(event.impactTick) || event.impactTick <= event.startTick) return false;
  if (event.impactTick - event.startTick > ZONE_TELEGRAPH_MAX_WINDUP_TICKS) return false;
  if (!validMobId(event.attackerEntityId) || !validPlayerId(event.targetEntityId)) return false;
  if (event.id !== `telegraph:${event.attackerEntityId}:${event.sequence}`) return false;
  if (event.kind !== "line") return false;
  if (!validWorldPosition(event.origin) || !validWorldPosition(event.target)) return false;
  if (!Number.isSafeInteger(event.widthFixed) || event.widthFixed < 500 || event.widthFixed > 8_000) return false;
  return event.color === "#ef4444"
    && event.visualSourceRevision === ZONE_TELEGRAPH_VISUAL_SOURCE_REVISION
    && event.authorityRuleset === ZONE_TELEGRAPH_AUTHORITY_RULESET;
}
