export function computeBackoffDelay(attempt: number, retryAfterMs?: number | null): number {
  if (typeof retryAfterMs === "number" && retryAfterMs > 0) {
    return retryAfterMs;
  }
  const baseDelay = 500;
  const factor = Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 200);
  return Math.min(30_000, baseDelay * factor + jitter);
}

export function parseRetryAfter(retryAfterHeader: string | null, nowMs: number = Date.now()): number | null {
  if (!retryAfterHeader) return null;
  const trimmed = retryAfterHeader.trim();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10) * 1000;
  }
  const date = Date.parse(trimmed);
  if (!isNaN(date)) {
    return Math.max(0, date - nowMs);
  }
  return null;
}
