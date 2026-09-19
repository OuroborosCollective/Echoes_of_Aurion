import type { ConfirmedZoneCombatEvent } from "@shared/zoneCombatContract";

export const CONFIRMED_COMBAT_PRESENTATION_EVENT = "aurion:confirmed-combat-presentation" as const;

export type ConfirmedCombatPresentationEvent = Readonly<{
  tick: number;
  sequence: number;
  direction: "outgoing" | "incoming";
  damage: number;
  crit: boolean;
  killed?: boolean;
  attackerEntityId: string;
  defenderEntityId: string;
}>;

export function validConfirmedCombatPresentation(value: unknown): value is ConfirmedCombatPresentationEvent {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.tick === "number" &&
    typeof c.sequence === "number" &&
    (c.direction === "outgoing" || c.direction === "incoming") &&
    typeof c.damage === "number" &&
    typeof c.crit === "boolean"
  );
}

export function projectConfirmedCombatPresentation(
  event: ConfirmedZoneCombatEvent,
  playerEntityId: string
): ConfirmedCombatPresentationEvent | null {
  const isAttacker = event.attackerEntityId === playerEntityId;
  const isDefender = event.defenderEntityId === playerEntityId;

  if (!isAttacker && !isDefender) {
    return null;
  }

  return Object.freeze({
    tick: event.tick,
    sequence: event.sequence,
    direction: isAttacker ? "outgoing" : "incoming",
    damage: event.damage,
    crit: event.crit,
    killed: event.killed,
    attackerEntityId: event.attackerEntityId,
    defenderEntityId: event.defenderEntityId,
  });
}

export interface ConfirmedCombatMetrics {
  totalDamage: number;
  totalDamageTaken: number;
  currentDps: number;
  peakDps: number;
  currentDtps: number;
  critRate: number;
  combatDurationSec: number;
  eventCount: number;
  firstTick: number;
  lastTick: number;
  logs: ReadonlyArray<{
    tick: number;
    value: number;
    direction: "outgoing" | "incoming";
  }>;
}

export function reduceConfirmedCombatMetrics(
  events: readonly ConfirmedCombatPresentationEvent[]
): ConfirmedCombatMetrics {
  // Deduplicate identical events by tick + sequence + direction
  const seen = new Set<string>();
  const unique: ConfirmedCombatPresentationEvent[] = [];

  for (const event of events) {
    const key = `${event.tick}:${event.sequence}:${event.direction}:${event.damage}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(event);
    }
  }

  if (unique.length === 0) {
    return {
      totalDamage: 0,
      totalDamageTaken: 0,
      currentDps: 0,
      peakDps: 0,
      currentDtps: 0,
      critRate: 0,
      combatDurationSec: 0,
      eventCount: 0,
      firstTick: 0,
      lastTick: 0,
      logs: [],
    };
  }

  let totalDamage = 0;
  let totalDamageTaken = 0;
  let peakDamage = 0;
  let outgoingCount = 0;
  let outgoingCrits = 0;
  let firstTick = unique[0].tick;
  let lastTick = unique[0].tick;

  for (const event of unique) {
    if (event.tick < firstTick) firstTick = event.tick;
    if (event.tick > lastTick) lastTick = event.tick;

    if (event.direction === "outgoing") {
      totalDamage += event.damage;
      outgoingCount++;
      if (event.crit) outgoingCrits++;
      if (event.damage > peakDamage) peakDamage = event.damage;
    } else {
      totalDamageTaken += event.damage;
    }
  }

  const combatDurationSec = Math.round(((lastTick - firstTick + 1) / 10) * 10) / 10;
  const durationForCalc = Math.max(combatDurationSec, 0.1);
  const currentDps = Math.round(totalDamage / durationForCalc);
  const currentDtps = Math.round(totalDamageTaken / durationForCalc);
  const peakDps = Math.round(peakDamage / 0.1);
  const critRate = outgoingCount > 0 ? Math.round((outgoingCrits / outgoingCount) * 100) : 0;

  const logs = [...unique]
    .sort((a, b) => b.tick - a.tick || b.sequence - a.sequence)
    .map(event => ({
      tick: event.tick,
      value: event.damage,
      direction: event.direction,
    }));

  return {
    totalDamage,
    totalDamageTaken,
    currentDps,
    peakDps,
    currentDtps,
    critRate,
    combatDurationSec,
    eventCount: unique.length,
    firstTick,
    lastTick,
    logs,
  };
}
