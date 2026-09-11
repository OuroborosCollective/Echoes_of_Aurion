import type { ConfirmedZoneResourceSnapshot } from "@shared/zoneResourceContract";

export const ZONE_RESOURCE_READBACK_EVENT = "aurion:confirmed-zone-resources" as const;

export type ConfirmedZoneResourceReadback = Readonly<{
  tick: number;
  resources: ConfirmedZoneResourceSnapshot;
}>;

/**
 * Browser-side fan-out only. The payload is emitted exclusively after Zone v5
 * validation; listeners must still validate before projecting it.
 */
export function emitConfirmedZoneResourceReadback(
  resources: ConfirmedZoneResourceSnapshot,
  tick: number,
): void {
  window.dispatchEvent(new CustomEvent<ConfirmedZoneResourceReadback>(ZONE_RESOURCE_READBACK_EVENT, {
    detail: Object.freeze({ tick, resources }),
  }));
}
