import type { ConfirmedZoneTelegraphEvent } from "@shared/zoneTelegraphContract";

export const ZONE_TELEGRAPH_READBACK_EVENT = "aurion:confirmed-zone-telegraph" as const;
export const ZONE_TICK_READBACK_EVENT = "aurion:confirmed-zone-tick" as const;

export type ConfirmedZoneTickReadback = Readonly<{ tick: number }>;

export function emitConfirmedZoneTelegraphReadback(event: ConfirmedZoneTelegraphEvent): void {
  window.dispatchEvent(new CustomEvent<ConfirmedZoneTelegraphEvent>(ZONE_TELEGRAPH_READBACK_EVENT, {
    detail: event,
  }));
}

export function emitConfirmedZoneTickReadback(tick: number): void {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new Error("ZONE_CONFIRMED_TICK_INVALID");
  window.dispatchEvent(new CustomEvent<ConfirmedZoneTickReadback>(ZONE_TICK_READBACK_EVENT, {
    detail: Object.freeze({ tick }),
  }));
}
