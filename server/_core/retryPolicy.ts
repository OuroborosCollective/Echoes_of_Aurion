/** Deterministic transport scheduling. Provider Retry-After is an explicit input. */
export function computeBackoffDelay(attempt: number, retryAfterMs?: number): number {
  if (!Number.isSafeInteger(attempt) || attempt < 0 || attempt > 4) throw new Error("RETRY_ATTEMPT_INVALID");
  if (retryAfterMs !== undefined && (!Number.isFinite(retryAfterMs) || retryAfterMs < 0)) throw new Error("RETRY_AFTER_INVALID");
  return Math.min(Math.max(500 * 2 ** attempt, retryAfterMs ?? 0), 30_000);
}
