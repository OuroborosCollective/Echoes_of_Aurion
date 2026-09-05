import { validEpochMilliseconds } from "../../shared/operationalClock";
/** Deterministic transport scheduling. Provider Retry-After is an explicit input. */
export function computeBackoffDelay(attempt: number, retryAfterMs?: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 0 || attempt > 4) throw new Error("RETRY_ATTEMPT_INVALID");
  if (retryAfterMs !== undefined && (!Number.isFinite(retryAfterMs) || retryAfterMs < 0)) throw new Error("RETRY_AFTER_INVALID");
  return Math.min(Math.max(500 * 2 ** attempt, retryAfterMs ?? 0), 30_000);
}

/** HTTP Retry-After resolves against a caller-sampled response time, never an implicit clock. */
export function parseRetryAfter(value: string | null, observedAtMs: number): number | undefined {
  validEpochMilliseconds(observedAtMs);
  if (!value || !value.trim()) return undefined;
  if (/^[0-9]+$/.test(value.trim())) {
    const milliseconds = Number(value) * 1000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : undefined;
  }
  // HTTP-date, not permissive JavaScript numeric or locale-specific date parsing.
  if (!/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} [0-9]{2}:[0-9]{2}:[0-9]{2} GMT$/.test(value)) return undefined;
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - observedAtMs) : undefined;
}
