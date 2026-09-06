import { operationalNow } from "@shared/operationalClock";

/**
 * Evidence-side clock boundary for companion capture metadata.
 * Gameplay/simulation modules must not import the host operational clock.
 */
export function companionCaptureNow(): number {
  return operationalNow();
}
