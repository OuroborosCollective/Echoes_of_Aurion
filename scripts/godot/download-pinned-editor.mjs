// Godot editor bootstrap only. Never part of Aurion's deterministic runtime.
const RETRYABLE_HTTP_STATUS = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

export async function fetchPinnedArchiveWithRetry(url, {
  fetcher = fetch,
  pause = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response;
    try {
      response = await fetcher(url, { signal: AbortSignal.timeout(120000) });
    } catch (error) {
      if (attempt === MAX_ATTEMPTS - 1) throw error;
      await pause(1000 * 2 ** attempt);
      continue;
    }
    if (response.ok && response.body) return response;
    if (!RETRYABLE_HTTP_STATUS.has(response.status) || attempt === MAX_ATTEMPTS - 1) {
      throw new Error(`Download failed: ${response.status}`);
    }
    // Release the failed HTTP response before the next bounded attempt.
    try { await response.body?.cancel?.(); } catch { /* HTTP error bodies are disposable. */ }
    await pause(1000 * 2 ** attempt);
  }
  throw new Error('Godot editor download attempts exhausted');
}
