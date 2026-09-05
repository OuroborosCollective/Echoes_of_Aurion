/** Host I/O boundary. Never use this clock as gameplay seed, reward identity or simulation time. */
export type OperationalClock = Readonly<{ now: () => number }>;
const MAX_EPOCH_MS = 8_640_000_000_000_000;
export function validEpochMilliseconds(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_EPOCH_MS)
    throw new Error("OPERATIONAL_TIME_INVALID");
  return value;
}
/** The sole direct host wall-clock access in application-owned runtime source. */
export const hostOperationalClock: OperationalClock = Object.freeze({
  now: () => Date.now(),
});
export function operationalNow(
  clock: OperationalClock = hostOperationalClock
): number {
  return validEpochMilliseconds(clock.now());
}
export function fixedOperationalClock(epochMs: number): OperationalClock {
  const sample = validEpochMilliseconds(epochMs);
  return Object.freeze({ now: () => sample });
}
/** Pure deadline calculation: recorded input produces the identical deadline during replay. */
export function deadlineAfter(epochMs: number, durationMs: number): number {
  validEpochMilliseconds(epochMs);
  if (!Number.isSafeInteger(durationMs) || durationMs < 0)
    throw new Error("OPERATIONAL_DURATION_INVALID");
  return validEpochMilliseconds(epochMs + durationMs);
}
export function operationalDate(
  clock: OperationalClock = hostOperationalClock
): Date {
  return new Date(operationalNow(clock));
}
