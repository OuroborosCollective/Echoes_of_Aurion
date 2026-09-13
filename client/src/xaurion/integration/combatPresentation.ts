import type { ConfirmedZoneCombatEvent } from "@shared/zoneCombatContract";
import { ZONE_TICK_MS, ZONE_TICK_HZ } from "@shared/zoneTimingContract";

export const CONFIRMED_COMBAT_PRESENTATION_EVENT = "aurion:confirmed-combat" as const;

export type ConfirmedCombatPresentationEvent = Readonly<{
  tick: number;
  sequence: number;
  direction: "outgoing" | "incoming";
  damage: number;
  hit: boolean;
  crit: boolean;
  killed: boolean;
  skillId: ConfirmedZoneCombatEvent["skillId"];
  gameplaySourceRevision: string;
}>;

export type ConfirmedCombatLogEntry = Readonly<{
  id: string;
  tick: number;
  text: string;
  value: number;
  direction: ConfirmedCombatPresentationEvent["direction"];
  crit: boolean;
}>;

export type ConfirmedCombatMetrics = Readonly<{
  totalDamage: number;
  totalDamageTaken: number;
  currentDps: number;
  peakDps: number;
  currentDtps: number;
  critRate: number;
  combatDurationSec: number;
  eventCount: number;
  firstTick: number | null;
  lastTick: number | null;
  logs: readonly ConfirmedCombatLogEntry[];
}>;

export function projectConfirmedCombatPresentation(
  event: ConfirmedZoneCombatEvent,
  selfEntityId: string,
): ConfirmedCombatPresentationEvent | null {
  const direction = event.attackerEntityId === selfEntityId
    ? "outgoing"
    : event.defenderEntityId === selfEntityId
      ? "incoming"
      : null;
  if (!direction) return null;
  return Object.freeze({
    tick: event.tick,
    sequence: event.sequence,
    direction,
    damage: event.damage,
    hit: event.hit,
    crit: event.crit,
    killed: event.killed,
    skillId: event.skillId,
    gameplaySourceRevision: event.gameplaySourceRevision,
  });
}

export function validConfirmedCombatPresentation(value: unknown): value is ConfirmedCombatPresentationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as ConfirmedCombatPresentationEvent;
  return Number.isSafeInteger(event.tick) && event.tick >= 0
    && Number.isSafeInteger(event.sequence) && event.sequence >= 1
    && (event.direction === "outgoing" || event.direction === "incoming")
    && Number.isSafeInteger(event.damage) && event.damage >= 0
    && typeof event.hit === "boolean"
    && typeof event.crit === "boolean"
    && typeof event.killed === "boolean"
    && (event.skillId === null || typeof event.skillId === "string")
    && typeof event.gameplaySourceRevision === "string"
    && /^[0-9a-f]{40}$/.test(event.gameplaySourceRevision);
}

export function reduceConfirmedCombatMetrics(values: readonly ConfirmedCombatPresentationEvent[]): ConfirmedCombatMetrics {
  const bySequence = new Map<number, ConfirmedCombatPresentationEvent>();
  for (const value of values) {
    if (!validConfirmedCombatPresentation(value)) continue;
    const previous = bySequence.get(value.sequence);
    if (!previous || value.tick < previous.tick) bySequence.set(value.sequence, value);
  }
  const canonical = [...bySequence.values()].sort((left, right) => left.tick - right.tick || left.sequence - right.sequence);
  if (canonical.length === 0) return Object.freeze({
    totalDamage: 0,
    totalDamageTaken: 0,
    currentDps: 0,
    peakDps: 0,
    currentDtps: 0,
    critRate: 0,
    combatDurationSec: 0,
    eventCount: 0,
    firstTick: null,
    lastTick: null,
    logs: Object.freeze([]),
  });

  const outgoing = canonical.filter(event => event.direction === "outgoing");
  const incoming = canonical.filter(event => event.direction === "incoming");
  const firstTick = canonical[0]!.tick;
  const lastTick = canonical[canonical.length - 1]!.tick;
  const tickSpan = Math.max(1, lastTick - firstTick + 1);
  const combatDurationSec = tickSpan * ZONE_TICK_MS / 1000;
  const totalDamage = outgoing.reduce((sum, event) => sum + event.damage, 0);
  const totalDamageTaken = incoming.reduce((sum, event) => sum + event.damage, 0);
  const outgoingHits = outgoing.filter(event => event.hit);
  const criticalHits = outgoingHits.filter(event => event.crit).length;
  const perTickDamage = new Map<number, number>();
  for (const event of outgoing) perTickDamage.set(event.tick, (perTickDamage.get(event.tick) ?? 0) + event.damage);
  const peakDps = Math.max(0, ...[...perTickDamage.values()].map(damage => Math.round(damage * ZONE_TICK_HZ)));
  const logs = Object.freeze([...canonical].reverse().slice(0, 40).map(event => Object.freeze({
    id: `${event.sequence}:${event.direction}`,
    tick: event.tick,
    text: event.direction === "outgoing"
      ? `${event.crit ? "CRIT " : ""}${event.skillId ?? "Basic Attack"}${event.killed ? " · Gegner besiegt" : ""}`
      : "Eingehender Treffer",
    value: event.damage,
    direction: event.direction,
    crit: event.crit,
  })));
  return Object.freeze({
    totalDamage,
    totalDamageTaken,
    currentDps: Math.round(totalDamage / combatDurationSec),
    peakDps,
    currentDtps: Math.round(totalDamageTaken / combatDurationSec),
    critRate: outgoingHits.length === 0 ? 0 : Math.round(criticalHits / outgoingHits.length * 100),
    combatDurationSec: Number(combatDurationSec.toFixed(1)),
    eventCount: canonical.length,
    firstTick,
    lastTick,
    logs,
  });
}
